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
// Two kinds of assertion live here, and they belong to different places:
//
//   * the roster on its own has to be coherent — that is code, and it is
//     checked everywhere, including inside a release build;
//   * the roster has to describe the banks and plan actually on disk — that is
//     data, and a release snapshot deliberately carries none of it (only
//     `shared/`), because a build whose result depended on today's plan.json
//     would not be reproducible from its commit.
//
// So the data assertions run against the real files when they are reachable
// and skip with a reason when they are not, rather than pretending a fixture
// proves the roster still matches reality.
const SHARED = path.resolve(__dirname, '../../diary/shared/interview/qbank.ts');
const DATA = path.resolve(__dirname, '../../diary/data/interview');

const load = makeLoader();
const { BANKS, bankIdForPool, bankIdForQuestionId } = load(SHARED);

const haveData = fs.existsSync(path.join(DATA, 'plan.json'));
const dataTest = (name, fn) =>
  test(name, {
    skip: haveData
      ? false
      : `no interview data at ${DATA} — expected inside a release build, which snapshots code only`,
  }, fn);

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));

/** Loaded once, on first use, so a code-only host never touches the data dir. */
let dataCache;
function data() {
  if (dataCache) return dataCache;
  const plan = readJson('plan.json');
  const inventory = readJson('inventory.json');

  const categoryOf = {};
  for (const domain of inventory.domains ?? []) {
    for (const mod of domain.modules ?? []) {
      for (const item of mod.items ?? []) {
        if (item.category) categoryOf[item.id] = item.category;
      }
    }
  }

  const banks = BANKS.map((bank) => ({ ...bank, questions: readJson(bank.file).questions ?? [] }));
  const categoriesWithQuestions = new Set(banks.flatMap((b) => b.questions.map((q) => q.category)));

  /** Does this pool entry lead to questions — an item's category, or a module holding one? */
  const reachesQuestions = (entry) => {
    const cat = categoryOf[entry];
    if (cat) return categoriesWithQuestions.has(cat);
    return (inventory.domains ?? []).some((d) =>
      (d.modules ?? []).some(
        (m) => m.id === entry && (m.items ?? []).some((i) => categoriesWithQuestions.has(i.category)),
      ),
    );
  };

  dataCache = { plan, banks, reachesQuestions };
  return dataCache;
}

// --- roster coherence: code only, runs in a release build --------------------

test('id prefixes do not shadow one another', () => {
  // `bankIdForQuestionId` walks the roster in order and takes the first
  // `startsWith` hit, so a prefix that is a prefix of another would swallow it.
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

test('every bank is distinct and answers to its own pool and prefix', () => {
  const ids = BANKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate bank ids: ${ids.join(', ')}`);
  const files = BANKS.map((b) => b.file);
  assert.equal(new Set(files).size, files.length, `two banks share a file: ${files.join(', ')}`);
  for (const bank of BANKS) {
    if (bank.idPrefix) {
      assert.equal(
        bankIdForQuestionId(`${bank.idPrefix}99-deadbeef`),
        bank.id,
        `${bank.id}: an id starting with its own prefix resolves elsewhere`,
      );
    }
  }
  // Exactly one bank may be the fallback, or an unprefixed id has no home.
  const fallbacks = BANKS.filter((b) => !b.idPrefix).map((b) => b.id);
  assert.deepEqual(fallbacks, ['agent'], `expected only the agent bank to go unprefixed, got: ${fallbacks.join(', ')}`);
});

// --- roster vs. the data on disk: skipped where there is no data -------------

dataTest('every bank in the roster has its file on disk with questions in it', () => {
  for (const bank of data().banks) {
    assert.ok(
      bank.questions.length > 0,
      `${bank.id}: ${bank.file} has no questions — the roster names a file that is empty or missing`,
    );
  }
});

dataTest('a block whose pool reaches real questions resolves to a bank', () => {
  // This is the one that would have caught the quant slot. The planner skips a
  // block when `bankIdForPool` returns null, which is right for 刷题 / 简历深挖
  // / 休整 and catastrophic for a question bank; what separates them is whether
  // the pool leads to questions at all.
  const { plan, reachesQuestions } = data();
  const missed = [];
  for (const block of plan.blocks ?? []) {
    const pool = block.pool ?? [];
    if (!pool.some(reachesQuestions)) continue;
    if (!bankIdForPool(pool)) missed.push(`${block.id} (pool: ${pool.join(', ')})`);
  }
  assert.deepEqual(
    missed,
    [],
    `these blocks draw on question banks but match no row in BANKS, so their slots render empty:\n  ${missed.join('\n  ')}`,
  );
});

dataTest('each bank resolves from some block in the plan', () => {
  // The other direction: a row whose pool test matches nothing is dead weight,
  // and usually a typo in the pattern.
  const { plan } = data();
  const unreachable = BANKS.filter(
    (bank) => !(plan.blocks ?? []).some((b) => bankIdForPool(b.pool ?? []) === bank.id),
  ).map((b) => b.id);
  assert.deepEqual(unreachable, [], `no block's pool resolves to: ${unreachable.join(', ')}`);
});

dataTest('every question-bank block name resolves to a bank by its own pool', () => {
  // The 再答一题 endpoint decides the bank from the block's name → pool, rather
  // than from the ids already on the card. That only works if every block that
  // holds questions is reachable by name, so this asserts the mapping the
  // server actually performs. A block that falls through here would silently
  // hand the decision back to the client's guess — which is how three Agent
  // questions landed in the 数理统计 slot on 2026-09-19.
  const { plan, reachesQuestions } = data();
  const unresolved = [];
  for (const block of plan.blocks ?? []) {
    const pool = block.pool ?? [];
    if (!pool.some(reachesQuestions)) continue;
    if (!block.name) {
      unresolved.push(`${block.id} (没有 name，服务端按名字查不到它)`);
      continue;
    }
    // Exactly what route.ts does: find by name, then resolve that block's pool.
    const found = (plan.blocks ?? []).find((b) => b.name === block.name);
    if (!found || !bankIdForPool(found.pool ?? [])) {
      unresolved.push(`${block.id} / ${block.name}`);
    }
  }
  assert.deepEqual(
    unresolved,
    [],
    `这些题库 block 无法由名字解析出题库，取题会退回客户端的猜测：\n  ${unresolved.join('\n  ')}`,
  );
});

dataTest('block names are unique, so resolving by name is unambiguous', () => {
  // `find(b => b.name === blockName)` takes the first match, so two blocks
  // sharing a name would make the wrong pool decide the bank.
  const { plan } = data();
  const seen = new Map();
  const dupes = [];
  for (const b of plan.blocks ?? []) {
    if (!b.name) continue;
    if (seen.has(b.name)) dupes.push(`${b.name}: ${seen.get(b.name)} 与 ${b.id}`);
    else seen.set(b.name, b.id);
  }
  assert.deepEqual(dupes, [], `block 名重复，按名字定题库会取到错的那个：\n  ${dupes.join('\n  ')}`);
});

dataTest('question ids route back to the bank they came from', () => {
  // `bankIdForQuestionId` falls back to `agent`, so a bank whose prefix is
  // missing or shadowed does not fail — it silently serves Agent questions.
  for (const bank of data().banks) {
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
