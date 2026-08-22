import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { loadTopicNotes } from '@shared/interview/load';
import {
  appendObservation,
  serializeTopicNote,
} from '@shared/interview/topicNotes';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const TOPICS_DIR = path.join(DATA_DIR, 'topics');

/** All 要领 notes, keyed by inventory item id. */
export async function GET() {
  try {
    return NextResponse.json({ notes: await loadTopicNotes(DATA_DIR) });
  } catch (error) {
    console.error('Error in GET /api/interview/topics:', error);
    return NextResponse.json({ notes: {} });
  }
}

/**
 * Write to a topic's 要领.
 *
 * Body: `{ id, append? , body?, title? }`. `append` adds one dated bullet
 * under 随手记 — the low-friction path, used right after a problem while the
 * insight is still fresh. `body` replaces the whole file, for when you sit
 * down and actually organise it.
 */
export async function PUT(req: Request) {
  try {
    const body: {
      id?: string;
      append?: string;
      body?: string;
      title?: string;
    } = await req.json();

    if (!body.id || !/^[\w-]+$/.test(body.id)) {
      return NextResponse.json({ error: 'bad topic id' }, { status: 400 });
    }
    const notes = await loadTopicNotes(DATA_DIR);
    const date = format(new Date(), 'yyyy-MM-dd');

    let next = notes[body.id];
    if (typeof body.body === 'string') {
      next = {
        id: body.id,
        title: body.title ?? next?.title,
        updated: date,
        body: body.body.trim(),
      };
    } else if (body.append) {
      next = appendObservation(next, body.id, body.append, date, body.title);
    } else {
      return NextResponse.json({ error: 'nothing to write' }, { status: 400 });
    }

    const file = path.join(TOPICS_DIR, `${body.id}.md`);
    if (!next.body.trim()) {
      await fs.rm(file, { force: true });
      return NextResponse.json({ id: body.id, removed: true });
    }
    await fs.mkdir(TOPICS_DIR, { recursive: true });
    await fs.writeFile(file, serializeTopicNote(next), 'utf-8');
    return NextResponse.json({ id: body.id, note: next });
  } catch (error) {
    console.error('Error in PUT /api/interview/topics:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
