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
import { loadLeetCode } from '@shared/interview/load';
import { recommendProblems } from '@shared/interview/leetcode';
import { TodayPlanResponse } from '@/types/interview';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

export async function GET() {
  try {
    const [plan, inventory, mastery, touches, leetcode] = await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
      loadLeetCode(DATA_DIR),
    ]);

    const today = format(new Date(), 'yyyy-MM-dd');
    const suggestion = resolveDayPlan(plan, today);
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

    const response: TodayPlanResponse = {
      today,
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
