import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadPlan, resolveDayPlan, weekOf } from '@/lib/interviewPlan';
import {
  computeTouchCounts,
  flattenInventory,
  loadInventory,
  loadMastery,
  suggestForTrack,
} from '@/lib/interviewInventory';
import {
  loadInterviewPlan,
  loadLeetCode,
  loadQBank,
  loadPapers,
} from '@shared/interview/load';
import { parseProblemUnit } from '@shared/interview/leetcode';
import { parseQuestionUnit } from '@shared/interview/qbank';
import { recommendQuestions } from '@shared/interview/qbank';
import { carryOver, dayFromBlocks } from '@shared/interview/core';
import { recommendProblems } from '@shared/interview/leetcode';
import { TodayPlanResponse } from '@/types/interview';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

export async function GET(req: Request) {
  try {
    const [plan, inventory, mastery, touches, leetcode, qbank, fullPlan, papers] =
      await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
      loadLeetCode(DATA_DIR),
      loadQBank(DATA_DIR),
      loadInterviewPlan(DATA_DIR),
      loadPapers(DATA_DIR),
    ]);

    // itemId → the bank's own category name, so a 题库 slot bound to `qb-rag`
    // draws from "RAG 技术" and nothing else.
    const categoryOf: Record<string, string> = {};
    for (const d of inventory.domains) {
      for (const m of d.modules) {
        for (const it of m.items) if (it.category) categoryOf[it.id] = it.category;
      }
    }

    const today = format(new Date(), 'yyyy-MM-dd');

    // A day assembled by hand wins over the phase×weekday prescription — the
    // whole point of the catalog is that tonight's choice is yours.
    const picked = new URL(req.url).searchParams.get('blocks');
    const blockIds = picked ? picked.split(',').filter(Boolean) : [];
    const suggestion = blockIds.length
      ? dayFromBlocks(plan.blocks ?? [], blockIds, '自选')
      : resolveDayPlan(plan, today);
    const week = weekOf(plan, today);

    const choices = flattenInventory(inventory, touches, mastery);

    // Anything left unticked comes back before anything new is chosen.
    const pending = new Map(
      carryOver(fullPlan, today).map((c) => [c.taskName, c]),
    );

    // Auto-pick one inventory item per task slot, no repeats within the day.
    const used = new Set<string>();
    const suggestedItems: TodayPlanResponse['suggestedItems'] = {};
    for (const task of suggestion?.tasks ?? []) {
      // Resume the exact item you left unfinished rather than moving on.
      let resumeId = pending.get(task.name)?.itemId;

      // Papers advance on being *finished*, not on a day's checkbox: a paper
      // you read for an hour and ticked is still unread. So an unfinished one
      // outranks both the carry-over and a fresh pick — otherwise ticking the
      // slot each evening would quietly walk you down the reading list.
      if ((task.pool ?? []).includes('ai-papers')) {
        const started = Object.values(papers)
          .filter((d) => !d.finished && (d.sessions.length > 0 || d.stages.length > 0))
          .sort((a, b) => {
            const la = a.sessions[a.sessions.length - 1]?.date ?? '';
            const lb = b.sessions[b.sessions.length - 1]?.date ?? '';
            return la.localeCompare(lb);
          })[0];

        if (started && choices.some((c) => c.id === started.id)) {
          resumeId = started.id;
        } else if (resumeId && papers[resumeId]?.finished) {
          // Marked finished, so release the slot even though the day it was
          // scheduled still has an unticked box.
          resumeId = undefined;
        }

        // The reading list is chronological on purpose ("这一步解决了上一步什么
        // 问题"), so a fresh pick starts at the front rather than at whichever
        // one happens to be least-touched.
        if (!resumeId) {
          const next = (task.pool ?? []).includes('ai-papers')
            ? choices.find(
                (c) => c.moduleId === 'ai-papers' && !papers[c.id]?.finished,
              )
            : undefined;
          if (next) resumeId = next.id;
        }
      }

      const pick =
        (resumeId && choices.find((c) => c.id === resumeId)) ||
        suggestForTrack(choices, inventory, task.track, used, task.pool);
      if (pick) {
        used.add(pick.id);
        suggestedItems[task.name] = {
          resumedFrom: resumeId === pick.id ? pending.get(task.name)?.date : undefined,
          id: pick.id,
          title: pick.title,
          domainLabel: pick.domainLabel,
          moduleLabel: pick.moduleLabel,
          touches: pick.touches,
          how: pick.how,
          test: pick.test,
        };
      }
    }

    // For 刷题 slots, go one level deeper than the topic: pick the actual
    // problems, mixing overdue reviews with new ones from that topic.
    const usedProblems = new Set<number>();
    const suggestedProblems: TodayPlanResponse['suggestedProblems'] = {};
    for (const task of suggestion?.tasks ?? []) {
      if (task.track !== 'leetcode') continue;
      const recs = recommendProblems({
        bank: leetcode.bank,
        log: leetcode.log,
        // Deliberately not restricted to the slot's bound topic. Binding one
        // topic per day meant every problem drilled the same insight; the
        // recommender spreads across topics instead.
        itemId: null,
        count: Math.max(1, task.units),
        today,
        exclude: usedProblems,
      });
      for (const r of recs) usedProblems.add(r.problem.id);

      // Unfinished problems from the last session go back on the card first,
      // and take slots away from new ones rather than adding to the load.
      const resume = (pending.get(task.name)?.units ?? [])
        .map((u) => parseProblemUnit(u)?.id)
        .filter((id): id is number => typeof id === 'number')
        .map((id) => leetcode.bank.problems.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p);

      const carried = resume.map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        difficulty: p.difficulty,
        kind: 'new' as const,
        flagged: undefined,
        reason: `接着做 · ${pending.get(task.name)?.date} 排了没做`,
      }));
      const keep = recs
        .filter((r) => !resume.some((p) => p.id === r.problem.id))
        .slice(0, Math.max(0, Math.max(1, task.units) - carried.length));

      suggestedProblems[task.name] = [...carried, ...keep.map((r) => ({
        id: r.problem.id,
        title: r.problem.title,
        url: r.problem.url,
        difficulty: r.problem.difficulty,
        kind: r.kind,
        flagged: r.flagged,
        reason: r.reason,
      }))];
      for (const c of carried) usedProblems.add(c.id);
    }

    // Same idea one level down for 题库 slots: name the actual questions.
    const usedQuestions = new Set<string>();
    const suggestedQuestions: TodayPlanResponse['suggestedQuestions'] = {};
    for (const task of suggestion?.tasks ?? []) {
      if (!(task.pool ?? []).includes('ai-qbank')) continue;
      const itemId = suggestedItems[task.name]?.id;
      const recs = recommendQuestions({
        bank: qbank.bank,
        log: qbank.log,
        category: (itemId && categoryOf[itemId]) || null,
        count: Math.max(1, task.units),
        today,
        exclude: usedQuestions,
      });
      for (const r of recs) usedQuestions.add(r.question.id);

      const resumeQ = (pending.get(task.name)?.units ?? [])
        .map((u) => parseQuestionUnit(u)?.id)
        .filter((id): id is string => !!id)
        .map((id) => qbank.bank.questions.find((q) => q.id === id))
        .filter((q): q is NonNullable<typeof q> => !!q);

      const carriedQ = resumeQ.map((q) => ({
        id: q.id,
        question: q.question,
        category: q.category,
        url: q.url,
        kind: 'new' as const,
        reason: `接着答 · ${pending.get(task.name)?.date} 排了没答`,
      }));
      const keepQ = recs
        .filter((r) => !resumeQ.some((q) => q.id === r.question.id))
        .slice(0, Math.max(0, Math.max(1, task.units) - carriedQ.length));

      suggestedQuestions[task.name] = [
        ...carriedQ,
        ...keepQ.map((r) => ({
          id: r.question.id,
          question: r.question.question,
          category: r.question.category,
          url: r.question.url,
          kind: r.kind,
          reason: r.reason,
        })),
      ];
      for (const c of carriedQ) usedQuestions.add(c.id);
    }

    const response: TodayPlanResponse = {
      today,
      suggestedQuestions,
      suggestion,
      templates: plan.templates ?? [],
      suggestedProblems,
      week: week
        ? { n: week.n, theme: week.theme, phase: week.phase }
        : undefined,
      trackTypes: plan.trackTypes ?? {},
      suggestedItems,
      domains: inventory.domains.map((d) => ({
        id: d.id,
        emoji: d.emoji,
        label: d.label,
        track: d.track,
        rolling: d.rolling,
      })),
      choices: choices.map((c) => ({
        id: c.id,
        title: c.title,
        domainId: c.domainId,
        moduleId: c.moduleId,
        moduleLabel: c.moduleLabel,
        touches: c.touches,
        mastered: c.mastered,
      })),
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/interview/today:', error);
    return NextResponse.json(
      { error: 'Failed to load interview plan' },
      { status: 500 },
    );
  }
}
