import { guardedPromises as fs } from '@/lib/guardedFs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Problem, ProblemBank } from '@shared/interview/leetcode';

export class DeclareProblemError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function leetCodeSlug(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048) throw new DeclareProblemError(400, '请粘贴力扣中国的题目链接');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new DeclareProblemError(400, '链接格式不正确，请复制完整的力扣中国题目链接'); }
  const match = /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(url.pathname);
  if (!['https:', 'http:'].includes(url.protocol) || !['leetcode.cn', 'www.leetcode.cn'].includes(url.hostname) || url.port || url.username || url.password || !match) {
    throw new DeclareProblemError(400, '请使用 https://leetcode.cn/problems/题目名称/ 形式的链接');
  }
  return match[1];
}

export async function resolveLeetCode(input: unknown, bank: ProblemBank): Promise<Problem> {
  const slug = leetCodeSlug(input);
  const known = bank.problems.find(problem => {
    try { return leetCodeSlug(problem.url) === slug; } catch { return false; }
  });
  if (known) return known;
  let response: Response;
  try {
    // Fetch only a fixed first-party endpoint. The supplied URL is never fetched.
    response = await fetch('https://leetcode.cn/graphql/', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query questionTitle($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title translatedTitle titleSlug difficulty } }', variables: { titleSlug: slug } }),
    });
  } catch { throw new DeclareProblemError(502, '暂时无法连接力扣中国，请稍后重试'); }
  if (!response.ok) throw new DeclareProblemError(502, '力扣中国暂时没有返回题目信息，请稍后重试');
  const data = await response.json().catch(() => null);
  if (!data || data.errors) throw new DeclareProblemError(502, '力扣中国返回的信息不完整，请稍后重试');
  const question = data.data?.question;
  if (!question) throw new DeclareProblemError(404, '没有找到这道题，请检查题目链接');
  const rawId = question.questionFrontendId;
  if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    throw new DeclareProblemError(422, '目前支持普通数字题号；LCR、LCP、面试题等特殊编号暂不支持');
  }
  const title = question.translatedTitle || question.title;
  const difficulty = typeof question.difficulty === 'string' ? question.difficulty.toLowerCase() : '';
  if (question.titleSlug !== slug || typeof title !== 'string' || !title.trim() || title.length > 300 || /[\r\n]/.test(title) || !['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new DeclareProblemError(502, '题目信息不完整，请稍后重试');
  }
  // Preserve curriculum metadata if the slug has changed but the ID is known.
  return bank.problems.find(p => p.id === Number(rawId)) ?? {
    id: Number(rawId), title: title.trim(), url: `https://leetcode.cn/problems/${slug}/`,
    difficulty: difficulty as Problem['difficulty'], item: null, source: 'manual',
  };
}

/** Each imported problem gets its own atomic file; seed-bank rebuilds cannot erase it. */
export async function saveDeclaredProblem(dataDir: string, problem: Problem) {
  const dir = path.join(dataDir, 'leetcode-manual');
  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(problem, null, 2) + '\n', 'utf8');
    await fs.rename(temp, path.join(dir, `${problem.id}.json`));
  } finally { await fs.rm(temp, { force: true }); }
}
