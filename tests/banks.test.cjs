const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');

// Every question bank is four facts — a file, a pool test, an id prefix, and a
// place in the load order — and for three banks running they were spelled out
// in different files, so adding one meant finding all of them. The misses were
// silent: a pool matching no test made the day's slot render as a generic 打卡
// card with no questions in it (the quant bank sat that way), and an id prefix
// matching no test quietly drew Agent questions into a Python slot.
//
// These assertions run against the real plan and the real banks rather than a
// fixture, because the thing being tested is whether the roster in qbank.ts
// still describes the data on disk. A fixture would keep passing while the
// actual quant slot stayed empty.
const DATA = path.resolve(__dirname, '../../diary/data/interview');
const SHARED = path.resolve(__dirname, '../../diary/shared/interview/qbank.ts');

const load = makeLoader();
const { BANKS, bankIdForPool, bankIdForQuestionId } = load(SHARED);

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
const plan = readJson('plan.json');
const inventory = readJson('inventory.json');

/** Every inventory item that names a bank category, by item id. */
const categoryOf = {};
for (const domain of inventory.domains ?? []) {
  for (const mod of domain.modules ?? []) {
    for (const item of mod.items ?? []) {
      if (item.category) categoryOf[item.id] = item.category;
    }
  }
}

const banksOnDisk = BANKS.map((bank) => ({
  ...bank,
  questions: readJson(bank.file).questions ?? [],
}));

/** Which categories actually have questions behind them. */
const categoriesWithQuestions = new Set(
  banksOnDisk.flatMap((b) => b.questions.map((q) => q.category)),
);

test('every bank in the roster has its file on disk with questions in it', () => {
  for (const bank of banksOnDisk) {
    assert.ok(
      bank.questions.length > 0,
      `${bank.id}: ${bank.file} has no questions — the roster names a file that is empty or missing`,
    );
  }
});

test('a block whose pool reaches real questions resolves to a bank', () => {
  // The planner skips a block when `bankIdForPool` returns null, which is
  // correct for 刷题 / 简历深挖 / 休整 and catastrophic for a question bank.
  // What separates them is whether the pool leads to questions at all.
  const missed = [];
  for (const block of plan.blocks ?? []) {
    const pool = block.pool ?? [];
    const reachesQuestions = pool.some((entry) => {
      const cat = categoryOf[entry];
      if (cat) return categoriesWithQuestions.has(cat);
      // Pools name either an item or a module; a module counts if any of its
      // items does, which is how `qt-math` and `ai-qbank` are written.
      return (inventory.domains ?? []).some((d) =>
        (d.modules ?? []).some(
          (m) =>
            m.id === entry &&
            (m.items ?? []).some((i) => categoriesWithQuestions.has(i.category)),
        ),
      );
    });
    if (!reachesQuestions) continue;
    if (!bankIdForPool(pool)) missed.push(`${block.id} (pool: ${pool.join(', ')})`);
  }
  assert.deepEqual(
    missed,
    [],
    `these blocks draw on question banks but match no row in BANKS, so their slots render empty:\n  ${missed.join('\n  ')}`,
  );
});

test('each bank resolves from its own pools', () => {
  // The other direction: a row whose pool test matches nothing in the plan is
  // dead weight, and usually a typo in the prefix.
  const unreachable = BANKS.filter(
    (bank) => !(plan.blocks ?? []).some((b) => bankIdForPool(b.pool ?? []) === bank.id),
  ).map((b) => b.id);
  assert.deepEqual(unreachable, [], `no block's pool resolves to: ${unreachable.join(', ')}`);
});

test('question ids route back to the bank they came from', () => {
  // `bankIdForQuestionId` falls back to `agent`, so a bank whose prefix is
  // missing or shadowed does not fail — it silently serves Agent questions.
  for (const bank of banksOnDisk) {
    const wrong = bank.questions
      .filter((q) => bankIdForQuestionId(q.id) !== bank.id)
      .slice(0, 5)
      .map((q) => q.id);
    assert.deepEqual(
      wrong,
      [],
      `${bank.id}: these ids resolve to another bank (prefix ${JSON.stringify(bank.idPrefix)}): ${wrong.join(', ')}`,
    );
  }
});

test('id prefixes do not shadow one another', () => {
  // `startsWith` in roster order, so `py` before `py01` would swallow it.
  const prefixes = BANKS.filter((b) => b.idPrefix).map((b) => [b.id, b.idPrefix]);
  for (const [id, prefix] of prefixes) {
    for (const [otherId, otherPrefix] of prefixes) {
      if (id === otherId) continue;
      assert.ok(
        !otherPrefix.startsWith(prefix),
        `${otherId}'s prefix ${otherPrefix} starts with ${id}'s ${prefix}; whichever comes first in BANKS wins and the other never resolves`,
      );
    }
  }
});
