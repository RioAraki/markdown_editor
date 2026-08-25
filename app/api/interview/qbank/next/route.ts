import { NextResponse } from 'next/server';
import path from 'path';
import { format } from 'date-fns';
import { loadQBank } from '@shared/interview/load';
import { questionUnitText, recommendQuestions } from '@shared/interview/qbank';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

/**
 * One more question, for a slot with time to spare.
 *
 * Body: `{ exclude?: string[], bankId?: string, category?: string, count?: number }`.
 * `bankId` is required in practice: the banks are merged behind one endpoint,
 * and without it a Python slot draws from the Agent bank.
 */
export async function POST(req: Request) {
  try {
    const body: {
      exclude?: string[];
      category?: string;
      bankId?: string;
      count?: number;
    } =
      await req.json().catch(() => ({}));

    const { bank, log } = await loadQBank(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');

    const recs = recommendQuestions({
      bank,
      log,
      category: body.category ?? null,
      bankId: body.bankId ?? null,
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
