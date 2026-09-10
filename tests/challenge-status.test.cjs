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
