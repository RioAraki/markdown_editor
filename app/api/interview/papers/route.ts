import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { loadInterviewPlan, loadPapers } from '@shared/interview/load';
import {
  PAPER_STAGES,
  PaperStage,
  newPaperDoc,
  serializePaperDoc,
} from '@shared/interview/paperDoc';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const PAPERS_DIR = path.join(DATA_DIR, 'papers');

/**
 * Every paper in the reading list, whether or not it has been opened.
 *
 * The inventory owns the list and its titles; this route only adds what you
 * have written, so adding a paper upstream never needs a file created here.
 */
export async function GET() {
  try {
    const [plan, docs] = await Promise.all([
      loadInterviewPlan(DATA_DIR),
      loadPapers(DATA_DIR),
    ]);

    const list: { id: string; title: string }[] = [];
    for (const d of plan.inventory.domains) {
      for (const m of d.modules) {
        if (m.id !== 'ai-papers') continue;
        for (const it of m.items) list.push({ id: it.id, title: it.title });
      }
    }

    return NextResponse.json({
      papers: list.map((p) => docs[p.id] ?? newPaperDoc(p.id, p.title)),
      ids: list.map((p) => p.id),
    });
  } catch (error) {
    console.error('Error in GET /api/interview/papers:', error);
    return NextResponse.json({ papers: [], ids: [] });
  }
}

/**
 * Write to one paper.
 *
 * Body: `{ id, stages?, bookmark?, finished?, summary?, session? }`.
 * A `session` for a date that already has one replaces it — you keep typing
 * into the same sitting — while a new date appends, so the reading history
 * stays intact.
 */
export async function PUT(req: Request) {
  try {
    const body: {
      id?: string;
      title?: string;
      stages?: string[];
      bookmark?: string;
      finished?: boolean;
      summary?: string;
      session?: { date?: string; minutes?: number; stoppedAt?: string; notes?: string };
    } = await req.json();

    if (!body.id || !/^[\w-]+$/.test(body.id)) {
      return NextResponse.json({ error: 'bad paper id' }, { status: 400 });
    }

    const [plan, docs] = await Promise.all([
      loadInterviewPlan(DATA_DIR),
      loadPapers(DATA_DIR),
    ]);
    const known = plan.inventory.domains
      .flatMap((d) => d.modules)
      .filter((m) => m.id === 'ai-papers')
      .flatMap((m) => m.items)
      .find((it) => it.id === body.id);

    const doc =
      docs[body.id] ?? newPaperDoc(body.id, known?.title ?? body.title ?? body.id);
    if (known) doc.title = known.title;

    if (Array.isArray(body.stages)) {
      doc.stages = body.stages.filter((s): s is PaperStage =>
        PAPER_STAGES.includes(s as PaperStage),
      );
    }
    if (typeof body.bookmark === 'string') {
      doc.bookmark = body.bookmark.trim() || undefined;
    }
    if (typeof body.finished === 'boolean') doc.finished = body.finished;
    if (typeof body.summary === 'string') {
      doc.summary = body.summary.trim() || undefined;
    }

    if (body.session) {
      const date = body.session.date ?? format(new Date(), 'yyyy-MM-dd');
      const notes = (body.session.notes ?? '').trim();
      doc.sessions = doc.sessions.filter((s) => s.date !== date);
      if (notes || body.session.stoppedAt || body.session.minutes) {
        doc.sessions.push({
          date,
          minutes: body.session.minutes,
          stoppedAt: body.session.stoppedAt?.trim() || undefined,
          notes,
        });
      }
      doc.sessions.sort((a, b) => a.date.localeCompare(b.date));

      // Where you stopped IS where you resume — keep the bookmark in step
      // rather than making it a second thing to remember to update.
      const last = doc.sessions[doc.sessions.length - 1];
      if (typeof body.bookmark !== 'string' && last?.stoppedAt) {
        doc.bookmark = last.stoppedAt;
      }
    }

    const empty =
      doc.sessions.length === 0 &&
      doc.stages.length === 0 &&
      !doc.summary &&
      !doc.bookmark &&
      !doc.finished;
    const file = path.join(PAPERS_DIR, `${doc.id}.md`);
    if (empty) {
      await fs.rm(file, { force: true });
      return NextResponse.json({ id: doc.id, removed: true });
    }

    await fs.mkdir(PAPERS_DIR, { recursive: true });
    await fs.writeFile(file, serializePaperDoc(doc), 'utf-8');
    return NextResponse.json({ id: doc.id, paper: doc });
  } catch (error) {
    console.error('Error in PUT /api/interview/papers:', error);
    return NextResponse.json({ error: 'Failed to save paper' }, { status: 500 });
  }
}
