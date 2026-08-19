import { NextResponse } from 'next/server';
import {
  createInterviewDay,
  readInterviewDay,
  writeInterviewDay,
} from '@/lib/interviewFileSystem';
import {
  ItemBinding,
  buildDayMarkdown,
  loadPlan,
  resolveDayPlan,
} from '@/lib/interviewPlan';
import { flattenInventory, loadInventory, loadMastery } from '@/lib/interviewInventory';
import path from 'path';
import { loadLeetCode } from '@shared/interview/load';
import { problemUnitText } from '@shared/interview/leetcode';
import {
  CreateDayRequest,
  InterviewDayContentResponse,
  SaveInterviewRequest,
} from '@/types/interview';

type RouteContext = {
  params: Promise<{ date: string }>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

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
 * Create a day file. Body: `{ templateId?, items? }` — `templateId` omitted
 * means "use whatever the plan prescribes for this date"; `items` maps a task
 * name to the inventory item chosen for it. Refuses to overwrite an existing day.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const body: CreateDayRequest = await req.json().catch(() => ({}));
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

    // Resolve chosen item ids to titles so the log line reads properly.
    let binding: ItemBinding = {};
    if (body.items && Object.keys(body.items).length > 0) {
      const [inventory, mastery] = await Promise.all([
        loadInventory(),
        loadMastery(),
      ]);
      const byId = new Map(
        flattenInventory(inventory, {}, mastery).map((c) => [c.id, c]),
      );
      binding = Object.fromEntries(
        Object.entries(body.items)
          .map(([task, id]) => {
            const c = byId.get(id);
            return c ? [task, { id: c.id, title: c.title }] : null;
          })
          .filter((e): e is [string, { id: string; title: string }] => e !== null),
      );
    }

    // 刷题 slots name their concrete problems on each checkbox line.
    const unitTexts: Record<string, string[]> = {};
    if (body.problems && Object.keys(body.problems).length > 0) {
      const { bank } = await loadLeetCode(DATA_DIR);
      const byId = new Map(bank.problems.map((p) => [p.id, p]));
      for (const [task, ids] of Object.entries(body.problems)) {
        unitTexts[task] = ids
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => problemUnitText(p));
      }
    }

    const content = buildDayMarkdown(day, date, binding, unitTexts);
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
