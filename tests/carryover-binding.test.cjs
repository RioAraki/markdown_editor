const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');

const load = makeLoader();
const { carryOver } = load(path.resolve(__dirname, '../../diary/shared/interview/core.ts'));

// 行为故事 and friends put one blank checkbox under a slot whose subject lives
// in the day's `items:` binding, not in the box's text. `isResolved` only ever
// sees unit *text*, so those slots never reached it and an unticked box from
// weeks ago pinned the binding forever: 行为故事 was scheduled on 最大的技术挑战
// on 09-10, 09-11, 09-15 and 09-20 — ticked clean on 09-15 — while the other
// eleven questions in the module were never scheduled once.
//
// These tests fix the two ways out (a later clean tick, or a durable record)
// and, just as importantly, pin down what must NOT change: a slot whose boxes
// name their own units still resumes normally, because there `isResolved`
// already judges each one and the binding is too coarse to stand in for them.

/** One day's parsed log, in the shape carryOver consumes. */
const day = (taskName, itemId, statuses, unitTexts = []) => ({
  items: [
    {
      text: `${taskName} · 某条目 · 1 道 · 20min`,
      sets: statuses.map((s, i) => ({ status: s, text: unitTexts[i] ?? '' })),
    },
  ],
  notes: [],
  itemsByTask: itemId ? { [taskName]: itemId } : {},
});

const planOf = (logs) => ({ logs });
const names = (out) => out.map((c) => `${c.taskName}@${c.date}:${c.itemId ?? '-'}`);

test('a later clean tick releases the binding (the 行为故事 lock)', () => {
  const plan = planOf({
    '2026-09-10': day('行为故事', 'bh-challenge', ['undone']),
    '2026-09-11': day('行为故事', 'bh-challenge', ['undone']),
    '2026-09-15': day('行为故事', 'bh-challenge', ['done']),
  });
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21)),
    [],
    '09-15 ticked the same item clean, so the stale 09-10/09-11 boxes must not resume it',
  );
});

test('without a later tick it still resumes, oldest first', () => {
  const plan = planOf({
    '2026-09-10': day('行为故事', 'bh-challenge', ['undone']),
    '2026-09-11': day('行为故事', 'bh-challenge', ['undone']),
  });
  assert.deepEqual(names(carryOver(plan, '2026-09-20', 21)), ['行为故事@2026-09-10:bh-challenge']);
});

test('a later tick on a DIFFERENT item does not release this one', () => {
  const plan = planOf({
    '2026-09-10': day('行为故事', 'bh-challenge', ['undone']),
    '2026-09-15': day('行为故事', 'bh-collab', ['done']),
  });
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21)),
    ['行为故事@2026-09-10:bh-challenge'],
    'finishing another question says nothing about this one',
  );
});

test('a durable record releases the binding even with no tick anywhere', () => {
  const plan = planOf({
    '2026-09-10': day('行为故事', 'bh-challenge', ['undone']),
    '2026-09-11': day('行为故事', 'bh-challenge', ['undone']),
  });
  const recorded = (_task, itemId) => itemId === 'bh-challenge';
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21, undefined, recorded)),
    [],
    'a recording is the real output of 行为故事; it counts even if the box was never ticked',
  );
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21, undefined, () => false)),
    ['行为故事@2026-09-10:bh-challenge'],
    'and with no recording it still resumes',
  );
});

test('slots whose boxes name units are untouched by this rule', () => {
  // A 刷题 slot binds a whole topic; the individual problems live in the box
  // text. Releasing on the binding alone would drop problems still undone.
  const plan = planOf({
    '2026-09-10': day('刷题', 'lc-grid', ['undone'], ['#721 账户合并']),
    '2026-09-15': day('刷题', 'lc-grid', ['done'], ['#52 N 皇后 II']),
  });
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21, () => false)),
    ['刷题@2026-09-10:lc-grid'],
    'a different problem being finished later must not bury #721',
  );
});

test('isResolved still clears named units, and the slot stays reachable', () => {
  const plan = planOf({
    '2026-09-10': day('刷题', 'lc-grid', ['undone'], ['#721 账户合并']),
    '2026-09-11': day('刷题', 'lc-grid', ['undone'], ['#148 排序链表']),
  });
  // #721 has since been solved; #148 has not.
  const resolved = (u) => u.includes('#721');
  assert.deepEqual(
    names(carryOver(plan, '2026-09-20', 21, resolved)),
    ['刷题@2026-09-11:lc-grid'],
    'the resolved day is skipped without claiming the slot, so 09-11 is reachable',
  );
});
