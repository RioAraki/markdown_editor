const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs')();

const ability = load(path.resolve('../diary/shared/interview/ability.ts'));
const adaptive = load(path.resolve('../diary/shared/interview/adaptive.ts'));
const leetcode = load(path.resolve('../diary/shared/interview/leetcode.ts'));
const lcSync = load(path.resolve('../diary/shared/interview/lcSync.ts'));

const today = '2026-11-20';
const topics = [
  { id: 'bfs', name: '图论', sections: ['遍历', '最短路'] },
  { id: 'seg', name: '数据结构', sections: ['线段树'] },
];
const problem = (id, topic, rating, section = 0, extra = {}) => ({
  id, title: `题${id}`, url: `https://leetcode.cn/problems/p${id}/`, difficulty: 'medium', item: null,
  rating, ratingSource: 'contest', topics: [topic], sections: [`${topic}:${section}`], listOrder: id, ...extra,
});

function bankWithHistory() {
  const problems = [];
  // Topic bfs: you have solved hard ones cleanly. Topic seg: you failed easy ones.
  for (let i = 0; i < 8; i++) problems.push(problem(1 + i, 'bfs', 1900 + i * 30, i % 2));
  for (let i = 0; i < 8; i++) problems.push(problem(101 + i, 'seg', 1400 + i * 20));
  // Unseen candidates across the rating range.
  for (let r = 1200; r <= 2600; r += 50) {
    problems.push(problem(1000 + r, 'bfs', r, 1));
    problems.push(problem(5000 + r, 'seg', r));
  }
  const log = {};
  for (let i = 0; i < 8; i++) log[1 + i] = { attempts: [{ date: '2026-11-01', outcome: 'clean' }] };
  for (let i = 0; i < 8; i++) log[101 + i] = { attempts: [{ date: '2026-11-01', outcome: i < 6 ? 'used-solution' : 'struggled' }] };
  return { bank: { problems, topics }, log };
}

test('solve chance and target rating are inverses on the Elo curve', () => {
  assert.equal(ability.solveChance(1800, 1800), 0.5);
  const r = ability.ratingForChance(1800, 0.65);
  assert.ok(Math.abs(ability.solveChance(1800, r) - 0.65) < 1e-9);
  assert.ok(r < 1800);
});

test('a strong topic fits above a weak one, and thin data shrinks toward the parent', () => {
  const { bank, log } = bankWithHistory();
  const report = ability.computeAbility({ problems: bank.problems, topics, log, today, sync: { userSlug: 'x', profile: { contestRating: 1786 } } });
  const bfs = report.topics.find((t) => t.id === 'bfs');
  const seg = report.topics.find((t) => t.id === 'seg');
  assert.ok(bfs.theta > seg.theta + 150, `${bfs.theta} vs ${seg.theta}`);
  assert.equal(bfs.n, 8);
  assert.equal(report.prior, 1786);
  // No data at all: the section sits on its topic with the full prior width.
  const empty = ability.computeAbility({ problems: bank.problems, topics, log: {}, today });
  assert.equal(empty.topics[0].theta, empty.global.theta);
  assert.ok(empty.topics[0].sd > 140);
});

test('older and estimated evidence counts for less', () => {
  const p = new Map([[1, problem(1, 'bfs', 2000)], [2, problem(2, 'bfs', 2000, 0, { ratingSource: 'est' })]]);
  const obs = ability.observations(p, {
    1: { attempts: [{ date: '2024-11-20', outcome: 'failed' }, { date: today, outcome: 'clean' }] },
    2: { attempts: [{ date: today, outcome: 'clean' }] },
  }, undefined, today);
  const [old, recent, est] = obs;
  assert.ok(old.w < 0.3 && recent.w === 1);
  assert.ok(est.w < recent.w);
});

test('recommendations aim hard in a strong topic and easy in a weak one', () => {
  const { bank, log } = bankWithHistory();
  const report = ability.computeAbility({ problems: bank.problems, topics, log, today });
  const recs = adaptive.recommendAdaptive({ bank, log, ability: report, count: 2, today });
  assert.equal(recs.length, 2);
  assert.deepEqual(new Set(recs.map((r) => r.topic)), new Set(['bfs', 'seg']));
  const bfs = recs.find((r) => r.topic === 'bfs');
  const seg = recs.find((r) => r.topic === 'seg');
  assert.ok(bfs.problem.rating > seg.problem.rating + 200);
  // The weak topic goes first: it is what needs practice.
  assert.equal(recs[0].topic, 'seg');
  for (const r of recs) {
    assert.equal(r.kind, 'new');
    assert.ok(Math.abs(r.chance - 0.65) < 0.1, `chance ${r.chance}`);
    assert.match(r.reason, /预计成功率/);
  }
});

