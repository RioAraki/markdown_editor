import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { loadQBank } from '@shared/interview/load';
import type { Question, QuestionBank } from '@shared/interview/qbank';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const BANK_PATH = path.join(DATA_DIR, 'agent-qbank.json');
const SITE =
  process.env.QBANK_SITE || 'https://1oxo1zqi.sc.monkeycode-ai.online/';

interface UpstreamQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
  question_en?: string;
  answer_en?: string;
  category_en?: string;
  source?: string;
}

/**
 * Re-pull the question bank from the practice site.
 *
 * Additive by design: questions are added and their text refreshed, but a
 * question that vanished upstream stays in the local mirror, because you may
 * have an archive file pointing at it. Your answers are never touched — they
 * live in `qbank/*.md`, which this never opens.
 */
export async function POST() {
  try {
    const res = await fetch(new URL('questions.json', SITE), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const up: {
      source?: string;
      commit?: string;
      license?: string;
      questions: UpstreamQuestion[];
    } = await res.json();

    const { bank } = await loadQBank(DATA_DIR);
    const existing = new Map(bank.questions.map((q) => [q.id, q]));

    const added: string[] = [];
    const changed: string[] = [];
    for (const q of up.questions) {
      const url = `${SITE}practice.html#question=${encodeURIComponent(q.question)}`;
      const next: Question = {
        id: q.id,
        category: q.category,
        question: q.question,
        answer: q.answer,
        questionEn: q.question_en ?? null,
        answerEn: q.answer_en ?? null,
        categoryEn: q.category_en ?? null,
        sourceFile: q.source ?? null,
        url,
      };
      const prev = existing.get(q.id);
      if (!prev) added.push(q.id);
      else if (prev.question !== next.question || prev.answer !== next.answer) {
        changed.push(q.id);
      }
      existing.set(q.id, next);
    }

    const merged: QuestionBank = {
      source: up.source ?? bank.source,
      commit: up.commit ?? bank.commit,
      license: up.license ?? bank.license,
      site: SITE,
      questions: [...existing.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
    await fs.writeFile(
      BANK_PATH,
      JSON.stringify(merged, null, 2) + '\n',
      'utf-8',
    );

    return NextResponse.json({
      total: merged.questions.length,
      added,
      changed,
      commit: merged.commit,
    });
  } catch (error) {
    console.error('Error in POST /api/interview/qbank/sync:', error);
    return NextResponse.json({ error: 'Failed to sync qbank' }, { status: 500 });
  }
}
