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
import { loadLeetCode, loadQBank } from '@shared/interview/load';
import { recommendQuestions } from '@shared/interview/qbank';
import { dayFromBlocks } from '@shared/interview/core';
import { recommendProblems } from '@shared/interview/leetcode';
import { TodayPlanResponse } from '@/types/interview';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

export async function GET(req: Request) {
  try {
    const [plan, inventory, mastery, touches, leetcode, qbank] = await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
      loadLeetCode(DATA_DIR),
      loadQBank(DATA_DIR),
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

    // Auto-pick one inventory item per task slot, no repeats within the day.
    const used = new Set<string>();
    const suggestedItems: TodayPlanResponse['suggestedItems'] = {};
    for (const task of suggestion?.tasks ?? []) {
      const pick = suggestForTrack(
        choices,
        inventory,
        task.track,
        used,
        task.pool,
      );
      if (pick) {
        used.add(pick.id);
        suggestedItems[task.name] = {
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
        itemId: suggestedItems[task.name]?.id ?? null,
        count: Math.max(1, task.units),
        today,
        exclude: usedProblems,
      });
      for (const r of recs) usedProblems.add(r.problem.id);
      suggestedProblems[task.name] = recs.map((r) => ({
        id: r.problem.id,
        title: r.problem.title,
        url: r.problem.url,
        difficulty: r.problem.difficulty,
        kind: r.kind,
        flagged: r.flagged,
        reason: r.reason,
      }));
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
      suggestedQuestions[task.name] = recs.map((r) => ({
        id: r.question.id,
        question: r.question.question,
        category: r.question.category,
        url: r.question.url,
        kind: r.kind,
        reason: r.reason,
      }));
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
