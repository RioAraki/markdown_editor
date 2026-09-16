const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs')();
const api = load(path.resolve('lib/nextResumeSection.ts'));
const meta = Object.fromEntries([
  ['ra-one-1', 'a', 'one'], ['ra-one-2', 'a', 'one'],
  ['ra-two-1', 'a', 'two'], ['ra-two-2', 'a', 'two'],
  ['sb-one-1', 'b', 'one'],
].map(([id, storyId, clusterId]) => [id, { id, storyId, clusterId, storyTitle: storyId, clusterTitle: clusterId, q: id }]));
const units = ids => ids.map(id => ({ status: 'pending', trailing: ` [${id}] question` }));

test('next section ignores completion, returns the entire next group and crosses projects without wrapping', () => {
  for (const status of ['pending', 'partial', 'done']) {
    const current = units(['ra-one-1', 'ra-one-2']).map(u => ({ ...u, status }));
    assert.deepEqual(api.nextResumeSection(meta, current).map(q => q.id), ['ra-two-1', 'ra-two-2']);
  }
  assert.deepEqual(api.nextResumeSection(meta, units(['ra-one-1','ra-two-1','ra-two-2'])).map(q=>q.id), ['sb-one-1']);
  assert.equal(api.nextResumeSection(meta, units(['sb-one-1'])), undefined);
  assert.equal(api.nextResumeSection(meta, units(['obsolete'])), undefined);
});

test('continuation appends once under rapid clicks and survives day markdown roundtrip', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/interview/AddResumeSection.tsx','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react') return { useRef: value => ({ current: value }), useEffect: fn => fn() };
    if (name === '@/lib/nextResumeSection') return api;
    return require(name);
  }});
  const parser = load(path.resolve('lib/interviewParser.ts'));
  let doc = parser.parseInterviewDayDoc('# 2026-09-16\n\n- 简历深挖 · 当前部分\n  - [x] [ra-one-1] 已答\n  - [ ] [ra-one-2] 未答\n', '2026-09-16.md');
  const index = doc.blocks.findIndex(b=>b.kind==='task-units');
  assert.ok(index>=0);
  const original = JSON.stringify(doc.blocks[index].units);
  const tree = exports.AddResumeSection({ units: doc.blocks[index].units, meta, onAdd: trailing => { doc = parser.addUnit(doc,index,trailing); } });
  const button = tree.props.children[0];
  button.props.onClick();button.props.onClick();
  assert.equal(doc.blocks[index].units.length,4);
  assert.equal(JSON.stringify(doc.blocks[index].units.slice(0,2)),original);
  const reloaded = parser.parseInterviewDayDoc(parser.serializeInterviewDayDoc(doc), '2026-09-16.md');
  assert.deepEqual(api.nextResumeSection(meta,reloaded.blocks[index].units).map(q=>q.id), ['sb-one-1']);
});
