import { atomicWriteFile } from '@/lib/atomicFile';
import { resolveServerPaths } from '@/lib/serverPaths';
import { guardedPromises as fs } from '@/lib/guardedFs';
import { resolveLeetCode, saveDeclaredProblem } from '@/lib/declareLeetCode';
import { NextResponse } from 'next/server';
import path from 'node:path';
import { loadLcSync, loadLeetCode } from '@shared/interview/load';
import {
  type LeetCodeLog,
  type Problem,
  attemptsFromDayText,
  mergeSyncedUnits,
} from '@shared/interview/leetcode';
import {
  type LcDeepRecord,
  type LcProfile,
  type LcSyncState,
  type RecentAc,
  localDate,
  missedAcceptances,
  newAcceptances,
} from '@shared/interview/lcSync';

export const runtime = 'nodejs';

const DATA_DIR = resolveServerPaths().interviewData;
const LOG_PATH = path.join(DATA_DIR, 'leetcode-log.json');
const SYNC_PATH = path.join(DATA_DIR, 'lc-sync.json');
const DAY_DIR = path.join(DATA_DIR, 'log');

class SyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Fixed first-party endpoints only; nothing user-supplied is ever fetched. */
async function graphql(
  endpoint: 'https://leetcode.cn/graphql/' | 'https://leetcode.cn/graphql/noj-go/',
  query: string,
  variables: Record<string, unknown>,
  cookie?: { session: string; csrf?: string },
) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://leetcode.cn/',
        ...(cookie ? {
          Cookie: `LEETCODE_SESSION=${cookie.session}${cookie.csrf ? `; csrftoken=${cookie.csrf}` : ''}`,
          ...(cookie.csrf ? { 'x-csrftoken': cookie.csrf } : {}),
        } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new SyncError(502, '暂时连不上 leetcode.cn，请稍后重试');
  }
  if (!res.ok) throw new SyncError(502, `leetcode.cn 返回 HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data || data.errors) {
    // leetcode.cn changes its schema without notice; say so rather than guess.
    throw new SyncError(502, `leetcode.cn 接口返回错误：${data?.errors?.[0]?.message ?? '无法解析'}`);
  }
  return data.data;
}

async function fetchProfile(userSlug: string): Promise<LcProfile> {
  const [progress, contest] = await Promise.all([
    graphql('https://leetcode.cn/graphql/',
      'query($userSlug:String!){userProfileUserQuestionProgressV2(userSlug:$userSlug){numAcceptedQuestions{difficulty count} numFailedQuestions{difficulty count}}}',
      { userSlug }),
    graphql('https://leetcode.cn/graphql/noj-go/',
      'query($userSlug:String!){userContestRanking(userSlug:$userSlug){attendedContestsCount rating}}',
      { userSlug }),
  ]);
  const p = progress?.userProfileUserQuestionProgressV2;
  if (!p) throw new SyncError(404, `找不到 leetcode.cn 用户 ${userSlug}`);
  const count = (rows: { difficulty: string; count: number }[], d: string) =>
    rows?.find((r) => r.difficulty === d)?.count ?? 0;
  const easy = count(p.numAcceptedQuestions, 'EASY');
  const medium = count(p.numAcceptedQuestions, 'MEDIUM');
  const hard = count(p.numAcceptedQuestions, 'HARD');
  const failed = (p.numFailedQuestions ?? []).reduce((s: number, r: { count: number }) => s + r.count, 0);
  const rank = contest?.userContestRanking;
  return {
    ac: { easy, medium, hard, total: easy + medium + hard },
    failed,
    ...(rank?.rating ? { contestRating: Math.round(rank.rating), contestCount: rank.attendedContestsCount } : {}),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchRecentAc(userSlug: string): Promise<RecentAc[]> {
  const data = await graphql('https://leetcode.cn/graphql/noj-go/',
    'query($userSlug:String!){recentACSubmissions(userSlug:$userSlug){submitTime question{translatedTitle title titleSlug questionFrontendId}}}',
    { userSlug });
  const rows = data?.recentACSubmissions ?? [];
  return rows.flatMap((r: {
    submitTime: number;
    question: { translatedTitle?: string; title: string; titleSlug: string; questionFrontendId: string };
  }) => {
    const id = r.question?.questionFrontendId;
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) return []; // LCR/LCP/面试题
    return [{ id: Number(id), title: r.question.translatedTitle || r.question.title,
      slug: r.question.titleSlug, submitTime: Number(r.submitTime) }];
  });
}

/**
 * Logged-in progress list: every problem you have touched on leetcode.cn.
 * Needs LEETCODE_SESSION (and usually LEETCODE_CSRFTOKEN) in the server's
 * environment; the values never leave this process except to leetcode.cn.
 */
async function fetchDeep(): Promise<(LcDeepRecord & { id: number; title: string; slug: string })[]> {
  const session = process.env.LEETCODE_SESSION;
  if (!session) {
    throw new SyncError(400, '深度同步需要在服务器环境变量里配置 LEETCODE_SESSION（以及 LEETCODE_CSRFTOKEN）');
  }
  const cookie = { session, csrf: process.env.LEETCODE_CSRFTOKEN };
  const out: (LcDeepRecord & { id: number; title: string; slug: string })[] = [];
  for (let skip = 0; skip < 10_000; skip += 50) {
    const data = await graphql('https://leetcode.cn/graphql/',
      'query($filters:UserProgressQuestionListInput){userProgressQuestionList(filters:$filters){totalNum questions{frontendId title translatedTitle titleSlug lastSubmittedAt numSubmitted questionStatus}}}',
      { filters: { skip, limit: 50 } }, cookie);
    const page = data?.userProgressQuestionList;
    if (!page) throw new SyncError(401, 'leetcode.cn 没有返回做题记录：LEETCODE_SESSION 可能已过期，请重新从浏览器复制');
    for (const q of page.questions ?? []) {
      if (typeof q.frontendId !== 'string' || !/^[1-9]\d*$/.test(q.frontendId)) continue;
      const at = q.lastSubmittedAt;
      const iso = typeof at === 'number' ? new Date(at * 1000).toISOString()
        : typeof at === 'string' && at ? new Date(at).toISOString() : undefined;
      out.push({
        id: Number(q.frontendId),
        title: q.translatedTitle || q.title,
        slug: q.titleSlug,
        status: q.questionStatus === 'SOLVED' || q.questionStatus === 'AC' ? 'ac' : 'tried',
        ...(iso ? { lastSubmittedAt: iso } : {}),
        ...(typeof q.numSubmitted === 'number' ? { numSubmitted: q.numSubmitted } : {}),
      });
    }
    if (skip + 50 >= (page.totalNum ?? 0) || (page.questions ?? []).length === 0) break;
  }
  return out;
}

/**
 * Pull new ACs from leetcode.cn into the day files and the attempt log.
 *
 * Body: `{ mode?: "public" | "deep" }`.
 * - public (default): the profile counts and the latest 15 ACs, no login.
 * - deep: additionally the logged-in progress list, stored as evidence for
 *   the ability model; ACs newer than the last sync that the public feed
 *   missed are imported like any other.
 *
 * Additive only: an attempt you already recorded for that day is never
 * touched, and nothing is ever removed.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'deep' ? 'deep' : 'public';
    const state: LcSyncState = await loadLcSync(DATA_DIR);
    if (!state.userSlug) throw new SyncError(400, 'lc-sync.json 里没有配置 userSlug');

    const [profile, recent, deep] = await Promise.all([
      fetchProfile(state.userSlug),
      fetchRecentAc(state.userSlug),
      mode === 'deep' ? fetchDeep() : Promise.resolve(undefined),
    ]);

    const { bank, log } = await loadLeetCode(DATA_DIR);
    const store: LeetCodeLog = { ...log };
    const hasAttempt = (id: number, date: string) =>
      (store[String(id)]?.attempts ?? []).some((a) => a.date === date);

    // On the very first sync, the latest 15 are exactly the backlog worth
    // importing. Afterwards only what is newer than the last import.
    const fresh = newAcceptances(recent, state.lastAcTime, hasAttempt);
    if (deep && state.lastAcTime !== undefined) {
      const known = new Set(fresh.map((f) => `${f.ac.id}@${f.date}`));
      for (const q of deep) {
        if (q.status !== 'ac' || !q.lastSubmittedAt) continue;
        const t = Math.floor(Date.parse(q.lastSubmittedAt) / 1000);
        const date = localDate(t);
        if (t <= state.lastAcTime || known.has(`${q.id}@${date}`) || hasAttempt(q.id, date)) continue;
        fresh.push({ ac: { id: q.id, title: q.title, slug: q.slug, submitTime: t }, date });
      }
    }

    // Problems the catalog has never heard of (new this week) are looked up
    // the same way 申报 does, and remembered in leetcode-manual/.
    const byId = new Map(bank.problems.map((p) => [p.id, p]));
    const resolved = new Map<number, Problem>();
    for (const { ac } of fresh) {
      if (resolved.has(ac.id)) continue;
      let p = byId.get(ac.id);
      if (!p) {
        try {
          p = await resolveLeetCode(`https://leetcode.cn/problems/${ac.slug}/`, bank);
          await saveDeclaredProblem(DATA_DIR, p);
        } catch {
          p = { id: ac.id, title: ac.title, url: `https://leetcode.cn/problems/${ac.slug}/`,
            difficulty: 'medium', item: null, source: 'manual' };
        }
      }
      resolved.set(ac.id, p);
    }

    const byDate = new Map<string, Problem[]>();
    for (const { ac, date } of fresh) {
      const list = byDate.get(date) ?? [];
      if (!list.some((p) => p.id === ac.id)) list.push(resolved.get(ac.id)!);
      byDate.set(date, list);
    }

    const added: { id: number; title: string; date: string }[] = [];
    await fs.mkdir(DAY_DIR, { recursive: true });
    for (const [date, problems] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
      const file = path.join(DAY_DIR, `${date}.md`);
      const before = await fs.readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return ''; throw e;
      });
      const merged = mergeSyncedUnits(before, date, problems.map((problem) => ({ problem })));
      if (merged.added.length === 0) continue;
      await atomicWriteFile(file, merged.markdown, 'utf8');
      // The day file is the source of truth: take the attempt from what it now
      // says, so a ticked planned line keeps the note you had on it.
      const claimed = new Map(attemptsFromDayText(merged.markdown, date).map((c) => [c.id, c.attempt]));
      for (const id of merged.added) {
        const attempt = claimed.get(id);
        if (!attempt) continue;
        const key = String(id);
        const attempts = (store[key]?.attempts ?? []).filter((a) => a.date !== date);
        attempts.push(attempt);
        attempts.sort((a, b) => a.date.localeCompare(b.date));
        store[key] = { attempts };
        added.push({ id, title: problems.find((p) => p.id === id)?.title ?? '', date });
      }
    }
    if (added.length > 0) {
      await atomicWriteFile(LOG_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
    }

    const newest = Math.max(state.lastAcTime ?? 0, ...recent.map((r) => r.submitTime));
    const firstTimeNew = new Set(added.filter((a) => (log[String(a.id)]?.attempts ?? []).length === 0).map((a) => a.id));
    const missed = deep ? 0 : missedAcceptances(state.profile, profile, firstTimeNew.size);
    const next: LcSyncState = {
      ...state,
      lastSyncAt: new Date().toISOString(),
      ...(newest > 0 ? { lastAcTime: newest } : {}),
      profile,
      ...(deep ? {
        deep: {
          fetchedAt: new Date().toISOString(),
          questions: Object.fromEntries(deep.map(({ id, status, lastSubmittedAt, numSubmitted }) =>
            [String(id), { status, ...(lastSubmittedAt ? { lastSubmittedAt } : {}),
              ...(numSubmitted !== undefined ? { numSubmitted } : {}) }])),
        },
      } : {}),
    };
    await atomicWriteFile(SYNC_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');

    return NextResponse.json({
      mode,
      added,
      missed,
      profile,
      deepCount: deep?.length,
      lastSyncAt: next.lastSyncAt,
    });
  } catch (error) {
    if (!(error instanceof SyncError)) console.error('Error in POST /api/interview/leetcode/sync-lc:', error);
    return NextResponse.json(
      { error: error instanceof SyncError ? error.message : '同步失败，请稍后重试' },
      { status: error instanceof SyncError ? error.status : 500 },
    );
  }
}
