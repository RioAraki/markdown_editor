import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import { loadResume, loadStories } from '@shared/interview/load';
import {
  AnswerStatus,
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

const STATUSES: AnswerStatus[] = ['todo', 'draft', 'flagged', 'spoken'];
const GRADES: Grade[] = ['A', 'B', 'C', 'F'];

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
    } = await req.json();

    if (!body.storyId || !/^[\w-]+$/.test(body.storyId) || !body.questionId) {
      return NextResponse.json({ error: 'bad ids' }, { status: 400 });
    }

    const { bank } = await loadStories(DATA_DIR);
    const story = bank.stories.find((s) => s.id === body.storyId);
    const known = story?.clusters
      .flatMap((c) => c.questions)
      .some((q) => q.id === body.questionId);
    if (!story || !known) {
      return NextResponse.json({ error: 'unknown question' }, { status: 404 });
    }

    const file = path.join(STORIES_DIR, `${story.id}.md`);
    const doc: StoryDoc = await fs
      .readFile(file, 'utf-8')
      .then((t) => parseStoryDoc(story.id, t))
      .catch(() => ({ id: story.id, title: story.title, answers: {} }));
    doc.title = story.title;

    const prev: StoryAnswer =
      doc.answers[body.questionId] ??
      { questionId: body.questionId, status: 'todo' };
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

    doc.answers[body.questionId] = next;

    await fs.mkdir(STORIES_DIR, { recursive: true });
    await fs.writeFile(file, serializeStoryDoc(doc), 'utf-8');
    return NextResponse.json({ storyId: story.id, answer: next });
  } catch (error) {
    console.error('Error in PUT /api/interview/stories:', error);
    return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 });
  }
}
