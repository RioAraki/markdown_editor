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
