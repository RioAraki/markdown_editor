const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
function nodes(n) { return !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function harness(fetch, storage = new Map()) {
  const states=[], refs=[], effects=[], callbacks=[]; let slot=0, refSlot=0, effectSlot=0, callbackSlot=0;
  const pendingEffects=[];
  const compiled=ts.transpileModule(fs.readFileSync('components/interview/FollowUpChain.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  vm.runInNewContext(compiled,{exports,fetch,crypto:webcrypto,window:{dispatchEvent(){},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}},CustomEvent:class{},setTimeout:fn=>({fn}),clearTimeout(){},require(name){
    if(name==='react')return {useState(initial){const i=slot++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(initial){const i=refSlot++;return refs[i]??=({current:initial});},useEffect(fn,deps){const i=effectSlot++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j]))pendingEffects.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});},useCallback(fn,deps){const i=callbackSlot++;if(!callbacks[i]||deps.some((v,j)=>v!==callbacks[i].deps[j]))callbacks[i]={deps,fn};return callbacks[i].fn;},useId:()=> 'test-id'};
    if(name==='@shared/interview/stories')return {followUpPending:f=>!f.deleted&&f.status!=='spoken'&&f.status!=='skipped',followUpStatus:f=>f.status??'todo'};
    if(name==='./RecordingPanel')return {RecordingPanel:'recording-panel'};
    if(name==='./AttemptHistory')return {AttemptHistory:'attempt-history'};
    if(name==='./CopyInterviewContext')return {CopyInterviewContext:'copy-context'};
    if(name==='@/lib/interviewContext')return require('./helpers/load-typescript.cjs')()(require('node:path').resolve('lib/interviewContext.ts'));
    return require(name);
  }});
  const props={storyId:'example',questionId:'ra-one-1',items:[],recordingPrefix:'resume:example:ra-one-1'};
  function render(component, props){slot=0;refSlot=0;effectSlot=0;callbackSlot=0;const tree=component(props);pendingEffects.splice(0).forEach(fn=>fn());return tree;}
  return {render(extra={}){return render(exports.FollowUpChain,{...props,...extra});},renderItem(props){return render(exports.FollowUpItem,props);},states,storage,unmount(){effects.forEach(e=>e?.cleanup?.());}};
}
const find=(tree,type,text)=>nodes(tree).find(n=>n.type===type&&(!text||n.props['aria-label']===text||n.props.children===text));
const flush=()=>new Promise(setImmediate);
test('empty follow-up list offers creation, preserves quote and prevents double submit',async()=>{
  const requests=[]; let finish;
  const h=harness(async(url,opts)=>{requests.push(JSON.parse(opts.body));await new Promise(r=>finish=r);return {ok:true,json:async()=>({answer:{followUps:[{id:'1',q:'追问',status:'todo'}]}})};});
  let tree=h.render();const add=find(tree,'button','＋ 记一个追问');assert.ok(add);add.props.onClick();tree=h.render();
  find(tree,'input','追问问题').props.onChange({target:{value:'模块选错怎么办？'}});
  find(tree,'textarea','触发追问的原话').props.onChange({target:{value:'按需 | 暴露\n工具'}});
  tree=h.render();const form=find(tree,'form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});await flush();
  assert.equal(requests.length,1);assert.equal(requests[0].followUpAction,'create');assert.equal(requests[0].questionId,'ra-one-1');assert.equal(requests[0].followUpQuote,'按需 | 暴露\n工具');
  finish();await flush();
});

test('failed creation draft and retry ID survive collapsing and remounting',async()=>{
  const requests=[],storage=new Map();const fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return{ok:false,json:async()=>({error:'offline'})};};
  const h=harness(fetch,storage);let tree=h.render();find(tree,'button','＋ 记一个追问').props.onClick();tree=h.render();find(tree,'input','追问问题').props.onChange({target:{value:'保留这个问题'}});tree=h.render();find(tree,'form').props.onSubmit({preventDefault(){}});await flush();h.unmount();
  const again=harness(fetch,storage);again.render();tree=again.render();assert.equal(find(tree,'input','追问问题').props.value,'保留这个问题');find(tree,'form').props.onSubmit({preventDefault(){}});await flush();assert.equal(requests[0].followUpId,requests[1].followUpId);
});

test('collapsed follow-up does not mount audio; status save includes just-typed answer',async()=>{
  const h=harness();const writes=[];const props={f:{id:'1.2',q:'Follow?',status:'todo'},recordingKey:'resume:example:ra-one-1-followup-1-2',onSave:async p=>writes.push(p)};
  let tree=h.renderItem(props);assert.equal(find(tree,'recording-panel'),undefined);find(tree,'button').props.onClick();tree=h.renderItem(props);assert.equal(find(tree,'recording-panel').props.questionKey,props.recordingKey);
  find(tree,'textarea','追问答案').props.onChange({target:{value:'刚输入的新答案'}});find(tree,'select','追问准备状态').props.onChange({target:{value:'struggled'}});await flush();
  assert.equal(writes[0].followUpAnswer,'刚输入的新答案');assert.equal(writes[0].followUpStatus,'struggled');h.unmount();
});

