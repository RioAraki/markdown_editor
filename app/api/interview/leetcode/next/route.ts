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
 * An extra problem obeys the same rules as a scheduled one: new material comes
 * from the knowledge point currently being drilled, in that point's order, and
 * the old-to-new ratio is judged across the **whole day** rather than per
 * request. Judging one request on its own made every extra problem a redo —
 * with a single slot and any flagged problem waiting, the redo always won.
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

    // How much of today is already redo. The ratio is 1:3, so a sixth problem
    // is new material unless the day is genuinely short on review.
    const flaggedWaiting = allProblemStates(bank, log, today).some(
      // Not scoped to the current topic: redo and curriculum are separate
      // systems, so a flag left behind in 链表 is still due while you are on
      // 二分.
      (s) => s.redo && !s.stale && s.status === 'due' && !exclude.has(s.problem.id),
    );

    // Roughly one old for every three new, measured over the day as a whole.
    const states = allProblemStates(bank, log, today);
    const redosSoFar = states.filter(
      (st) =>
        exclude.has(st.problem.id) && st.status === 'due' && !st.stale,
    ).length;
    const wantRedos = Math.round((exclude.size + count) / 4);

    const recs = recommendProblems({
      bank,
      log,
      itemId: topic?.itemId ?? null,
      courseOrder: topic
        ? courseOrder.slice(courseOrder.indexOf(topic.itemId))
        : undefined,
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
      // Same 1:3 as the daily slot — one extra problem is new material
      // unless something flagged has actually come due, in which case it is
      // that. Asking for more work should not mean only ever new work.
      reviewQuota: flaggedWaiting && redosSoFar < wantRedos ? 1 : 0,
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
