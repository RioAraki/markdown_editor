import fs from 'fs/promises';
import path from 'path';

/**
 * Rotation model support (server-only).
 *
 * Prescriptions live in the diary app's plan.json (`rotation` array). This
 * module reads that pool, figures out which session is "least recently done"
 * (the suggestion), and materializes a chosen session into a dated log file.
 */

const TRAINING_LOG_PATH =
  process.env.TRAINING_LOG_PATH || 'D:\\diary\\data\\training\\log';
const PLAN_PATH =
  process.env.TRAINING_PLAN_PATH ||
  path.join(path.dirname(TRAINING_LOG_PATH), 'plan.json');

export interface RotationExercise {
  name: string;
  weight?: string;
  sets: number;
  reps: string;
  rest?: string;
  tempo?: string;
  note?: string;
  supersetWith?: string;
}

export interface RotationSession {
  id: string;
  type: string;
  title: string;
  notes?: string;
  focus?: string;
  exercises?: RotationExercise[];
}

const DAY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const SESSION_RE = /<!--\s*session:\s*([a-z0-9-]+)\s*-->/i;
const H1_RE = /^#\s+(.+)$/m;

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export async function loadRotation(): Promise<RotationSession[]> {
  try {
    const raw = await fs.readFile(PLAN_PATH, 'utf-8');
    const plan = JSON.parse(raw);
    return Array.isArray(plan.rotation) ? plan.rotation : [];
  } catch {
    return [];
  }
}

/**
 * Map each rotation session id to the most recent date it was performed,
 * by scanning log files for the `<!-- session: id -->` marker (falling back
 * to matching a rotation title in the H1 for legacy files).
 */
export async function computeLastDone(
  rotation: RotationSession[],
): Promise<Record<string, string>> {
  const titleToId = new Map<string, string>();
  for (const s of rotation) titleToId.set(s.title, s.id);

  const lastDone: Record<string, string> = {};
  let files: string[] = [];
  try {
    files = await fs.readdir(TRAINING_LOG_PATH);
  } catch {
    return lastDone;
  }

  for (const f of files) {
    const m = DAY_FILENAME_RE.exec(f);
    if (!m) continue;
    const date = m[1];
    let content = '';
    try {
      content = await fs.readFile(path.join(TRAINING_LOG_PATH, f), 'utf-8');
    } catch {
      continue;
    }
    let id: string | undefined;
    const sm = SESSION_RE.exec(content);
    if (sm) {
      id = sm[1];
    } else {
      const h1 = H1_RE.exec(content);
      if (h1) {
        for (const [title, tid] of titleToId) {
          if (h1[1].includes(title)) {
            id = tid;
            break;
          }
        }
      }
    }
    if (!id) continue;
    if (!lastDone[id] || date > lastDone[id]) lastDone[id] = date;
  }
  return lastDone;
}

function dayDiff(fromDate: string, toDate: string): number {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00`) - Date.parse(`${fromDate}T00:00:00`)) /
      86_400_000,
  );
}

/** Least-recently-done session (never-done wins; ties by rotation order). */
export function suggestSessionId(
  rotation: RotationSession[],
  lastDone: Record<string, string>,
  today: string,
): string | undefined {
  if (rotation.length === 0) return undefined;
  const NEVER = 1e9;
  const scored = rotation.map((s, idx) => {
    const d = lastDone[s.id];
    const daysAgo = d ? dayDiff(d, today) : NEVER;
    return { id: s.id, idx, daysAgo };
  });
  scored.sort((a, b) => b.daysAgo - a.daysAgo || a.idx - b.idx);
  return scored[0].id;
}

/** Build the markdown template for a session on a given date (with marker). */
export function buildDayMarkdown(
  session: RotationSession,
  dateStr: string,
): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const weekday = WEEKDAYS_CN[date.getDay()];
  const lines: string[] = [];
  lines.push(`# ${dateStr} ${weekday} · ${session.title}`);
  lines.push(`<!-- session: ${session.id} -->`);
  lines.push('');
  for (const ex of session.exercises ?? []) {
    const parts = [ex.name];
    if (ex.weight && ex.weight !== '—') parts.push(ex.weight);
    parts.push(`${ex.sets}×${ex.reps}`);
    lines.push(`- ${parts.join(' · ')}`);
    for (let i = 0; i < ex.sets; i++) lines.push('  - [ ] ');
  }
  lines.push('');
  lines.push('> 笔记:');
  lines.push('');
  return lines.join('\n');
}
