const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs')();
test('behavioral history includes dated answers, status and task notes only for the bound question', () => {
  const { behavioralHistory } = load(path.resolve('lib/interviewAnswerHistory.ts'));
  const day = (dateStr, item, status, text) => ({ dateStr, itemsByTask: { '行为故事': item }, blocks: [
    { kind: 'task-units', label: '行为故事 · 20min', units: [{ status, trailing: text }] },
    { kind: 'notes', entries: [{ name: '行为故事', note: 'story notes' }, { name: '刷题', note: 'unrelated notes' }] },
  ] });
  const rows = behavioralHistory([
    day('2026-09-09', 'bh-intro', 'partial', 'first answer'),
    day('2026-09-10', 'bh-failure', 'done', 'wrong question'),
    day('2026-09-11', 'bh-intro', 'done', 'revised answer'),
  ], 'bh-intro');
  assert.deepEqual(rows.map(r => [r.date, r.status, r.text, r.note]), [
    ['2026-09-11', 'done', 'revised answer', 'story notes'],
    ['2026-09-09', 'partial', 'first answer', 'story notes'],
  ]);
});
