import { guardedPromises as fs } from './guardedFs';
import { atomicWriteFile } from './atomicFile';
import path from 'node:path';
import { REVIEW_BANKS, REVIEW_LABELS, type ReviewStore } from '../types/interviewReview';

export class ReviewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const empty = (): ReviewStore => ({ version: 1, revision: 0, rounds: [] });
export async function readReviews(dataDir: string): Promise<ReviewStore> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(dataDir, 'review-sessions.json'), 'utf8'));
    if (value.version !== 1 || !Number.isInteger(value.revision) || !Array.isArray(value.rounds)) throw new Error('Invalid review store');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
    throw error;
  }
}
const queues = new Map<string, Promise<unknown>>();
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v);

// All rounds live in one atomically replaced file; serialize read/modify/write.
export async function updateReviews(dataDir: string, body: Record<string, unknown>, questions: { id: string; bank?: string }[]) {
  const previous = queues.get(dataDir) ?? Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const store = await readReviews(dataDir);
    if (!validId(body.roundId)) throw new ReviewError('无效的轮次编号');
    const existing = store.rounds.find(r => r.id === body.roundId);
    // A retry of a successful start must not produce another round.
    if (body.action === 'start' && existing && existing.bank === body.bank) return store;
    if (body.revision !== store.revision) throw new ReviewError('复习记录已在其他页面更新，请重新加载后再保存；当前输入仍保留。', 409);
    if (body.action === 'start') {
      if (typeof body.bank !== 'string' || !Object.hasOwn(REVIEW_BANKS, body.bank) || existing) throw new ReviewError('无效的门类');
      if (!questions.some(q => (q.bank ?? 'agent') === body.bank)) throw new ReviewError('该门类暂无题目');
      store.rounds.push({ id: body.roundId, bank: body.bank, createdAt: new Date().toISOString(), entries: {} });
    } else if (body.action === 'save') {
      if (!existing || store.rounds.filter(r => r.bank === existing.bank).at(-1)?.id !== existing.id) throw new ReviewError('这轮已结束，请重新加载当前轮次', 409);
      if (typeof body.questionId !== 'string' || !questions.some(q => q.id === body.questionId && (q.bank ?? 'agent') === existing.bank)) throw new ReviewError('题目不属于该门类');
      if (typeof body.status !== 'string' || !Object.hasOwn(REVIEW_LABELS, body.status)) throw new ReviewError('无效的复习状态');
      if (!validId(body.attemptId) || typeof body.text !== 'string' || body.text.length > 100000) throw new ReviewError('无效的回答');
      const entry = existing.entries[body.questionId] ??= { status: '', attempts: [] };
      entry.status = body.status as typeof entry.status;
      const attempt = entry.attempts.find(a => a.id === body.attemptId);
      const now = new Date().toISOString();
      if (attempt) {
        if (attempt.text !== body.text) { attempt.text = body.text; attempt.updatedAt = now; }
      } else if (body.text.trim()) {
        entry.attempts.push({ id: body.attemptId, text: body.text, createdAt: now, updatedAt: now });
      }
    } else throw new ReviewError('未知操作');
    store.revision++;
    await fs.mkdir(dataDir, { recursive: true });
    await atomicWriteFile(path.join(dataDir, 'review-sessions.json'), JSON.stringify(store, null, 2));
    return store;
  });
  queues.set(dataDir, job);
  try { return await job; } finally { if (queues.get(dataDir) === job) queues.delete(dataDir); }
}
