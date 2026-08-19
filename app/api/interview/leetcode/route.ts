import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { loadLeetCode } from '@shared/interview/load';
import {
  Attempt,
  LeetCodeLog,
  OUTCOME_ORDER,
  Outcome,
  allProblemStates,
  reviewDebt,
} from '@shared/interview/leetcode';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const LOG_PATH = path.join(DATA_DIR, 'leetcode-log.json');

/** Bank + attempt log + derived per-problem state. */
export async function GET() {
  try {
    const { bank, log } = await loadLeetCode(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');
    return NextResponse.json({
      bank,
      log,
      states: allProblemStates(bank, log, today),
      debt: reviewDebt(bank, log, today),
      today,
    });
  } catch (error) {
    console.error('Error in GET /api/interview/leetcode:', error);
    return NextResponse.json(
      { error: 'Failed to load leetcode data' },
      { status: 500 },
    );
  }
}

/**
 * Record how an attempt went. Body: `{ problemId, outcome, date?, note? }`.
 * Re-recording the same problem on the same date replaces that attempt rather
 * than stacking duplicates — you change your mind while the page is open.
 */
export async function PUT(req: Request) {
  try {
    const body: {
      problemId?: number;
      outcome?: Outcome | null;
      date?: string;
      note?: string;
    } = await req.json();

    if (typeof body.problemId !== 'number') {
      return NextResponse.json(
        { error: 'problemId must be a number' },
        { status: 400 },
      );
    }
    const date = body.date ?? format(new Date(), 'yyyy-MM-dd');
    const key = String(body.problemId);

    const { log } = await loadLeetCode(DATA_DIR);
    const store: LeetCodeLog = { ...log };
    const entry = { attempts: [...(store[key]?.attempts ?? [])] };

    // Drop any attempt already recorded for this date, then re-add if set.
    entry.attempts = entry.attempts.filter((a) => a.date !== date);
    if (body.outcome && OUTCOME_ORDER.includes(body.outcome)) {
      const attempt: Attempt = { date, outcome: body.outcome };
      if (body.note) attempt.note = body.note;
      entry.attempts.push(attempt);
    }
    entry.attempts.sort((a, b) => a.date.localeCompare(b.date));

    if (entry.attempts.length > 0) store[key] = entry;
    else delete store[key];

    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.writeFile(
      LOG_PATH,
      JSON.stringify(store, null, 2) + '\n',
      'utf-8',
    );

    const { bank } = await loadLeetCode(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');
    return NextResponse.json({
      log: store,
      states: allProblemStates(bank, store, today),
      debt: reviewDebt(bank, store, today),
    });
  } catch (error) {
    console.error('Error in PUT /api/interview/leetcode:', error);
    return NextResponse.json(
      { error: 'Failed to record attempt' },
      { status: 500 },
    );
  }
}
