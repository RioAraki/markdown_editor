import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { loadQBank } from '@shared/interview/load';
import { allQuestionStates, qbankDebt } from '@shared/interview/qbank';
import {
  newQuestionDoc,
  parseQuestionDoc,
  serializeQuestionDoc,
} from '@shared/interview/qbankDoc';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const QBANK_DIR = path.join(DATA_DIR, 'qbank');

const docPath = (id: string) => path.join(QBANK_DIR, `${id}.md`);

/** Bank + your archive + derived state. */
export async function GET() {
  try {
    const { bank, log } = await loadQBank(DATA_DIR);
    const today = format(new Date(), 'yyyy-MM-dd');
    return NextResponse.json({
      bank,
      log,
      states: allQuestionStates(bank, log, today),
      debt: qbankDebt(bank, log, today),
      today,
    });
  } catch (error) {
    console.error('Error in GET /api/interview/qbank:', error);
    return NextResponse.json({ error: 'Failed to load qbank' }, { status: 500 });
  }
}

/**
 * Record an answer and/or the redo flag for one question.
 *
 * Body: `{ id, answer?, redo?, redoReason?, date? }`.
 *
 * Answering twice on the same date replaces that day's section — you edit
 * while the page is open. Answering on a new date appends, so the file keeps
 * the whole history rather than overwriting what you thought last month.
 */
export async function PUT(req: Request) {
  try {
    const body: {
      id?: string;
      answer?: string;
      redo?: boolean;
      redoReason?: string;
      date?: string;
    } = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const date = body.date ?? format(new Date(), 'yyyy-MM-dd');
    const { bank } = await loadQBank(DATA_DIR);
    const question = bank.questions.find((q) => q.id === body.id);
    if (!question) {
      return NextResponse.json({ error: 'unknown question id' }, { status: 404 });
    }

    const file = docPath(body.id);
    let doc = await fs
      .readFile(file, 'utf-8')
      .then(parseQuestionDoc)
      .catch(() => null);
    if (!doc) doc = newQuestionDoc(question);

    // Keep the bank's text authoritative — it may have been corrected upstream.
    doc.question = question.question;
    doc.reference = question.answer;
    doc.category = question.category;
    doc.url = question.url;

    if (typeof body.answer === 'string') {
      const text = body.answer.trim();
      const previous = doc.answers[doc.answers.length - 1]?.date;
      doc.answers = doc.answers.filter((a) => a.date !== date);
      if (text) doc.answers.push({ date, text });
      doc.answers.sort((a, b) => a.date.localeCompare(b.date));

      // Answering on a later day IS the redo, so the flag clears itself.
      // Editing the same day's answer leaves it alone — you are still on the
      // sitting that earned the flag.
      if (text && previous && date > previous) {
        doc.redo = false;
        doc.redoReason = undefined;
      }
    }
    if (typeof body.redo === 'boolean') doc.redo = body.redo;
    if (typeof body.redoReason === 'string') {
      doc.redoReason = body.redoReason.trim() || undefined;
    }
    if (!doc.redo) doc.redoReason = undefined;

    // Nothing written and nothing flagged: don't leave an empty file behind.
    if (doc.answers.length === 0 && !doc.redo && !doc.notes) {
      await fs.rm(file, { force: true });
      return NextResponse.json({ id: body.id, removed: true });
    }

    await fs.mkdir(QBANK_DIR, { recursive: true });
    await fs.writeFile(file, serializeQuestionDoc(doc), 'utf-8');
    return NextResponse.json({ id: body.id, doc, file });
  } catch (error) {
    console.error('Error in PUT /api/interview/qbank:', error);
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 });
  }
}
