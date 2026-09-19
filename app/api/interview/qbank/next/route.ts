import { resolveServerPaths } from '@/lib/serverPaths';
import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { loadPlan } from '@/lib/interviewPlan';
import { loadQBank } from '@shared/interview/load';
import { bankIdForPool, questionUnitText, recommendQuestions } from '@shared/interview/qbank';

const DATA_DIR = resolveServerPaths().interviewData;

/**
 * One more question, for a slot with time to spare.
 *
 * Body: `{ blockName?: string, exclude?: string[], bankId?: string,
 *          category?: string, count?: number }`.
 *
 * Which bank to draw from is decided **here**, from the block's own `pool` in
 * plan.json — not from whatever the caller guessed. The client used to infer it
 * from the ids already on the card, which fails in three ways: an empty slot has
 * nothing to infer from, a client running older code infers wrongly, and nothing
 * downstream checks the answer. All three happened at once on 2026-09-19: a
 * browser still holding the pre-deploy bundle had no `qt` branch, so every
 * `qta-…` card read as `agent` and three Agent questions were appended to the
 * 数理统计 slot. Deciding server-side closes the window, because a stale client
 * cannot reach a conclusion the server does not agree with.
 *
 * `bankId` in the body is now only a fallback for callers that send no block
 * name, and it is overridden whenever the block resolves.
 */
export async function POST(req: Request) {
  try {
    const body: {
      blockName?: string;
      exclude?: string[];
      category?: string;
      bankId?: string;
      count?: number;
    } =
      await req.json().catch(() => ({}));

    const { bank, log } = await loadQBank(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');

    // The block names its pool, the pool names the bank. A block that resolves
    // wins over the body outright — that is the whole point of this endpoint
    // knowing about the plan.
    let bankId = body.bankId ?? null;
    if (body.blockName) {
      const plan = await loadPlan();
      const block = (plan.blocks ?? []).find((b) => b.name === body.blockName);
      const resolved = block ? bankIdForPool(block.pool ?? []) : null;
      if (resolved) bankId = resolved;
    }

    const recs = recommendQuestions({
      bank,
      log,
      category: body.category ?? null,
      bankId,
      count: Math.min(Math.max(body.count ?? 1, 1), 5),
      today,
      exclude: new Set(body.exclude ?? []),
      // These banks are walked front to back, so an extra question is simply
      // the next unanswered one — no redo injected, nothing random. The daily
      // slot already carries the one redo per day.
      redoQuota: 0,
    });

    return NextResponse.json({
      questions: recs.map((r) => ({
        id: r.question.id,
        question: r.question.question,
        category: r.question.category,
        url: r.question.url,
        kind: r.kind,
        reason: r.reason,
        unitText: questionUnitText(r.question),
      })),
    });
  } catch (error) {
    console.error('Error in POST /api/interview/qbank/next:', error);
    return NextResponse.json(
      { error: 'Failed to pick another question' },
      { status: 500 },
    );
  }
}
