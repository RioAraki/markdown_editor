const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real TSX handlers with controlled hook state and HTTP responses.
// No browser or live diary writes are needed for this initialization regression.
const file = path.resolve(__dirname, '../components/interview/TodayPicker.tsx');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function renderPicker({ exists = true, ready = true, ok = true } = {}) {
  const states = [
    ready ? { suggestedItems: {}, suggestedProblems: {}, suggestedStories: {}, suggestedQuestions: {}, trackTypes: {} } : null,
    { blocks: [{ id: 'resume', name: '简历深挖' }, { id: 'system', name: '系统设计' }], presets: [] },
    ['resume', 'system'], false, {}, null, false, null,
    null, null, 0, 0, ready ? JSON.stringify(['2026-09-09', exists, ['resume', 'system'], 0]) : null,
    '2026-09-09',
  ];
  const requests = [];
  let index = 0;
  let refreshes = 0;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return {
        useState() {
          const slot = index++;
          return [states[slot], (value) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
        },
        useEffect() {},
        useMemo: (fn) => fn(),
      };
      if (name === '@/contexts/InterviewContext') return { useInterview: () => ({
        days: exists ? [{ dateStr: '2026-09-09', blocks: [] }] : [],
        refresh: async () => { refreshes++; },
      }) };
      if (name === '@/lib/dateUtils') return { getTodayDate: () => '2026-09-09' };
      return require(name);
    },
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok }; },
  }, { filename: file });
  return { tree: exports.TodayPicker(), states, requests, refreshes: () => refreshes };
}

function findCreateButton(node) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'button' && node.props.children?.includes('创建今天的记录')) return node;
  return [node.props?.children].flat(Infinity).map(findCreateButton).find(Boolean);
}

for (const exists of [true, false]) {
  test(exists ? 'existing day can append selected blocks' : 'new day can create selected blocks', async () => {
    const h = renderPicker({ exists });
    if (exists) h.tree.props.onAdd();
    else findCreateButton(h.tree).props.onClick();
    await new Promise(setImmediate);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, '/api/interview/2026-09-09');
    assert.equal(h.requests[0].method, 'POST');
    assert.deepEqual(JSON.parse(h.requests[0].body), {
      append: exists, blocks: ['resume', 'system'], title: '自选', items: {}, problems: {}, challenges: {}, questions: {},
    });
    assert.equal(h.refreshes(), 1);
    assert.equal(h.states[2].length, 0);
    assert.equal(h.states[6], false);
    assert.equal(h.states[7], null);
  });
}

test('failed append preserves selection and exposes a retry error', async () => {
  const h = renderPicker({ ok: false });
  h.tree.props.onAdd();
  await new Promise(setImmediate);
  assert.equal(h.refreshes(), 0);
  assert.deepEqual(h.states[2], ['resume', 'system']);
  assert.equal(h.states[6], false);
  assert.equal(h.states[7], '添加失败，稍后重试');
});

test('append waits for suggestions before submitting', async () => {
  const h = renderPicker({ ready: false });
  assert.equal(h.tree.props.ready, false);
  h.tree.props.onAdd();
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 0);
});

// A small effect runner exercises request ordering, cleanup and rerenders of
// the real component. HTTP promises remain pending until the test resolves them.
function mountPicker({ isLoading = false, exists = false } = {}) {
  let dayBlocks = [];
  const states = [], effects = [], requests = [];
  let index = 0, effectIndex = 0, pending = [], tree;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, AbortController,
    require(name) {
      if (name === 'react') return {
        useState(initial) {
          const slot = index++;
          if (!(slot in states)) states[slot] = initial;
          return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
        },
        useMemo: fn => fn(),
        useEffect(fn, deps) {
          const slot = effectIndex++;
          if (!effects[slot] || deps.some((v, i) => !Object.is(v, effects[slot].deps[i]))) {
            pending.push(() => {
              effects[slot]?.cleanup?.();
              effects[slot] = { deps, cleanup: fn() };
            });
          }
        },
      };
      if (name === '@/contexts/InterviewContext') return { useInterview: () => ({ isLoading, days: exists ? [{ dateStr: '2026-09-09', blocks: dayBlocks }] : [], refresh: async () => {} }) };
      if (name === '@/lib/dateUtils') return { getTodayDate: () => '2026-09-09' };
      return require(name);
    },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, ...options, resolve })),
  }, { filename: file });
  const render = (beforeEffects) => {
    index = effectIndex = 0;
    tree = exports.TodayPicker();
    beforeEffects?.(tree);
    const run = pending; pending = []; run.forEach(fn => fn());
    return tree;
  };
  const respond = async (n, body, ok = true) => {
    requests[n].resolve({ ok, json: async () => body });
    await new Promise(setImmediate);
    render(); render();
  };
  render();
  return { requests, render, respond, tree: () => tree, choose: ids => { states[2] = ids; render(); render(); }, context: (loading, hasToday, blocks = dayBlocks, beforeEffects) => { isLoading = loading; exists = hasToday; dayBlocks = blocks; render(beforeEffects); render(); render(); } };
}
const menuFixture = { blocks: [{ id: 'resume', name: '简历深挖', required: true }], presets: [], trackTypes: {} };
const planFixture = { suggestedItems: {}, trackTypes: {}, suggestion: { tasks: [] } };
const treeText = node => !node || typeof node !== 'object' ? String(node ?? '') : [node.props?.children].flat(Infinity).map(treeText).join(' ');
function findButton(node, text) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'button' && treeText(node).includes(text)) return node;
  return [node.props?.children].flat(Infinity).map(child => findButton(child, text)).find(Boolean);
}

