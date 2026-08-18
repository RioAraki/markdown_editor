import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { loadPlan, resolveDayPlan, weekOf } from '@/lib/interviewPlan';
import {
  computeTouchCounts,
  flattenInventory,
  loadInventory,
  loadMastery,
  suggestForTrack,
} from '@/lib/interviewInventory';
import { TodayPlanResponse } from '@/types/interview';

export async function GET() {
  try {
    const [plan, inventory, mastery, touches] = await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
    ]);

    const today = format(new Date(), 'yyyy-MM-dd');
    const suggestion = resolveDayPlan(plan, today);
    const week = weekOf(plan, today);

    const choices = flattenInventory(inventory, touches, mastery);

    // Auto-pick one inventory item per task slot, no repeats within the day.
    const used = new Set<string>();
    const suggestedItems: TodayPlanResponse['suggestedItems'] = {};
    for (const task of suggestion?.tasks ?? []) {
      const pick = suggestForTrack(choices, inventory, task.track, used);
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

    const response: TodayPlanResponse = {
      today,
      suggestion,
      templates: plan.templates ?? [],
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