test('premium, attempted and deep-synced problems are never offered as new', () => {
  const { bank, log } = bankWithHistory();
  const report = ability.computeAbility({ problems: bank.problems, topics, log, today });
  const first = adaptive.recommendAdaptive({ bank, log, ability: report, count: 1, today })[0];
  const solved = new Set([first.problem.id]);
  const second = adaptive.recommendAdaptive({ bank, log, ability: report, count: 1, today, solved })[0];
  assert.notEqual(second.problem.id, first.problem.id);
  for (const p of bank.problems) if (p.topics[0] === 'seg') p.paid = true;
  const recs = adaptive.recommendAdaptive({ bank, log, ability: report, count: 3, today });
  assert.ok(recs.every((r) => !r.problem.paid && !log[r.problem.id]));
});

test('intensity moves the target: challenge is harder than consolidate', () => {
  const { bank, log } = bankWithHistory();
  const report = ability.computeAbility({ problems: bank.problems, topics, log, today });
  const easy = adaptive.recommendAdaptive({ bank, log, ability: report, count: 1, today, intensity: 'consolidate' })[0];
  const hard = adaptive.recommendAdaptive({ bank, log, ability: report, count: 1, today, intensity: 'challenge' })[0];
  assert.equal(easy.topic, hard.topic);
  assert.ok(hard.problem.rating > easy.problem.rating);
});

test('at most one ordinary redo a day; dated priority redos always come', () => {
  const { bank, log } = bankWithHistory();
  log[1].attempts[0].redo = true;
  log[2].attempts[0].redo = true;
  log[3].attempts[0] = { date: '2026-11-19', outcome: 'clean', redo: true, redoOn: today };
  const report = ability.computeAbility({ problems: bank.problems, topics, log, today });
  const recs = adaptive.recommendAdaptive({ bank, log, ability: report, count: 4, today });
  assert.deepEqual(recs.map((r) => r.kind), ['review', 'review', 'new', 'new']);
  assert.equal(recs[0].problem.id, 3);
  assert.match(recs[0].reason, /优先重做/);
  const again = adaptive.recommendAdaptive({ bank, log, ability: report, count: 2, today, exclude: new Set(recs.map((r) => r.problem.id)) });
  assert.ok(again.every((r) => r.kind === 'new'));
});

