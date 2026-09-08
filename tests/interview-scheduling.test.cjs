const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-scheduling-'));
const previousLogPath = process.env.INTERVIEW_LOG_PATH;
process.env.INTERVIEW_LOG_PATH = path.join(dir, 'log');
fs.mkdirSync(path.join(dir, 'log'));
const today = '2026-09-08';
const write = (name, value) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
const bank = { problems: [...Array.from({ length: 20 }, (_, i) => i + 1), ...Array.from({ length: 8 }, (_, i) => i + 101)].map(id => ({
  id, item: 'a', seq: id, tier: 'core', title: `题${id}`, difficulty: 'medium', url: `https://leetcode.cn/problems/${id}/`,
})) };
write('leetcode.json', bank);
write('inventory.json', { domains: [{ id: 'leetcode', track: 'leetcode', label: '算法', modules: [{ id: 'course', label: '课程', items: [{ id: 'a', title: '专题 A' }] }] }] });
write('plan.json', { blocks: [
  { id: 'leetcode', name: '刷题', track: 'leetcode', units: 6, target: '6 题', pool: ['course'] },
  { id: 'extra', name: '加练', track: 'leetcode', units: 3, target: '3 题', pool: ['course'] },
], weeks: [], templates: [], schedule: {}, dayOverrides: {} });
function reset() {
  write('leetcode-log.json', Object.fromEntries(Array.from({ length: 8 }, (_, i) => [101 + i, { attempts: [{ date: '2026-08-20', outcome: 'struggled', redo: true }] }])));
  for (const name of fs.readdirSync(path.join(dir, 'log'))) fs.unlinkSync(path.join(dir, 'log', name));
}
const load = makeLoader();
const daily = load(path.resolve('app/api/interview/today/route.ts'));
const next = load(path.resolve('app/api/interview/leetcode/next/route.ts'));
// GET /today accepts no date; freeze only the wall clock, not scheduling logic.
const RealDate = Date;
test.before(() => { global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00`])); }
  static now() { return new RealDate(`${today}T12:00:00`).getTime(); }
}; });
test.after(() => {
  global.Date = RealDate;
  if (previousLogPath === undefined) delete process.env.INTERVIEW_LOG_PATH;
  else process.env.INTERVIEW_LOG_PATH = previousLogPath;
  const resolved = path.resolve(dir);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('prep-scheduling-'));
  fs.rmSync(resolved, { recursive: true });
});
const requestNext = async (body) => {
  const response = await next.POST(new Request('http://localhost/api/interview/leetcode/next', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(response.status, 200);
  return (await response.json()).problems;
};

test('daily carry-over stays inside the six-slot ratio and cannot revive unflagged outcomes', async () => {
  reset();
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'leetcode-log.json')));
  log[101].attempts[0].redo = false;
  write('leetcode-log.json', log);
  write('log/2026-09-07.md', '# 2026-09-07\n<!-- items: 刷题=a -->\n- 刷题\n' + [101, 102, 103, 104, 105, 106, 107, 108, 8].map(id => `  - [ ] #${id} 题${id}`).join('\n'));
  const response = await daily.GET(new Request('http://localhost/api/interview/today?blocks=leetcode'));
  assert.equal(response.status, 200);
  const rows = (await response.json()).suggestedProblems['刷题'];
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(r => r.kind), ['new', 'new', 'review', 'new', 'new', 'review']);
  assert.ok(!rows.some(r => r.id === 101));
  assert.equal(rows[0].id, 8);
});

test('daily six and three successive additions share one sequence even after saving outcomes', async () => {
  reset();
  const response = await daily.GET(new Request('http://localhost/api/interview/today?blocks=leetcode'));
  const rows = (await response.json()).suggestedProblems['刷题'];
  const ids = rows.map(r => r.id);
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'leetcode-log.json')));
  for (const id of ids) (log[id] ??= { attempts: [] }).attempts.push({ date: today, outcome: 'clean' });
  write('leetcode-log.json', log);
  const kinds = [];
  for (let i = 0; i < 3; i++) {
    const [p] = await requestNext({ date: today, exclude: ids, count: 1 });
    assert.ok(p);
    assert.ok(!ids.includes(p.id));
    ids.push(p.id); kinds.push(p.kind);
  }
  assert.deepEqual(kinds, ['new', 'new', 'review']);
});

test('extra endpoint includes other persisted blocks and unsaved IDs in the day total', async () => {
  reset();
  write(`log/${today}.md`, `# ${today}\n- 刷题\n  - [ ] #1 题1\n- 加练\n  - [ ] #2 题2\n`);
  const [p] = await requestNext({ date: today, exclude: [2], count: 1 });
  assert.equal(p.kind, 'review');
  assert.ok(p.id >= 101);
});

test('viewing an earlier date uses that date for the seven-day review boundary', async () => {
  reset();
  const log = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [101 + i, { attempts: [{ date: '2026-09-01', outcome: 'clean', redo: true }] }]));
  write('leetcode-log.json', log);
  const [p] = await requestNext({ date: '2026-09-07', exclude: [1, 2], count: 1 });
  assert.equal(p.kind, 'new');
});
