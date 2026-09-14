import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import { loadResume, loadStories } from '@shared/interview/load';
import {
  AnswerStatus,
  FollowUp,
  FollowUpStatus,
  Grade,
  StoryAnswer,
  clusterProgress,
  currentCluster,
  pickQuestions,
  storyDebt,
} from '@shared/interview/stories';
import type { StoryDoc } from '@shared/interview/storyDoc';
import { parseStoryDoc, serializeStoryDoc } from '@shared/interview/storyDoc';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const STORIES_DIR = path.join(DATA_DIR, 'stories');

const STATUSES: AnswerStatus[] = ['todo', 'draft', 'flagged', 'spoken', 'struggled'];
const GRADES: Grade[] = ['A', 'B', 'C', 'F'];
const FOLLOW_STATUSES: FollowUpStatus[] = ['todo', 'draft', 'struggled', 'spoken', 'skipped'];

// Shared across route reloads within this process. Every PUT for a story joins
// the same queue, including parent-answer writes, so no snapshot loses edits.
const globalQueues = globalThis as typeof globalThis & { storyWriteQueues?: Map<string, Promise<void>> };
const writeQueues = globalQueues.storyWriteQueues ??= new Map<string, Promise<void>>();
async function withStoryWrite<T>(file: string, write: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const result = previous.then(write);
  const settled = result.then(() => {}, () => {});
  writeQueues.set(file, settled);
  try { return await result; }
  finally { if (writeQueues.get(file) === settled) writeQueues.delete(file); }
}

/** The bank, your answers, where the front line is, and what is due next. */
export async function GET(req: Request) {
  try {
    const [{ bank, answers }, resume] = await Promise.all([
      loadStories(DATA_DIR),
      loadResume(DATA_DIR),
    ]);
    const n = Number(new URL(req.url).searchParams.get('count') ?? 3);
    return NextResponse.json({
      bank,
      answers,
      resume,
      progress: clusterProgress(bank, answers),
      current: currentCluster(bank, answers),
      next: pickQuestions(bank, answers, Math.min(Math.max(n, 1), 10)),
      debt: storyDebt(bank, answers),
      today: format(new Date(), 'yyyy-MM-dd'),
    });
  } catch (error) {
    console.error('Error in GET /api/interview/stories:', error);
    return NextResponse.json({ error: 'Failed to load stories' }, { status: 500 });
  }
}

/**
 * Write one answer.
 *
 * Body: `{ storyId, questionId, answer?, status?, grade?, gaps?, dropped? }`.
 *
 * `answer` and the review fields are written independently on purpose: you
 * type answers, the review pass writes grades, and neither should be able to
 * wipe the other by omitting a field.
 */
