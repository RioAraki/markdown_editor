const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-depth-'));
process.env.INTERVIEW_LOG_PATH = path.join(dir, 'log');
fs.mkdirSync(path.join(dir, 'log'));
const write = (name, data) => fs.writeFileSync(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
write('inventory.json', { domains: [{ id: 'ai', track: 'ai', modules: [{ id: 'ai-rag', label: 'RAG', items: [
  { id: 'ai-rag-chunk', title: '分块' }, { id: 'ai-rag-embed', title: '向量' }, { id: 'ai-rag-next', title: '下一题' },
] }] }] });
write('plan.json', { blocks: [{ id: 'depth', name: 'AI 深度', track: 'ai', units: 1, pool: ['ai-rag'] }, { id: 'python', name: 'Python 基本功', track: 'python', units: 4, pool: ['py-lang'] }], weeks: [], templates: [] });
write('python-qbank.json', { questions: [{ id: 'py-12345678', question: 'Python?', category: '语言', answer: '', url: '', seq: 0 }] });
write('log/2026-09-28.md', '# 2026-09-28\n<!-- items: AI 深度=ai-rag-chunk -->\n- AI 深度\n  - [x] 原来的分块答案\n  - [x] [@ai-rag-embed] 向量 · 原来的向量答案\n  - [ ] [@ai-rag-next] 下一题\n');
const load = require('./helpers/load-typescript.cjs')();
const { depthQuestionId, legacyDepthLog } = load(path.resolve('lib/depthQuestions.ts'));
const { loadQBank } = load(path.resolve('lib/editorQBank.ts'));
const route = load(path.resolve('app/api/interview/qbank/route.ts'));
const next = load(path.resolve('app/api/interview/qbank/next/route.ts'));
const today = load(path.resolve('app/api/interview/today/route.ts'));
const create = load(path.resolve('app/api/interview/[date]/route.ts'));
const req = (data) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(data) });
test.after(() => {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('prep-depth-'));
  fs.rmSync(dir, { recursive: true });
});
test('legacy bound and appended answers are recovered; blank scheduled questions are not answers', async () => {
  const b = await loadQBank(dir);
  assert.equal(b.log[depthQuestionId('ai-rag-chunk')].answers[0].text, '原来的分块答案');
  assert.equal(b.log[depthQuestionId('ai-rag-embed')].answers[0].text, '原来的向量答案');
  assert.equal(b.log[depthQuestionId('ai-rag-next')], undefined);
  assert.equal(b.blockProgress['AI 深度'].answered, 2);
});
test('daily and extra question both continue after legacy answers', async () => {
  const a = await (await today.GET(new Request('http://localhost/api/interview/today?blocks=depth'))).json();
  assert.equal(a.suggestedQuestions['AI 深度'][0].id, depthQuestionId('ai-rag-next'));
  const b = await (await next.POST(req({ blockName: 'AI 深度', bankId: 'agent' }))).json();
  assert.equal(b.questions[0].id, depthQuestionId('ai-rag-next'));
});
test('saving a new answer preserves old dated answers and original day files', async () => {
  const original = fs.readFileSync(path.join(dir, 'log/2026-09-28.md'), 'utf8');
  const id = depthQuestionId('ai-rag-chunk');
  assert.equal((await route.PUT(req({ id, date: '2026-09-29', answer: '新的\n多行答案' }))).status, 200);
  const b = await loadQBank(dir);
  assert.deepEqual(b.log[id].answers.map(a => a.text), ['原来的分块答案', '新的\n多行答案']);
  assert.equal(fs.readFileSync(path.join(dir, 'log/2026-09-28.md'), 'utf8'), original);
});
test('completed bank has explicit daily state and creates no generic blank boxes', async () => {
  assert.equal((await route.PUT(req({ id: 'py-12345678', date: '2026-09-28', answer: '答完了' }))).status, 200);
  const d = await (await today.GET(new Request('http://localhost/api/interview/today?blocks=python'))).json();
  assert.match(d.emptyTasks['Python 基本功'], /已全部作答/);
  const r = await create.POST(req({ blocks: ['python'], questions: { 'Python 基本功': [] } }), { params: Promise.resolve({ date: '2026-09-29' }) });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.content, /\[module-complete\]/);
  assert.doesNotMatch(body.content, /- \[ \] *\r?$/m);
});
test('new question records are not accidentally attached to a legacy block binding', () => {
  const inventory = JSON.parse(fs.readFileSync(path.join(dir, 'inventory.json')));
  assert.deepEqual(legacyDepthLog({ inventory, logs: { '2026-09-29': { itemsByTask: { 'AI 深度': 'ai-rag-chunk' }, items: [{ text: 'AI 深度', sets: [{ status: 'done', text: `[${depthQuestionId('ai-rag-embed')}] 向量` }] }] } } }), {});
});
