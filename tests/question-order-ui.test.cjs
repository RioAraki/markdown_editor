const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
function harness(){
 const states=[],refs=[],requests=[];let slot=0,ref=0;
 const exports={};
 const source=ts.transpileModule(fs.readFileSync('components/interview/QuestionOrder.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 let hit=null;
 vm.runInNewContext(source,{exports,document:{elementFromPoint:()=>hit},window:{dispatchEvent(){}},CustomEvent:class{},fetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({})};},require(name){if(name==='react')return {useState(initial){const i=slot++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=ref++;return refs[i]??={current:initial};}};return require(name);}});
 const props={storyId:'s',clusterId:'c',questions:['a','b','c','d'].map(id=>({id,q:id}))};
 return {requests,hit(id){hit=id?{closest:()=>({dataset:{questionId:id},getBoundingClientRect:()=>({top:100,height:100})})}:null;},render(){slot=0;ref=0;const tree=exports.QuestionOrder(props);const ol=nodes(tree).find(n=>n.type==='ol');if(ol)ol.props.ref.current={contains:()=>true};return tree;}};
}
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===label||n.props.children===label));
const rows=tree=>nodes(tree).filter(n=>n.type==='li');
const ids=tree=>rows(tree).map(n=>n.props['data-question-id']);
const event=y=>({preventDefault(){},button:0,pointerId:1,clientX:200,clientY:y,currentTarget:{setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}}});

test('pointer drag downward and upward saves reordered stable IDs',async()=>{
 const h=harness();let tree=h.render();button(tree,'调整题目顺序').props.onClick();tree=h.render();
 button(tree,'拖动第1题排序').props.onPointerDown(event(120));tree=h.render();h.hit('c');
 button(tree,'拖动第1题排序').props.onPointerMove(event(180));tree=h.render();assert.ok(rows(tree)[2].props.className.includes('border-b-indigo-600'));
 button(tree,'拖动第1题排序').props.onPointerUp(event(180));tree=h.render();assert.deepEqual(ids(tree),['b','c','a','d']);
 button(tree,'拖动第4题排序').props.onPointerDown(event(120));tree=h.render();h.hit('b');button(tree,'拖动第4题排序').props.onPointerMove(event(110));tree=h.render();button(tree,'拖动第4题排序').props.onPointerUp(event(110));tree=h.render();
 assert.deepEqual(ids(tree),['d','b','c','a']);
 button(tree,'保存顺序').props.onClick();await new Promise(setImmediate);
 assert.deepEqual(h.requests[0].questionIds,['d','b','c','a']);assert.deepEqual(h.requests[0].expectedOrder,['a','b','c','d']);
});

test('cancelled drags, outside targets and same-row drops leave order unchanged',()=>{
 const h=harness();let tree=h.render();button(tree,'调整题目顺序').props.onClick();tree=h.render();
 button(tree,'拖动第2题排序').props.onPointerDown(event(120));tree=h.render();h.hit('d');button(tree,'拖动第2题排序').props.onPointerMove(event(180));tree=h.render();button(tree,'拖动第2题排序').props.onPointerCancel();tree=h.render();button(tree,'拖动第2题排序').props.onPointerUp(event(180));tree=h.render();assert.deepEqual(ids(tree),['a','b','c','d']);
 button(tree,'拖动第2题排序').props.onPointerDown(event(120));tree=h.render();h.hit(null);button(tree,'拖动第2题排序').props.onPointerMove(event(180));tree=h.render();button(tree,'拖动第2题排序').props.onPointerUp(event(180));tree=h.render();assert.deepEqual(ids(tree),['a','b','c','d']);
 button(tree,'拖动第2题排序').props.onPointerDown(event(120));tree=h.render();h.hit('b');button(tree,'拖动第2题排序').props.onPointerMove(event(180));tree=h.render();button(tree,'拖动第2题排序').props.onPointerUp(event(180));tree=h.render();assert.deepEqual(ids(tree),['a','b','c','d']);
});
