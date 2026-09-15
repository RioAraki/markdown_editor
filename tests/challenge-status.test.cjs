const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = ts.transpileModule(fs.readFileSync('components/interview/ChallengeRecord.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function find(node, check) {
  if (!node || typeof node !== 'object') return;
  if (check(node)) return node;
  return [node.props?.children].flat(Infinity).map(n => find(n, check)).find(Boolean);
}
test('marking struggled immediately after typing saves the unsaved answer with its status', async () => {
  let slot = 0;
  const requests = [];
  const exports = {};
  vm.runInNewContext(compile, { exports, setTimeout, clearTimeout, CustomEvent: class {}, window: { dispatchEvent() {} }, fetch: async (url, options) => {
    requests.push(JSON.parse(options.body)); return { ok: true };
  }, require(name) {
    if (name === 'react') return {
      useState(value) { return [slot++ === 0 ? true : value, () => {}]; },
      useRef(value) { return { current: value }; }, useCallback: fn => fn, useEffect() {},
    };
    if (name.startsWith('@shared/')) return { STATUS_LABEL: { draft: '有初稿' }, GRADE_HINT: {} };
    if (name.startsWith('./') || name.startsWith('@/')) return {};
    return require(name);
  }});
  const tree = exports.ChallengeRecord({ index: 1, status: 'partial', trailing: '[ra-one-1] Question',
    meta: { 'ra-one-1': { id: 'ra-one-1', storyId: 'example', q: 'Question' } },
    saved: { 'ra-one-1': { status: 'draft', answer: 'old answer' } }, onChange() {},
  });
  find(tree, n => n.type === 'textarea').props.onChange({ target: { value: 'new unsaved answer' } });
  find(tree, n => n.type === 'button' && n.props.children === '磕磕绊绊').props.onClick();
  await new Promise(setImmediate);
  assert.equal(requests[0].status, 'struggled');
  assert.equal(requests[0].answer, 'new unsaved answer');
});

test('main answer copy includes the current unsaved answer and delegates to the live follow-up snapshot', () => {
  let slot = 0;
  const exports = {};
  const { interviewContext } = require('./helpers/load-typescript.cjs')()(path.resolve('lib/interviewContext.ts'));
  vm.runInNewContext(compile, { exports, require(name) {
    if (name === 'react') return {
      useState(value) { return [slot++ === 0 ? true : value, () => {}]; },
      useRef(value) { return { current: value }; }, useCallback: fn => fn, useEffect() {},
    };
    if (name === './CopyInterviewContext') return { CopyInterviewContext: 'copy-context' };
    if (name === './FollowUpChain') return { FollowUpChain: 'follow-ups' };
    if (name === '@/lib/interviewContext') return { interviewContext };
    if (name.startsWith('@shared/')) return { STATUS_LABEL: { draft: '有初稿' }, GRADE_HINT: {} };
    if (name.startsWith('./') || name.startsWith('@/')) return {};
    return require(name);
  }});
  const tree = exports.ChallengeRecord({ index: 1, status: 'partial', trailing: '[ra-one-1] 原问题',
    meta: { 'ra-one-1': { id: 'ra-one-1', storyId: 'example', q: '原问题', resumeAnchor: 'source' } },
    resume: { lines: [{ id: 'source', kind: 'bullet', text: '简历原片段' }] },
    saved: { 'ra-one-1': { status: 'draft', answer: '旧答案', followUps: [] } }, onChange() {},
  });
  find(tree, n => n.type === 'textarea').props.onChange({ target: { value: '尚未保存的主回答' } });
  const copy = find(tree, n => n.type === 'copy-context');
  const text = copy.props.getText();
  for (const value of ['原问题', '简历原片段', '尚未保存的主回答', '本轮优先讨论原问题']) assert.ok(text.includes(value), value);
  const chain = find(tree, n => n.type === 'follow-ups');
  chain.props.contextTextRef.current = focus => {
    assert.equal(focus, 'main');
    return interviewContext(chain.props.getContext(), [{ id: 'draft', q: '追问实时草稿' }], focus);
  };
  assert.ok(copy.props.getText().includes('追问实时草稿'));
});