export async function PUT(req: Request) {
  try {
    const body: {
      storyId?: string;
      questionId?: string;
      answer?: string;
      status?: string;
      grade?: string | null;
      gaps?: string[];
      dropped?: boolean;
      /** Answering or flagging one follow-up rather than the question. */
      followUpAction?: 'create' | 'update' | 'delete' | 'restore';
      followUpId?: string;
      followUpQuestion?: string;
      followUpQuote?: string;
      followUpStatus?: FollowUpStatus;
      followUpAnswer?: string;
      stuck?: boolean;
    } = await req.json();

    if (!body || typeof body.storyId !== 'string' || !/^[\w-]+$/.test(body.storyId) || !body.questionId) {
      return NextResponse.json({ error: 'bad ids' }, { status: 400 });
    }

    const hasFollowUp = ['followUpAction', 'followUpId', 'followUpQuestion', 'followUpQuote', 'followUpAnswer', 'followUpStatus', 'stuck']
      .some(key => Object.prototype.hasOwnProperty.call(body, key));
    if (hasFollowUp && (
      typeof body.followUpId !== 'string' || body.followUpId.length > 80 || !/^\d+(?:\.\d+)*$/.test(body.followUpId) ||
      (body.followUpAction !== undefined && !['create', 'update', 'delete', 'restore'].includes(body.followUpAction)) ||
      (body.followUpStatus !== undefined && !FOLLOW_STATUSES.includes(body.followUpStatus)) ||
      (body.followUpQuestion !== undefined && (typeof body.followUpQuestion !== 'string' || !body.followUpQuestion.trim())) ||
      (body.followUpAction === 'create' && !body.followUpQuestion?.trim()) ||
      (body.followUpQuote !== undefined && typeof body.followUpQuote !== 'string') ||
      (body.followUpAnswer !== undefined && typeof body.followUpAnswer !== 'string') ||
      (body.stuck !== undefined && typeof body.stuck !== 'boolean')
    )) return NextResponse.json({ error: 'bad follow-up fields' }, { status: 400 });

    const { bank } = await loadStories(DATA_DIR);
    const story = bank.stories.find((s) => s.id === body.storyId);
    const known = story?.clusters
      .flatMap((c) => c.questions)
      .some((q) => q.id === body.questionId);
    if (!story || !known) {
      return NextResponse.json({ error: 'unknown question' }, { status: 404 });
    }

    const questionId = body.questionId;
    const file = path.join(STORIES_DIR, `${story.id}.md`);
    return await withStoryWrite(file, async () => {
      const doc: StoryDoc = await fs
        .readFile(file, 'utf-8')
        .then((t) => parseStoryDoc(story.id, t))
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return { id: story.id, title: story.title, answers: {} };
        });
      doc.title = story.title;

      const prev: StoryAnswer =
        doc.answers[questionId] ??
        { questionId, status: 'todo' };
      const next: StoryAnswer = { ...prev };

      if (typeof body.answer === 'string') {
        const text = body.answer.trim();
        const today = format(new Date(), 'yyyy-MM-dd');

        // Rewriting a graded answer archives the old one together with the grade
        // and gaps it earned. Without this the rewrite reads as if it were the
        // first attempt, and the whole point of the flagged → rewrite loop —
        // seeing what changed and why — is lost. Editing on the same day is not
        // a new attempt, so it just replaces the draft.
        const isRewrite =
          prev.status === 'flagged' &&
          !!prev.answer &&
          text !== prev.answer &&
          !!text;
        if (isRewrite) {
          next.revisions = [
            ...(prev.revisions ?? []),
            {
              date: prev.date ?? today,
              text: prev.answer as string,
              grade: prev.grade,
              gaps: prev.gaps,
            },
          ];
          // The old review belongs to the old text, which now lives in history.
          next.grade = undefined;
          next.gaps = undefined;
          next.status = 'draft';
        }

        next.answer = text || undefined;
        if (next.answer && prev.status === 'todo') next.status = 'draft';
        if (!next.answer) next.status = 'todo';
        next.date = today;
      }
      if (body.status && STATUSES.includes(body.status as AnswerStatus)) {
        next.status = body.status as AnswerStatus;
      }
      if (body.grade === null) next.grade = undefined;
      else if (body.grade && GRADES.includes(body.grade as Grade)) {
        next.grade = body.grade as Grade;
      }
      if (Array.isArray(body.gaps)) {
        next.gaps = body.gaps.filter(Boolean).length ? body.gaps.filter(Boolean) : undefined;
      }
      if (typeof body.dropped === 'boolean') next.dropped = body.dropped || undefined;

      if (hasFollowUp) {
        const list = next.followUps ?? [];
        const i = list.findIndex((f) => f.id === body.followUpId);
        const action = body.followUpAction ?? 'update';
        if (action === 'create' && i >= 0) {
          // The client retains its id through retries, including after a lost
          // response. A retry must never replace later edits or revive a deletion.
          return NextResponse.json({ storyId: story.id, answer: prev });
        }
        if (action !== 'create' && i < 0) {
          return NextResponse.json({ error: 'unknown follow-up' }, { status: 404 });
        }
        const today = format(new Date(), 'yyyy-MM-dd');
        const f: FollowUp = i < 0
          ? { id: body.followUpId!, q: body.followUpQuestion!.trim(), date: today, status: 'todo' }
          : { ...list[i] };
        // Visibility actions also flush any draft supplied by the editor.
        if (body.followUpQuestion !== undefined) f.q = body.followUpQuestion.trim();
        if (body.followUpQuote !== undefined) f.quote = body.followUpQuote || undefined;
        if (body.followUpAnswer !== undefined) {
          const text = body.followUpAnswer.trim();
          if (f.answer && text !== f.answer && f.answerDate !== today) {
            f.revisions = [...(f.revisions ?? []), { date: f.answerDate ?? f.date ?? today, text: f.answer }];
          }
          if (text !== (f.answer ?? '')) {
            f.answer = text || undefined;
            f.answerDate = today;
            if (!f.status || f.status === 'todo' || f.status === 'draft') {
              f.status = f.stuck ? 'struggled' : text ? 'draft' : 'todo';
            }
          }
        }
        if (typeof body.stuck === 'boolean') {
          f.stuck = body.stuck || undefined;
          f.status = body.stuck ? 'struggled' : f.answer ? 'draft' : 'todo';
        }
        if (body.followUpStatus !== undefined) {
          f.status = body.followUpStatus;
          f.stuck = f.status === 'struggled' || undefined;
        }
        if (action === 'delete') f.deleted = true;
        else if (action === 'restore') f.deleted = undefined;
        next.followUps = i < 0 ? [...list, f] : [...list.slice(0, i), f, ...list.slice(i + 1)];
      }

      doc.answers[questionId] = next;

      await fs.mkdir(STORIES_DIR, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, serializeStoryDoc(doc), 'utf-8');
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      return NextResponse.json({ storyId: story.id, answer: next });
    });
  } catch (error) {
    console.error('Error in PUT /api/interview/stories:', error);
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 });
  }
}
