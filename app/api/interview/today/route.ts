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
  loadStories,
} from '@shared/interview/load';
import { parseProblemUnit } from '@shared/interview/leetcode';
import { parseQuestionUnit } from '@shared/interview/qbank';
import { recommendQuestions } from '@shared/interview/qbank';
import { carryOver, dayFromBlocks } from '@shared/interview/core';
import {
  pickQuestions as pickStoryQuestions,
  questionUnitText as storyUnitText,
} from '@shared/interview/stories';
import {
  MIN_REPEAT_DAYS,
  currentTopic,
  recommendProblems,
} from '@shared/interview/leetcode';
import { TodayPlanResponse } from '@/types/interview';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

export async function GET(req: Request) {
  try {
    const [plan, inventory, mastery, touches, leetcode, qbank, fullPlan, papers, stories] =
      await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
      loadLeetCode(DATA_DIR),
      loadQBank(DATA_DIR),
      loadInterviewPlan(DATA_DIR),
      loadPapers(DATA_DIR),
      loadStories(DATA_DIR),
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

      // 刷题 follows the course, not the least-touched heuristic.
      if (task.track === 'leetcode') {
        const t = currentTopic(
          leetcode.bank,
          leetcode.log,
          today,
          inventory.domains
            .filter((d) => d.id === 'leetcode')
            .flatMap((d) => d.modules)
            .flatMap((m) => m.items.map((it) => it.id)),
        );
        if (t) resumeId = t.itemId;
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
    // The course order, straight off the inventory — 阶段一 first, and each
    // stage's points in the order they were laid out.
    const courseOrder = inventory.domains
      .filter((d) => d.id === 'leetcode')
      .flatMap((d) => d.modules)
      .flatMap((m) => m.items.map((it) => it.id));
    const topic = currentTopic(leetcode.bank, leetcode.log, today, courseOrder);

    for (const task of suggestion?.tasks ?? []) {
      if (task.track !== 'leetcode') continue;
      const recs = recommendProblems({
        bank: leetcode.bank,
        log: leetcode.log,
        // One knowledge point at a time until the course is done; null after
        // that, which is the random phase.
        itemId: topic?.itemId ?? null,
        count: Math.max(1, task.units),
        today,
        exclude: usedProblems,
      });
      for (const r of recs) usedProblems.add(r.problem.id);

      // Unfinished problems from the last session go back on the card first,
      // and take slots away from new ones rather than adding to the load.
      //
      // "Unfinished" means the day file's box is unticked — but that box never
      // gets ticked retroactively when the problem is solved on a later day, so
      // it must be cross-checked against the attempt log. Without this, a stale
      // unticked line from last Friday keeps re-scheduling a problem you have
      // since finished.
      const resume = (pending.get(task.name)?.units ?? [])
        .map((u) => parseProblemUnit(u)?.id)
        .filter((id): id is number => typeof id === 'number')
        .filter((id) => {
          const last = (leetcode.log[String(id)]?.attempts ?? []).at(-1);
          if (!last) return true;
          const gap = Math.round(
            (Date.parse(`${today}T00:00:00`) - Date.parse(`${last.date}T00:00:00`)) /
              86_400_000,
          );
          return gap >= MIN_REPEAT_DAYS;
        })
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
    // item id → bank category, and back again: the slot's category follows the
    // questions, not the other way round.
    const itemOfCategory: Record<string, string> = {};
    for (const [id, cat] of Object.entries(categoryOf)) itemOfCategory[cat] = id;

    for (const task of suggestion?.tasks ?? []) {
      const isPy = (task.pool ?? []).some((x) => x.startsWith('py-'));
      if (!isPy && !(task.pool ?? []).includes('ai-qbank')) continue;
      // Deliberately not restricted to the slot's category. Unlike LeetCode
      // topics, which are interchangeable, this bank is written 由浅入深 as one
      // sequence — 基础概念 before 核心框架 before RAG. Binding a category first
      // meant jumping to Prompt 工程 while 基础概念 still had five unanswered.
      const recs = recommendQuestions({
        bank: qbank.bank,
        log: qbank.log,
        // Each bank walks its own list in order; they never interleave.
        bankId: isPy ? 'python' : 'agent',
        category: null,
        count: Math.max(1, task.units),
        today,
        exclude: usedQuestions,
      });

      // Whatever the questions turned out to be decides what the slot is about.
      const cat = recs[0]?.question.category;
      const boundId = cat ? itemOfCategory[cat] : undefined;
      const bound = boundId ? choices.find((c) => c.id === boundId) : undefined;
      if (bound) {
        suggestedItems[task.name] = {
          id: bound.id,
          title: bound.title,
          domainLabel: bound.domainLabel,
          moduleLabel: bound.moduleLabel,
          touches: bound.touches,
          how: bound.how,
          test: bound.test,
        };
        used.add(bound.id);
      }
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

    // 简历深挖 slots: the front-line cluster decides both the questions and
    // which inventory item the slot binds to. Sprint order, never random.
    const suggestedStories: TodayPlanResponse['suggestedStories'] = {};
    for (const task of suggestion?.tasks ?? []) {
      if (!(task.pool ?? []).some((x) => x.startsWith('rs-'))) continue;
      const picks = pickStoryQuestions(
        stories.bank,
        stories.answers,
        Math.max(1, task.units),
      );
      if (picks.length === 0) continue;

      // Bind the slot to the cluster the questions came from, so the day log
      // reads "简历深挖 · eval 与质量" rather than a project-level label.
      const bound = choices.find((c) => c.id === picks[0].cluster.id);
      if (bound) {
        suggestedItems[task.name] = {
          id: bound.id,
          title: bound.title,
          domainLabel: bound.domainLabel,
          moduleLabel: bound.moduleLabel,
          touches: bound.touches,
          how: bound.how,
          test: bound.test,
        };
        used.add(bound.id);
      }
      suggestedStories[task.name] = picks.map((pk) => ({
        id: pk.question.id,
        storyId: pk.story.id,
        storyTitle: pk.story.title,
        clusterTitle: pk.cluster.title,
        q: pk.question.q,
        tests: pk.question.tests,
        lens: pk.question.lens,
        p: pk.question.p,
        status: pk.answer?.status ?? 'todo',
        grade: pk.answer?.grade,
        reason: pk.reason,
        unitText: storyUnitText(pk.story, pk.question),
      }));
    }

    const response: TodayPlanResponse = {
      today,
      suggestedQuestions,
      suggestedStories,
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
