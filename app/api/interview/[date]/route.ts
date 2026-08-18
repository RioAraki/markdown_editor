import { NextResponse } from 'next/server';
import {
  createInterviewDay,
  readInterviewDay,
  writeInterviewDay,
} from '@/lib/interviewFileSystem';
import { buildDayMarkdown, loadPlan, resolveDayPlan } from '@/lib/interviewPlan';
import {
  InterviewDayContentResponse,
  SaveInterviewRequest,
} from '@/types/interview';

type RouteContext = {
  params: Promise<{ date: string }>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const content = await readInterviewDay(date);
    const response: InterviewDayContentResponse = {
      dateStr: date,
      filename: `${date}.md`,
      content,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Interview day not found') {
      return NextResponse.json(
        { error: 'Interview day not found' },
        { status: 404 },
      );
    }
    console.error('Error in GET /api/interview/[date]:', error);
    return NextResponse.json(
      { error: 'Failed to read interview day' },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const body: SaveInterviewRequest = await req.json();
    if (typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'content must be a string' },
        { status: 400 },
      );
    }
    await writeInterviewDay(date, body.content);
    const response: InterviewDayContentResponse = {
      dateStr: date,
      filename: `${date}.md`,
      content: body.content,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Interview day not found') {
      return NextResponse.json(
        { error: 'Interview day not found' },
        { status: 404 },
      );
    }
    console.error('Error in PUT /api/interview/[date]:', error);
    return NextResponse.json(
      { error: 'Failed to save interview day' },
      { status: 500 },
    );
  }
}

/**
 * Create a day file. Body: `{ templateId? }` — omitted means "use whatever the
 * plan prescribes for this date". Refuses to overwrite an existing day.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const body: { templateId?: string } = await req.json().catch(() => ({}));
    const plan = await loadPlan();

    const day = body.templateId
      ? (plan.templates ?? []).find((t) => t.id === body.templateId)
      : resolveDayPlan(plan, date);

    if (!day) {
      return NextResponse.json(
        { error: 'No plan for this date and no valid templateId given' },
        { status: 400 },
      );
    }

    const content = buildDayMarkdown(day, date);
    await createInterviewDay(date, content);
    const response: InterviewDayContentResponse = {
      dateStr: date,
      filename: `${date}.md`,
      content,
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Interview day already exists'
    ) {
      return NextResponse.json(
        { error: 'Interview day already exists' },
        { status: 409 },
      );
    }
    console.error('Error in POST /api/interview/[date]:', error);
    return NextResponse.json(
      { error: 'Failed to create interview day' },
      { status: 500 },
    );
  }
}
