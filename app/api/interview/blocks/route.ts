import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadInterviewPlan } from '@shared/interview/load';
import { blockStatuses } from '@shared/interview/core';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/**
 * The menu you assemble a day from: every block, plus how long it has been
 * since you actually did one.
 *
 * The staleness is the point. Picking what to work on tonight is easy when you
 * can see that 国内八股 has not been touched in three weeks.
 */
export async function GET() {
  try {
    const plan = await loadInterviewPlan(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');

    // module id → its label, so a block can name the part of the 总览 it feeds.
    // Without this the menu and the overview read as two unrelated lists.
    const moduleLabel: Record<string, string> = {};
    for (const d of plan.inventory.domains) {
      for (const m of d.modules) moduleLabel[m.id] = m.label;
    }
    return NextResponse.json({
      today,
      trackTypes: plan.trackTypes ?? {},
      presets: plan.presets ?? [],
      blocks: blockStatuses(plan, today).map((s) => ({
        ...s.block,
        covers: (s.block.pool ?? [])
          .map((id) => moduleLabel[id])
          .filter((x): x is string => !!x),
        lastDate: s.lastDate,
        daysSince: s.daysSince,
        times: s.times,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/interview/blocks:', error);
    return NextResponse.json(
      { error: 'Failed to load blocks' },
      { status: 500 },
    );
  }
}
