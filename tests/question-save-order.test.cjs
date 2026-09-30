const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs')();
const code = ts.transpileModule(fs.readFileSync(path.resolve('components/interview/QuestionRecord.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  return [node.props?.children].flat(Infinity).map(n => find(n, type)).find(Boolean);
}
for (const ok of [true, false]) test(`day checkbox changes only after successful archive save: ${ok}`, async () => {
  let index = 0;
  const states = [true, '我的新答案', '', false, false, false, false];
  const changes = [];
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return { useState: () => [states[index++], () => {}], useEffect: () => {}, useRef: () => ({current:null}) };
    if (name.startsWith('@shared/')) return load(path.resolve('../diary/shared',name.slice(8)+'.ts'));
    if (name.startsWith('@/') || name === './AttemptHistory') return {};
    return require(name);
  }, fetch: () => response, window: { dispatchEvent() {} }, CustomEvent: class {}, setTimeout() {} });
  const tree = exports.QuestionRecord({index:1,status:'pending',trailing:' [depth-12345678] 分块',dateStr:'2026-09-29',onChange:(...args)=>changes.push(args)});
  const saving = find(tree,'textarea').props.onBlur();
  assert.equal(changes.length,0);
  finish({ok});
  await saving;
  assert.equal(changes.length,ok?1:0);
});

const unitCode = ts.transpileModule(fs.readFileSync(path.resolve('components/interview/UnitRecord.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
function findButton(node, label) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'button' && node.props.children === label) return node;
  return [node.props?.children].flat(Infinity).map(n => findButton(n, label)).find(Boolean);
}
for (const ok of [true,false]) test(`tomorrow button saves date before changing markdown, success=${ok}`, async () => {
  let index=0, payload, finish;
  const changes=[];
  const states=[true,'边界再练',false,false,false,'',false];
  const response=new Promise(resolve=>{finish=resolve;});
  const exports={};
  vm.runInNewContext(unitCode,{exports,require(name){
    if(name==='react') return {useState:()=>[states[index++],()=>{}],useEffect:()=>{},useRef:()=>({current:null})};
    if(name.startsWith('@shared/')) return load(path.resolve('../diary/shared',name.slice(8)+'.ts'));
    if(name.startsWith('@/')||name==='./AttemptHistory') return {};
    return require(name);
  },fetch:(_,args)=>{payload=JSON.parse(args.body);return response;},window:{dispatchEvent(){}},CustomEvent:class{},setTimeout(){}});
  const tree=exports.UnitRecord({index:1,status:'partial',trailing:' #621 任务调度器 · 磕磕绊绊',dateStr:'2026-09-01',onChange:(...args)=>changes.push(args)});
  const button=findButton(tree,'明天立刻重做');
  assert.equal(button.props.disabled,false);
  const saving=button.props.onClick();
  assert.equal(changes.length,0);
  assert.equal(payload.redo,true);
  assert.match(payload.redoOn,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(payload.note,'边界再练');
  finish({ok}); await saving;
  assert.equal(changes.length,ok?1:0);
  if(ok){
    const {attemptsFromDayText}=load(path.resolve('../diary/shared/interview/leetcode.ts'));
    const [row]=attemptsFromDayText('- [~]'+changes[0][1],'2026-09-01');
    assert.equal(row.attempt.redoOn,payload.redoOn);
  }
});
