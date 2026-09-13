import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isValid, parseISO } from 'date-fns';
import { loadLeetCode } from '@shared/interview/load';
import { parseDayLog } from '@shared/interview/core';
import { dayProblemIds, problemUnitText } from '@shared/interview/leetcode';
import { DeclareProblemError, resolveLeetCode, saveDeclaredProblem } from '@/lib/declareLeetCode';

export const runtime = 'nodejs';
const DATA_DIR = path.dirname(process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log');

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !isValid(parseISO(body.date)) ||
      (body.exclude !== undefined && (!Array.isArray(body.exclude) || !body.exclude.every((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)))) {
      throw new DeclareProblemError(400, '日期或题目列表不正确');
    }
    const { bank } = await loadLeetCode(DATA_DIR);
    const problem = await resolveLeetCode(body.url, bank);
    const day = await fs.readFile(path.join(DATA_DIR, 'log', `${body.date}.md`), 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return ''; throw e;
    });
    if (new Set([...(body.exclude ?? []), ...dayProblemIds(parseDayLog(day))]).has(problem.id)) {
      throw new DeclareProblemError(409, `#${problem.id} ${problem.title} 已在这一天的记录里，请直接填写原来的那一项`);
    }
    if (!bank.problems.some(p => p.id === problem.id)) await saveDeclaredProblem(DATA_DIR, problem);
    // Daily markdown and outcomes keep using the same editor save paths.
    return NextResponse.json({ problem, unitText: problemUnitText(problem) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DeclareProblemError ? error.message : '申报失败，请稍后重试' }, {
      status: error instanceof DeclareProblemError ? error.status : 500,
    });
  }
}
