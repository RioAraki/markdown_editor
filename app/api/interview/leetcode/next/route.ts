import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadLeetCode } from '@shared/interview/load';
import {
  allProblemStates,
  problemUnitText,
  recommendProblems,
} from '@shared/interview/leetcode';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/**
 * One more problem, for a day with time to spare.
 *
 * Body: `{ exclude: number[], topics?: string[] }` — the problems already on
 * today's card and the topics they cover, so the extra one neither repeats a
 * problem nor piles onto a pattern already drilled today.
 */
export async function POST(req: Request) {
  try {
    const body: { exclude?: number[]; topics?: string[]; count?: number } =
      await req.json().catch(() => ({}));

    const { bank, log } = await loadLeetCode(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');
    const exclude = new Set(body.exclude ?? []);
    const count = Math.min(Math.max(body.count ?? 1, 1), 5);

    // An extra problem should clear a redo you flagged yourself before it goes
    // looking for new material — that flag is the strongest signal there is.
    // Otherwise the bonus problem is new, which is the point of extra time.
    const flaggedWaiting = allProblemStates(bank, log, today).some(
      (s) => s.redo && !s.stale && s.status === 'due' && !exclude.has(s.problem.id),
    );

    const recs = recommendProblems({
      bank,
      log,
      itemId: null, // pick across every topic
      count,
      today,
      exclude,
      // Derive the topics to avoid from the problems already on the card. The
      // client only knows topic *titles*, and the recommender keys on item
      // ids — passing the former silently matched nothing.
      avoidTopics: new Set(
        bank.problems
          .filter((p) => exclude.has(p.id))
          .map((p) => p.item)
          .filter((x): x is string => !!x),
      ),
      reviewQuota: flaggedWaiting ? 1 : 0,
    });

    return NextResponse.json({
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
