const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { parseProblemUnit } = require('./helpers/load-typescript.cjs')()(path.resolve('../diary/shared/interview/leetcode.ts'));
const compiled = ts.transpileModule(fs.readFileSync('components/interview/DeclareProblem.tsx','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = () => new Promise(setImmediate);
function render({ ok = true, duplicate = false, delayed = false } = {}) {
  const states=[true,'https://leetcode.cn/problems/two-sum/',false,'',''];
  const requests=[], additions=[], cleanups=[];
  let slot=0, resolve;
  const exports={};
  vm.runInNewContext(compiled,{exports, AbortController, CustomEvent: class {}, window:{dispatchEvent(){}}, fetch: async(url,options)=>{
    requests.push({url,...options});
    if(delayed) await new Promise(r=>{resolve=r;});
    return {ok,json:async()=>ok?{problem:{id:1,title:'两数之和'},unitText:'#1 两数之和'}:{error:'当天已有此题'}};
  }, require(name){
    if(name==='react')return { useState(){const index=slot++;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];}, useId:()=>'declare-test', useRef:current=>({current}),useEffect(fn){const cleanup=fn();if(cleanup)cleanups.push(cleanup);} };
    if(name==='@/contexts/InterviewContext')return {useInterview:()=>({days:[{dateStr:'2026-09-13',blocks:[{kind:'task-units',units:duplicate?[{trailing:'#1 两数之和'}]:[]}]}]})};
    if(name==='@shared/interview/leetcode')return {parseProblemUnit};
    return require(name);
  }});
  const tree=exports.DeclareProblem({dateStr:'2026-09-13',units:[],onAdd:text=>additions.push(text),onBusyChange(){}});
  const form=tree.props.children.find(n=>n&&n.type==='form');
  return {submit:()=>form.props.onSubmit({preventDefault(){}}),requests,additions,states,unmount:()=>cleanups.forEach(fn=>fn()),resolve:()=>resolve()};
}
test('URL declaration appends a normal problem unit only once under double submission',async()=>{
  const h=render({delayed:true});h.submit();h.submit();
  assert.equal(h.requests.length,1);h.resolve();await flush();
  assert.deepEqual(h.additions,[' #1 两数之和']);
  assert.equal(JSON.parse(h.requests[0].body).date,'2026-09-13');
});
test('a duplicate or failed declaration shows an error and never appends',async()=>{
  for(const options of [{ok:false},{duplicate:true}]){
    const h=render(options);h.submit();await flush();
    assert.deepEqual(h.additions,[]);assert.ok(h.states[3]);
  }
});
test('leaving during resolution aborts and never appends to another displayed day',async()=>{
  const h=render({delayed:true});h.submit();h.unmount();h.resolve();await flush();
  assert.equal(h.requests[0].signal.aborted,true);
  assert.deepEqual(h.additions,[]);
});
