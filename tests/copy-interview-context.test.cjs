const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code=ts.transpileModule(fs.readFileSync('components/interview/CopyInterviewContext.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function setup(clipboard){const states=[];let i=0;const exports={};vm.runInNewContext(code,{exports,navigator:{clipboard},require(name){if(name==='react')return {useState(v){const k=i++;if(!(k in states))states[k]=v;return[states[k],value=>states[k]=value];}};return require(name);}});return{render(getText){i=0;return exports.CopyInterviewContext({getText});}};}
test('copy builds text on click and reports success only after clipboard resolves',async()=>{
  const copied=[];let latest='old';const h=setup({writeText:async text=>copied.push(text)});const tree=h.render(()=>latest);latest='current draft';tree.props.children[0].props.onClick();await new Promise(setImmediate);assert.deepEqual(copied,['current draft']);assert.match(h.render(()=>latest).props.children[1].props.children,/已复制/);
});
test('clipboard denial and unavailable API offer complete selectable text without claiming success',async()=>{
  for(const api of [undefined,{writeText:async()=>{throw Error('denied');}}]){const h=setup(api);h.render(()=>'完整提示词\n上下文').props.children[0].props.onClick();await new Promise(setImmediate);const tree=h.render(()=>'');assert.equal(tree.props.children[2].props.value,'完整提示词\n上下文');assert.equal(tree.props.children[2].props.readOnly,true);assert.ok(!tree.props.children[1].props.children.includes('已复制'));}
});
