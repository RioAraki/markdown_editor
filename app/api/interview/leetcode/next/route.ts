import { NextResponse } from 'next/server';
import path from 'path';
import { format, isValid, parseISO } from 'date-fns';
import { loadInterviewPlan, loadLeetCode } from '@shared/interview/load';
import {
  currentTopic,
  dayProblemIds,
  problemUnitText,
  recommendProblems,
} from '@shared/interview/leetcode';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/** Continue the same two-new/one-review sequence as daily generation.
 * The saved day plus the client's unsaved IDs determine the whole-day ratio.
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
    const [{ bank, log }, plan] = await Promise.all([
      loadLeetCode(DATA_DIR),
      loadInterviewPlan(DATA_DIR),
    ]);
    // Keep the client's displayed order, including unsaved changes; include
    // other persisted blocks as a fallback for older clients.
    const exclude = new Set([
      ...(body.exclude ?? []),
      ...dayProblemIds(plan.logs[date]),
    ]);
    const count = Math.min(body.count ?? 1, 5);
    const courseOrder = plan.inventory.domains
      .filter((d) => d.id === 'leetcode')
      .flatMap((d) => d.modules)
      .flatMap((m) => m.items.map((it) => it.id));
    const topic = currentTopic(bank, log, date, courseOrder);
    const recs = recommendProblems({
      bank,
      log,
      itemId: topic?.itemId ?? null,
      courseOrder: topic
        ? courseOrder.slice(courseOrder.indexOf(topic.itemId))
        : undefined,
      count,
      today: date,
      exclude,
    });
    return NextResponse.json({
      mode: topic ? 'course' : 'random',
      topic: topic?.itemId,
      problems: recs.map((r) => ({
        id: r.problem.id,
        title: r.problem.title,
        url: r.problem.url,
        difficulty: r.problem.difficulty,
        item: r.problem.item,
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