test('synced units land in the 刷题 block and tick a planned line without touching recorded ones', () => {
  const day = '# 2026-11-19 周三 · 自选\n\n- 刷题 · 2 题\n  - [ ] #7 题7 · 卡在边界\n  - [x] #8 题8 · 比较完美\n\n> 笔记:\n';
  const { markdown, added } = leetcode.mergeSyncedUnits(day, '2026-11-19', [
    { problem: { id: 7, title: '题7' } }, { problem: { id: 8, title: '题8' } }, { problem: { id: 9, title: '题9' } },
  ]);
  assert.deepEqual(added, [7, 9]);
  assert.match(markdown, /- \[x\] #7 题7 · 已同步 · 卡在边界/);
  assert.match(markdown, /- \[x\] #8 题8 · 比较完美/);
  assert.match(markdown, /- \[x\] #8 题8 · 比较完美\n  - \[x\] #9 题9 · 已同步\n\n> 笔记:/);
  const attempts = leetcode.attemptsFromDayText(markdown, '2026-11-19');
  assert.deepEqual(attempts.find((a) => a.id === 9).attempt, { date: '2026-11-19', outcome: 'synced' });
  assert.equal(attempts.find((a) => a.id === 7).attempt.note, '卡在边界');
});

test('an empty day gets a header, a 刷题 block and a notes section', () => {
  const { markdown } = leetcode.mergeSyncedUnits('', '2026-11-18', [{ problem: { id: 2914, title: '使二进制字符串变美丽的最少修改次数' } }]);
  assert.equal(markdown, '# 2026-11-18 周三 · 同步\n\n- 刷题 · 同步自 leetcode.cn\n  - [x] #2914 使二进制字符串变美丽的最少修改次数 · 已同步\n\n> 笔记:\n');
  const parsed = leetcode.parseProblemRecord('#2914 x · 已同步');
  assert.equal(parsed.outcome, 'synced');
});

test('only acceptances newer than the last import count, once per problem per day', () => {
  const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const recent = [
    { id: 1, title: 'a', slug: 'a', submitTime: t('2026-11-19T10:00:00') },
    { id: 1, title: 'a', slug: 'a', submitTime: t('2026-11-19T11:00:00') },
    { id: 2, title: 'b', slug: 'b', submitTime: t('2026-11-18T10:00:00') },
    { id: 3, title: 'c', slug: 'c', submitTime: t('2026-11-10T10:00:00') },
  ];
  const fresh = lcSync.newAcceptances(recent, t('2026-11-15T00:00:00'), (id, date) => id === 2 && date === '2026-11-18');
  assert.deepEqual(fresh.map((f) => [f.ac.id, f.date]), [[1, '2026-11-19']]);
  assert.equal(lcSync.newAcceptances(recent, undefined, () => false).length, 3);
  const profile = (total) => ({ ac: { easy: 0, medium: total, hard: 0, total }, failed: 0, fetchedAt: '' });
  assert.equal(lcSync.missedAcceptances(undefined, profile(400), 0), 0);
  assert.equal(lcSync.missedAcceptances(profile(397), profile(420), 15), 8);
});

const history = load(path.resolve('../diary/shared/interview/abilityHistory.ts'));

test('an unrated synced AC waits for a rating unless deep sync or a redo flag says how it went', () => {
  const p = new Map([[1, problem(1, 'bfs', 1600)]]);
  const synced = { 1: { attempts: [{ date: today, outcome: 'synced' }] } };
  assert.equal(ability.observations(p, synced, undefined, today).length, 0);
  const deep = (numSubmitted) => ({ userSlug: 'x', deep: { fetchedAt: '', questions: { 1: { status: 'ac', numSubmitted } } } });
  assert.equal(ability.observations(p, synced, deep(1), today)[0].s, 0.75);
  assert.equal(ability.observations(p, synced, deep(3), today)[0].s, 0.4);
  const flagged = { 1: { attempts: [{ date: today, outcome: 'synced', redo: true }] } };
  assert.equal(ability.observations(p, flagged, deep(1), today)[0].s, ability.OUTCOME_EVIDENCE.struggled.s);
  // A pending import does not turn the attempt before it into an "earlier" one.
  const after = { 1: { attempts: [{ date: '2026-11-01', outcome: 'clean' }, { date: today, outcome: 'synced' }] } };
  const [only] = ability.observations(p, after, undefined, today);
  assert.equal(only.s, 0.95);
  assert.ok(only.w > 0.95);
});

test('the comparison splits a topic change by problem and follows later annotation', () => {
  const { bank, log } = bankWithHistory();
  const fitFor = (l) => ability.computeAbility({ problems: bank.problems, topics, log: l, today });
  const baseline = history.snapshotOf(fitFor(log), log, undefined, { at: '2026-11-19T00:00:00Z', date: '2026-11-19', trigger: 'sync' });

  // Sync brings in two hard bfs problems, not rated yet: nothing moves, both show a range.
  const imported = { ...log, 2600: { attempts: [{ date: today, outcome: 'synced' }] }, 2700: { attempts: [{ date: today, outcome: 'synced' }] } };
  let cmp = history.compareAbility({ baseline, current: fitFor(imported), problems: bank.problems, topics, log: imported, sync: undefined, today });
  const bfs0 = cmp.topics.find((t) => t.id === 'bfs');
  assert.equal(cmp.changed, 2);
  assert.equal(bfs0.delta, 0);
  assert.equal(bfs0.problems.length, 2);
  for (const p of bfs0.problems) assert.ok(p.pending && p.pending.clean > 0 && p.pending.usedSolution <= 0);

  // Rating one 比较完美 afterwards shows up at once, credited to that problem.
  const rated = { ...imported, 2700: { attempts: [{ date: today, outcome: 'clean' }] } };
  cmp = history.compareAbility({ baseline, current: fitFor(rated), problems: bank.problems, topics, log: rated, sync: undefined, today });
  const bfs = cmp.topics.find((t) => t.id === 'bfs');
  assert.ok(bfs.delta > 0);
  const share = bfs.problems.find((p) => p.id === 2700);
  assert.equal(share.outcome, 'clean');
  assert.ok(share.delta > 0 && !share.pending);
  assert.equal(bfs.other, bfs.delta - bfs.problems.reduce((s, p) => s + p.delta, 0));
  assert.ok(Math.abs(bfs.other) <= 2);
  assert.equal(cmp.topics.find((t) => t.id === 'seg').problems.length, 0);
});

test('snapshots: one per day (the first), recent kept, older thinned to one a month', () => {
  const snap = (date) => ({ at: `${date}T00:00:00Z`, date, trigger: 'sync', global: { theta: 1, sd: 1, n: 0 }, topics: [], evidence: {} });
  let h = history.addSnapshot({ snapshots: [] }, snap('2026-11-20'));
  const same = history.addSnapshot(h, { ...snap('2026-11-20'), at: '2026-11-20T09:00:00Z' });
  assert.equal(same, h);
  // A stand-in baseline is replaced by the first real snapshot.
  h = history.addSnapshot({ snapshots: [{ ...snap('2026-11-21'), trigger: 'baseline' }] }, snap('2026-11-21'));
  assert.deepEqual(h.snapshots.map((s) => s.trigger), ['sync']);
  h = { snapshots: [] };
  for (let d = 0; d < 70; d++) {
    const date = new Date(Date.UTC(2026, 6, 1 + d)).toISOString().slice(0, 10);
    h = history.addSnapshot(h, snap(date));
  }
  assert.equal(h.snapshots.length, 30 + 2);
  assert.deepEqual(h.snapshots.slice(0, 2).map((s) => s.date), ['2026-07-01', '2026-08-01']);
});