test('question edit draft survives remount and its fields lock during save',async()=>{
  const storage=new Map();let done;const props={f:{id:'1',q:'Old',status:'todo'},initiallyOpen:true,recordingKey:'resume:example:ra-one-1-followup-1',onSave:()=>new Promise(r=>done=r)};
  const h=harness(undefined,storage);let tree=h.renderItem(props);find(tree,'button','编辑问题').props.onClick();tree=h.renderItem(props);find(tree,'input','编辑追问问题').props.onChange({target:{value:'New question'}});h.unmount();
  const again=harness(undefined,storage);again.renderItem(props);tree=again.renderItem(props);assert.equal(find(tree,'input','编辑追问问题').props.value,'New question');find(tree,'form').props.onSubmit({preventDefault(){}});tree=again.renderItem(props);assert.equal(find(tree,'input','编辑追问问题').props.disabled,true);assert.equal(find(tree,'textarea','编辑来源原话').props.disabled,true);done();await flush();again.unmount();
});
test('failed creation retains draft and retry uses the same follow-up identity',async()=>{
  const requests=[];const h=harness(async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:false,json:async()=>({error:'保存失败'})};});
  let tree=h.render();find(tree,'button','＋ 记一个追问').props.onClick();tree=h.render();find(tree,'input','追问问题').props.onChange({target:{value:'为什么？'}});
  tree=h.render();find(tree,'form').props.onSubmit({preventDefault(){}});await flush();tree=h.render();assert.equal(find(tree,'input','追问问题').props.value,'为什么？');
  find(tree,'form').props.onSubmit({preventDefault(){}});await flush();assert.equal(requests[0].followUpId,requests[1].followUpId);
});

test('an old successful answer save cannot clear a newer draft even when text changes back',async()=>{
  const h=harness();const writes=[],resolves=[];const props={f:{id:'1',q:'Q',status:'todo'},initiallyOpen:true,recordingKey:'resume:example:ra-one-1-followup-1',onSave:p=>{writes.push(p);return new Promise(r=>resolves.push(r));}};
  const tree=h.renderItem(props);const answer=find(tree,'textarea','追问答案');
  answer.props.onChange({target:{value:'A'}});answer.props.onBlur();
  answer.props.onChange({target:{value:'B'}});answer.props.onBlur();
  answer.props.onChange({target:{value:'A'}});
  resolves[0]();await flush();resolves[1]();await flush();
  answer.props.onBlur();assert.equal(writes.length,3);assert.equal(writes[2].followUpAnswer,'A');resolves[2]();await flush();h.unmount();
});

test('copy includes live drafts, hidden completed follow-ups and unsaved new questions',()=>{
  const contextTextRef={current:null};
  const h=harness();const props={contextTextRef,getContext:()=>({question:'原题',answer:'主答案草稿'}),items:[{id:'1',q:'旧追问',answer:'旧答案',status:'todo'},{id:'2',q:'已会讲述的追问',status:'spoken'},{id:'3',q:'已移除',deleted:true}]};
  let tree=h.render(props);const child=nodes(tree).find(n=>n.props?.f?.id==='1');child.props.registerDraft('1',()=>({q:'编辑中的问题',answer:'编辑中的答案',quote:'来源草稿'}));
  find(tree,'select','筛选追问').props.onChange({target:{value:'pending'}});tree=h.render(props);
  find(tree,'button','＋ 记一个追问').props.onClick();tree=h.render(props);find(tree,'input','追问问题').props.onChange({target:{value:'还未提交的新追问'}});tree=h.render(props);
  const text=find(tree,'copy-context').props.getText();
  for(const value of ['原题','主答案草稿','编辑中的问题','编辑中的答案','来源草稿','已会讲述的追问','还未提交的新追问'])assert.ok(text.includes(value),value);
  assert.ok(!text.includes('已移除\n'));assert.ok(!text.includes('旧答案'));
  const mainText=contextTextRef.current('main');
  for(const value of ['原题','主答案草稿','编辑中的问题','编辑中的答案','来源草稿','已会讲述的追问','还未提交的新追问','本轮优先讨论原问题'])assert.ok(mainText.includes(value),value);
  assert.ok(text.includes('优先处理我尚未准备好的追问'));
  h.unmount();assert.equal(contextTextRef.current,null);
});
