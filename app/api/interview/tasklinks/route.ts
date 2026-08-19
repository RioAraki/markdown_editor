import { NextResponse } from 'next/server';
import path from 'path';
import { loadPlan } from '@/lib/interviewPlan';
import { loadLeetCode } from '@shared/interview/load';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/**
 * Direct links for the day card: one per task name (题库站、LeetCode…) and one
 * per problem id (its real problem page rather than a search URL).
 *
 * A day file only carries text, so the editor can't know where a slot's work
 * actually lives — this fills that in without bloating the markdown.
 */
export async function GET() {
  try {
    const [plan, { bank }] = await Promise.all([
      loadPlan(),
      loadLeetCode(DATA_DIR),
    ]);

    const tasks: Record<string, string> = {};
    const days = [
      ...(plan.templates ?? []),
      ...Object.values(plan.dayOverrides ?? {}),
    ];
    for (const d of days) {
      for (const t of d.tasks ?? []) {
        if (t.url && !tasks[t.name]) tasks[t.name] = t.url;
      }
    }

    const problems: Record<number, string> = {};
    for (const p of bank.problems) problems[p.id] = p.url;

    return NextResponse.json({ tasks, problems });
  } catch (error) {
    console.error('Error in GET /api/interview/tasklinks:', error);
    return NextResponse.json({ tasks: {}, problems: {} });
  }
}
