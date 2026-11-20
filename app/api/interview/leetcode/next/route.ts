import { resolveServerPaths } from '@/lib/serverPaths';
import { NextResponse } from 'next/server';
import { format, isValid, parseISO } from 'date-fns';
import { loadInterviewPlan } from '@shared/interview/load';
import { dayProblemIds, problemUnitText } from '@shared/interview/leetcode';
import { recommendAdaptive } from '@shared/interview/adaptive';
import { loadLeetCodeModel } from '@/lib/leetcodeModel';

const DATA_DIR = resolveServerPaths().interviewData;

/** One more problem by the same ability-driven rule as daily generation.
 * The saved day plus the client's unsaved IDs count as already planned.
 */
export async function POST(req: Request) {
  try {
    const body: { exclude?: number[]; count?: number; date?: string } =
      await req.json().catch(() => ({}));
    const date = body.date ?? format(new Date(), 'yyyy-MM-dd');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parseISO(date))) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    if ((body.exclude !== undefined && (!Array.isArray(body.exclude) ||
        !body.exclude.every((id) => Number.isSafeInteger(id) && id > 0))) ||
        (body.count !== undefined && (!Number.isInteger(body.count) || body.count < 1))) {
      return NextResponse.json({ error: 'Invalid problem IDs or count' }, { status: 400 });
    }
    const [model, plan] = await Promise.all([
      loadLeetCodeModel(DATA_DIR, date),
      loadInterviewPlan(DATA_DIR),
    ]);
    // Keep the client's displayed order, including unsaved changes; include
    // other persisted blocks as a fallback for older clients.
    const exclude = new Set([
      ...(body.exclude ?? []),
      ...dayProblemIds(plan.logs[date]),
    ]);
    const count = Math.min(body.count ?? 1, 5);
    const recs = recommendAdaptive({
      bank: model.bank,
      log: model.log,
      ability: model.ability,
      solved: model.solved,
      count,
      today: date,
      exclude,
    });
    return NextResponse.json({
      mode: 'adaptive',
      problems: recs.map((r) => ({
        id: r.problem.id,
        title: r.problem.title,
        url: r.problem.url,
        difficulty: r.problem.difficulty,
        item: r.problem.item,
        topic: r.topic,
        rating: r.problem.rating,
        kind: r.kind,
        flagged: r.flagged,
        reason: r.reason,
        unitText: problemUnitText(r.problem),
      })),
    });
  } catch (error) {
    console.error('Error in POST /api/interview/leetcode/next:', error);
    return NextResponse.json({ error: 'Failed to pick another problem' }, { status: 500 });
  }
}
