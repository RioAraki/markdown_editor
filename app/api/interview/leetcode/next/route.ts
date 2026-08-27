import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadInterviewPlan, loadLeetCode } from '@shared/interview/load';
import {
  allProblemStates,
  currentTopic,
  problemUnitText,
  recommendProblems,
} from '@shared/interview/leetcode';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/**
 * One more problem, for a day with time to spare.
 *
 * Body: `{ exclude: number[], count?: number }` — the problems already on
 * today's card.
 *
 * An extra problem obeys the same rule as a scheduled one: while the course is
 * unfinished it comes from the knowledge point currently being drilled, in that
 * point's order. Spreading it across topics is exactly what the course exists
 * to stop — an eleventh problem from a topic you have not passed is worth more
 * than a first problem from one you have not started.
 */
export async function POST(req: Request) {
  try {
    const body: { exclude?: number[]; count?: number } =
      await req.json().catch(() => ({}));

    const [{ bank, log }, plan] = await Promise.all([
      loadLeetCode(DATA_DIR),
      loadInterviewPlan(DATA_DIR),
    ]);
    const today = format(new Date(), 'yyyy-MM-dd');
    const exclude = new Set(body.exclude ?? []);
    const count = Math.min(Math.max(body.count ?? 1, 1), 5);

    const courseOrder = plan.inventory.domains
      .filter((d) => d.id === 'leetcode')
      .flatMap((d) => d.modules)
      .flatMap((m) => m.items.map((it) => it.id));
    const topic = currentTopic(bank, log, today, courseOrder);

    // A redo you flagged yourself still outranks new ground — but it has to be
    // from the topic under study, or it would pull the day off the course.
    const flaggedWaiting = allProblemStates(bank, log, today).some(
      (s) =>
        s.redo &&
        !s.stale &&
        s.status === 'due' &&
        !exclude.has(s.problem.id) &&
        (!topic || s.problem.item === topic.itemId),
    );

    const recs = recommendProblems({
      bank,
      log,
      itemId: topic?.itemId ?? null,
      count,
      today,
      exclude,
      // Only meaningful in the random phase, where `itemId` is null: there the
      // extra problem should not repeat a pattern already drilled today. Inside
      // a course topic every problem is that topic, so it must stay empty.
      avoidTopics: topic
        ? new Set<string>()
        : new Set(
            bank.problems
              .filter((p) => exclude.has(p.id))
              .map((p) => p.item)
              .filter((x): x is string => !!x),
          ),
      reviewQuota: flaggedWaiting ? 1 : 0,
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
    return NextResponse.json(
      { error: 'Failed to pick another problem' },
      { status: 500 },
    );
  }
}
