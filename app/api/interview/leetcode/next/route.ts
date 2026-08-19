import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadLeetCode } from '@shared/interview/load';
import { problemUnitText, recommendProblems } from '@shared/interview/leetcode';

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

    const recs = recommendProblems({
      bank,
      log,
      itemId: null, // pick across every topic
      count: Math.min(Math.max(body.count ?? 1, 1), 5),
      today,
      exclude: new Set(body.exclude ?? []),
      avoidTopics: new Set(body.topics ?? []),
      // An extra problem is for extra learning, so bias hard to new material.
      reviewQuota: 0,
    });

    return NextResponse.json({
      problems: recs.map((r) => ({
        id: r.problem.id,
        title: r.problem.title,
        url: r.problem.url,
        difficulty: r.problem.difficulty,
        item: r.problem.item,
        kind: r.kind,
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
