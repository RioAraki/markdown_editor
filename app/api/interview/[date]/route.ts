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
import fs from 'fs/promises';
import { loadLeetCode, loadQBank } from '@shared/interview/load';
import { parseQuestionUnit, questionUnitText } from '@shared/interview/qbank';
import {
  parseQuestionDoc,
  serializeQuestionDoc,
} from '@shared/interview/qbankDoc';
import {
  Attempt,
  LeetCodeLog,
  attemptsFromDayText,
  problemUnitText,
} from '@shared/interview/leetcode';
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

const same = (a?: Attempt, b?: Attempt) =>
  a?.outcome === b?.outcome &&
  (a?.note ?? '') === (b?.note ?? '') &&
  !a?.redo === !b?.redo;

/**
 * Make leetcode-log.json agree with what the day file says about `date`.
 *
 * The log is written eagerly when you tap an outcome, the markdown is written
 * by a debounced autosave — two writes that can disagree if either one fails.
 * The markdown is the half you can see, so it wins, and every save re-derives
 * that day's attempts from it. This also carries the note across, which the
 * eager write misses when you type it after tapping the outcome.
 */
async function reconcileLeetCodeLog(date: string, content: string) {
  const claimed = new Map(
    attemptsFromDayText(content, date).map((c) => [String(c.id), c.attempt]),
  );
  const { log } = await loadLeetCode(DATA_DIR);

  const store: LeetCodeLog = {};
  let changed = false;
  for (const [key, entry] of Object.entries(log)) {
    const kept = entry.attempts.filter((a) => a.date !== date);
    const had = entry.attempts.find((a) => a.date === date);
    const want = claimed.get(key);
    if (want) {
      kept.push(want);
      claimed.delete(key);
    }
    if (!same(had, want)) changed = true;
    if (kept.length > 0) {
      store[key] = {
        attempts: kept.sort((a, b) => a.date.localeCompare(b.date)),
      };
    }
  }
  for (const [key, attempt] of claimed) {
    store[key] = { attempts: [attempt] };
    changed = true;
  }

  if (!changed) return;
  const logPath = path.join(DATA_DIR, 'leetcode-log.json');
  await fs.writeFile(logPath, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

/**
 * Make the qbank archive agree with what the day file says about redo flags.
 *
 * Split ownership: the archive owns your answer text (the day file never
 * carries it), the day file owns the 待重做 marker and its one-line reason.
 * Only the second half is reconciled here — same lesson as the LeetCode log,
 * where an eager write and a debounced write could silently disagree.
 */
async function reconcileQBank(date: string, content: string) {
  const claimed = new Map<string, { redo: boolean; reason: string }>();
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*-\s*\[.\]\s*(.*)$/.exec(line);
    if (!m) continue;
    const unit = parseQuestionUnit(m[1]);
    if (unit) claimed.set(unit.id, { redo: unit.redo, reason: unit.note });
  }
  if (claimed.size === 0) return;

  const dir = path.join(DATA_DIR, 'qbank');
  for (const [id, want] of claimed) {
    const file = path.join(dir, `${id}.md`);
    const doc = await fs
      .readFile(file, 'utf-8')
      .then(parseQuestionDoc)
      .catch(() => null);
    // No archive file means nothing has been written for this question yet —
    // a bare flag with no answer is not worth a file of its own.
    if (!doc) continue;
    if (!!doc.redo === want.redo && (doc.redoReason ?? '') === want.reason) continue;
    doc.redo = want.redo;
    doc.redoReason = want.redo ? want.reason || undefined : undefined;
    await fs.writeFile(file, serializeQuestionDoc(doc), 'utf-8');
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
    await reconcileLeetCodeLog(date, body.content).catch((e) =>
      console.error('Failed to reconcile leetcode log:', e),
    );
    await reconcileQBank(date, body.content).catch((e) =>
      console.error('Failed to reconcile qbank archive:', e),
    );
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

    // 题库 slots name their concrete questions the same way 刷题 does.
    if (body.questions && Object.keys(body.questions).length > 0) {
      const { bank } = await loadQBank(DATA_DIR);
      const byId = new Map(bank.questions.map((q) => [q.id, q]));
      for (const [task, ids] of Object.entries(body.questions)) {
        unitTexts[task] = ids
          .map((id) => byId.get(id))
          .filter((q): q is NonNullable<typeof q> => !!q)
          .map((q) => questionUnitText(q));
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
