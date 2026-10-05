const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-review-'));
process.env.INTERVIEW_LOG_PATH = path.join(dir, 'log');
fs.mkdirSync(path.join(dir, 'log'));
fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify({ domains: [] }));
fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ blocks: [], templates: [], weeks: [] }));
fs.writeFileSync(path.join(dir, 'python-qbank.json'), JSON.stringify({ questions: Array.from({ length: 20 }, (_, i) => ({ id: `py-${i}`, question: `Question ${i}`, answer: `Reference ${i}`, category: 'Python', url: '', seq: i })) }));
const load = require('./helpers/load-typescript.cjs')();
const route = load(path.resolve('app/api/interview/review/route.ts'));
const { readReviews } = load(path.resolve('lib/interviewReview.ts'));
const file = path.join(dir, 'review-sessions.json');
const send = body => route.POST(new Request('http://localhost/api/interview/review', { method: 'POST', body: JSON.stringify(body) }));
const save = (revision, more = {}) => send({ action: 'save', revision, roundId: 'round-1', questionId: 'py-0', attemptId: 'attempt-1', text: 'My answer', status: '', ...more });
test.beforeEach(() => { if (fs.existsSync(file)) fs.unlinkSync(file); });
test.after(() => { assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true }); });

test('entire bank is available; drafts, manual marks, same-day attempts and rounds are independent of first learning', async () => {
  const before = await (await route.GET()).json();
  assert.equal(before.questions.length, 20);
  assert.equal((await send({ action: 'start', revision: 0, bank: 'python', roundId: 'round-1' })).status, 200);
  assert.equal((await save(1)).status, 200);
  let store = await readReviews(dir);
  assert.equal(store.rounds[0].entries['py-0'].status, '');
  assert.equal(store.rounds[0].entries['py-1'], undefined);
  const firstCreated = store.rounds[0].entries['py-0'].attempts[0].createdAt;
  assert.equal((await save(2, { text: 'Edited', status: 'prompted' })).status, 200);
  assert.equal((await save(3, { attemptId: 'attempt-2', text: 'Second answer', status: 'independent' })).status, 200);
  store = await readReviews(dir);
  const attempts = store.rounds[0].entries['py-0'].attempts;
  assert.deepEqual(attempts.map(a => a.text), ['Edited', 'Second answer']);
  assert.equal(attempts[0].createdAt, firstCreated);
  assert.equal((await send({ action: 'start', revision: 4, bank: 'python', roundId: 'round-2' })).status, 200);
  assert.equal((await save(5)).status, 409);
  const after = await (await route.GET()).json();
  assert.deepEqual(after.store.rounds[1].entries, {});
  assert.equal(after.store.rounds[0].entries['py-0'].attempts.length, 2);
  assert.deepEqual(after.log, before.log);
  assert.equal(fs.existsSync(path.join(dir, 'qbank')), false);
});

test('retrying start is idempotent; stale or concurrent edits cannot silently overwrite answers', async () => {
  const start = { action: 'start', revision: 0, bank: 'python', roundId: 'round-1' };
  assert.equal((await send(start)).status, 200);
  assert.equal((await send(start)).status, 200);
  assert.equal((await readReviews(dir)).rounds.length, 1);
  const results = await Promise.all([save(1), save(1, { text: 'Another tab' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await readReviews(dir)).revision, 2);
});

test('invalid inputs and corrupt storage never destroy existing data', async () => {
  assert.equal((await send({ action: 'start', revision: 0, bank: '__proto__', roundId: 'r' })).status, 400);
  await send({ action: 'start', revision: 0, bank: 'python', roundId: 'round-1' });
  const before = fs.readFileSync(file, 'utf8');
  assert.equal((await save(1, { questionId: '../wrong' })).status, 400);
  assert.equal((await save(1, { status: 'done' })).status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(file, '{corrupt');
  const old = console.error; console.error = () => {};
  try { assert.equal((await route.GET()).status, 500); assert.ok((await save(1)).status >= 400); }
  finally { console.error = old; }
  assert.equal(fs.readFileSync(file, 'utf8'), '{corrupt');
});