test('startup shows loading and requests suggestions only after required blocks are known', async () => {
  const h = mountPicker();
  assert.match(treeText(h.tree()), /加载/);
  assert.deepEqual(h.requests.map(r => r.url), ['/api/interview/blocks']);
  await h.respond(0, menuFixture);
  assert.deepEqual(h.requests.map(r => r.url), ['/api/interview/blocks', '/api/interview/today?blocks=resume']);
  assert.equal(findCreateButton(h.tree()).props.disabled, true);
});

test('replanning aborts stale requests and cannot submit older recommendations', async () => {
  const h = mountPicker(); await h.respond(0, menuFixture);
  await h.respond(1, planFixture);
  assert.equal(findCreateButton(h.tree()).props.disabled, false);
  h.choose(['system']);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(findCreateButton(h.tree()).props.disabled, true);
  findCreateButton(h.tree()).props.onClick();
  assert.equal(h.requests.length, 3);
  h.choose(['resume', 'system']);
  assert.equal(h.requests[2].signal.aborted, true);
  await h.respond(2, planFixture);
  assert.equal(findCreateButton(h.tree()).props.disabled, true);
  await h.respond(3, planFixture);
  assert.equal(findCreateButton(h.tree()).props.disabled, false);
});

test('deselecting all blocks never falls back to a default plan', async () => {
  const h = mountPicker(); await h.respond(0, menuFixture);
  h.choose([]);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.match(treeText(h.tree()), /什么都没选/);
});

test('menu failures and suggestion failures have visible independent retries', async () => {
  const h = mountPicker(); await h.respond(0, {}, false);
  assert.match(treeText(h.tree()), /清单加载失败/);
  findButton(h.tree(), '重试').props.onClick(); h.render();
  await h.respond(1, menuFixture);
  await h.respond(2, {}, false);
  assert.match(treeText(h.tree()), /排题失败/);
  assert.match(treeText(h.tree()), /改今天的组成/);
  findButton(h.tree(), '重试').props.onClick(); h.render();
  assert.equal(h.requests[3].url, '/api/interview/today?blocks=resume');
});

for (const exists of [false, true]) {
  test(`menu loads during context loading and waits for ${exists ? 'existing' : 'new'} day before choosing defaults`, async () => {
    const h = mountPicker({ isLoading: true });
    await h.respond(0, menuFixture);
    assert.equal(h.requests.length, 1);
    assert.match(treeText(h.tree()), /加载/);
    assert.equal(findCreateButton(h.tree()), undefined);
    h.context(false, exists);
    assert.equal(h.requests.filter(r => r.url === '/api/interview/blocks').length, 1);
    if (exists) {
      assert.equal(h.requests.length, 1);
      assert.equal(h.tree().props.chosen.length, 0);
    } else {
      assert.equal(h.requests[1].url, '/api/interview/today?blocks=resume');
      await h.respond(1, planFixture);
      h.choose([]);
      h.context(true, false);
      h.context(false, false);
      assert.equal(h.requests.length, 2, 'refresh must preserve an explicitly empty choice');
    }
  });
}

test('context refresh aborts pending recommendations and waits before reusing selection', async () => {
  const h = mountPicker(); await h.respond(0, menuFixture);
  h.context(true, false);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(findCreateButton(h.tree()), undefined);
  await h.respond(1, planFixture);
  assert.equal(h.requests.length, 2);
  h.context(false, false);
  assert.equal(h.requests[2].url, '/api/interview/today?blocks=resume');
  assert.equal(findCreateButton(h.tree()).props.disabled, true);
  await h.respond(2, planFixture);
  assert.equal(findCreateButton(h.tree()).props.disabled, false);
  assert.equal(h.requests.filter(r => r.url === '/api/interview/blocks').length, 1);
});

for (const exists of [false, true]) {
  test(`${exists ? 'external append' : 'external creation'} removes already-added selections before they can submit`, async () => {
    const h = mountPicker({ exists });
    await h.respond(0, { ...menuFixture, blocks: [...menuFixture.blocks, { id: 'system', name: '系统设计' }, { id: 'coding', name: '刷题' }] });
    h.choose(['resume', 'system']);
    await h.respond(h.requests.length - 1, planFixture);
    const count = h.requests.length;
    h.context(false, true, [{ label: '简历深挖 · 30min' }], tree => {
      assert.equal(tree.props.ready, false, 'old plan must be invalid before reconciliation effects');
      assert.deepEqual(Array.from(tree.props.chosen), ['system']);
      tree.props.onAdd();
      assert.equal(h.requests.length, count, 'no POST may use a hidden selection');
    });
    assert.equal(h.requests.length, count + 1);
    assert.equal(h.requests.at(-1).url, '/api/interview/today?blocks=system');
    await h.respond(count, planFixture);
    assert.equal(h.tree().props.ready, true);
    h.context(false, true, [{ label: '简历深挖' }, { label: '系统设计' }]);
    assert.deepEqual(Array.from(h.tree().props.chosen), []);
    assert.equal(h.tree().props.ready, false);
    assert.equal(h.requests.length, count + 1, 'no default request when all selected blocks were added elsewhere');
  });
}
