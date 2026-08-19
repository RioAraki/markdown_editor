import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { loadLeetCode } from '@shared/interview/load';
import {
  Attempt,
  LeetCodeLog,
  REPO_REDO_NOTE,
} from '@shared/interview/leetcode';

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);
const LOG_PATH = path.join(DATA_DIR, 'leetcode-log.json');
const REPO = process.env.LEETCODE_REPO || 'D:\\github\\leetcode2020';

/** `1143_redo_0.py` → 1143. Anything without a leading number is skipped. */
function problemIdOf(filename: string): number | null {
  const m = /^\D*(\d+)/.exec(filename);
  return m ? Number(m[1]) : null;
}

async function findRedoFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await findRedoFiles(full, out);
    else if (/redo/i.test(e.name)) out.push(e.name);
  }
  return out;
}

/**
 * Re-read the solutions repo and flag every problem you left a `_redo_` file
 * for.
 *
 * That naming habit predates this app and is still how you mark a problem while
 * actually sitting in the editor. It was read once when the history was seeded;
 * making it a re-runnable sync means renaming a file out in the repo still
 * reaches the schedule.
 *
 * Deliberately additive: it only sets the flag, never clears one and never
 * touches an outcome. What you recorded here always wins over a filename.
 */
export async function POST() {
  try {
    const [{ bank, log }, files] = await Promise.all([
      loadLeetCode(DATA_DIR),
      findRedoFiles(REPO),
    ]);

    const inBank = new Set(bank.problems.map((p) => p.id));
    const wanted = new Set<number>();
    const missing = new Set<number>();
    for (const f of files) {
      const id = problemIdOf(f);
      if (id === null) continue;
      (inBank.has(id) ? wanted : missing).add(id);
    }

    const store: LeetCodeLog = { ...log };
    const flagged: number[] = [];
    const alreadyFlagged: number[] = [];
    const noHistory: number[] = [];

    for (const id of wanted) {
      const key = String(id);
      const attempts = store[key]?.attempts ?? [];
      if (attempts.length === 0) {
        // A redo file for a problem with no recorded attempt: seed one, dated
        // by nothing better than today, so it surfaces rather than vanishing.
        noHistory.push(id);
        continue;
      }
      const last = attempts[attempts.length - 1];
      if (last.redo) {
        alreadyFlagged.push(id);
        continue;
      }
      const next: Attempt = { ...last, redo: true };
      if (!next.note) next.note = REPO_REDO_NOTE;
      store[key] = { attempts: [...attempts.slice(0, -1), next] };
      flagged.push(id);
    }

    if (flagged.length > 0) {
      await fs.writeFile(
        LOG_PATH,
        JSON.stringify(store, null, 2) + '\n',
        'utf-8',
      );
    }

    return NextResponse.json({
      repo: REPO,
      redoFiles: files.length,
      flagged: flagged.sort((a, b) => a - b),
      alreadyFlagged: alreadyFlagged.sort((a, b) => a - b),
      noHistory: noHistory.sort((a, b) => a - b),
      // Problems you flagged in the repo that the bank never included — mostly
      // easy ones, which the bank deliberately excludes.
      notInBank: [...missing].sort((a, b) => a - b),
    });
  } catch (error) {
    console.error('Error in POST /api/interview/leetcode/sync-repo:', error);
    return NextResponse.json({ error: 'Failed to sync repo' }, { status: 500 });
  }
}
