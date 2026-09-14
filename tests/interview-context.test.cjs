const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs')();
test('context includes question, current draft, sources and all active follow-ups with honest simulation instructions',()=>{
  const { interviewContext }=load(path.resolve('lib/interviewContext.ts'));
  const text=interviewContext({question:'怎么选择工具？',answer:'尚未保存的主答案',storyTitle:'项目',clusterTitle:'工具',resumeAnchor:'tool',resume:{lines:[{id:'tool',kind:'bullet',text:'简历原句'}]},tests:'机制',gaps:['未解释回退'],revisions:[{date:'2026-09-01',text:'旧版主答案'}]},[
    {id:'1',q:'选错怎么办？',answer:'追问草稿',quote:'按需暴露',status:'struggled'},
    {id:'2',q:'如何验证？',status:'todo'},
    {id:'3',q:'已移除的题',deleted:true},
  ]);
  for(const value of ['怎么选择工具？','尚未保存的主答案','简历原句','未解释回退','旧版主答案','选错怎么办？','追问草稿','按需暴露','如何验证？','假设','如果由你负责','不要编造','录音']) assert.ok(text.includes(value),value);
  assert.ok(!text.includes('已移除的题'));
});

test('approved format resolves actual resume text and its parent, never unrelated bullets or raw IDs',()=>{
  const { interviewContext }=load(path.resolve('lib/interviewContext.ts'));
  const text=interviewContext({question:'原面试问题',answer:'我的当前回答内容',resumeAnchor:'rs-child',resume:{lines:[
    {id:'rs-parent',kind:'bullet',text:'Built **research agent**.'},
    {id:'rs-child',kind:'sub',parent:'rs-parent',text:'Shipped a **30-tool layer**.'},
    {id:'other',kind:'bullet',text:'Unrelated confidential project'},
  ]}},[{id:'1',q:'追问具体机制',status:'todo'}]);
  for(const value of ['Built **research agent**.','Shipped a **30-tool layer**.'])assert.ok(text.includes(value));
  assert.ok(!text.includes('rs-child'));assert.ok(!text.includes('Unrelated confidential project'));
  const headings=['【系统提示词：你的角色与协作方式】','【内容提示词：这次要讨论的面试上下文】','一、我的简历原文片段','二、我设想的面试官会针对该片段问','三、我的当前回答','四、我设想的面试官会继续追问','五、我希望你现在怎样帮助我'];
  let previous=-1;for(const heading of headings){const index=text.indexOf(heading);assert.ok(index>previous,heading);previous=index;}
  assert.ok(!text.includes('原油')); // The approved example must not become a hardcoded scenario.
});

test('root resume bullet is included once; unresolved anchors explicitly request context',()=>{
  const { interviewContext }=load(path.resolve('lib/interviewContext.ts'));
  const root=interviewContext({question:'Q',resumeAnchor:'root',resume:{lines:[{id:'root',kind:'bullet',text:'A unique resume bullet'}]}},[]);
  assert.equal(root.split('A unique resume bullet').length-1,1);
  const missing=interviewContext({question:'Q',resumeAnchor:'missing',resume:{lines:[]}},[]);
  assert.match(missing,/未找到.*简历原文/);assert.ok(!missing.includes('missing'));
});
test('missing answers are explicit and empty drafts are not replaced by invented answers',()=>{
  const { interviewContext }=load(path.resolve('lib/interviewContext.ts'));
  const text=interviewContext({question:'Q',answer:''},[{id:'draft',q:'未保存追问',answer:''}]);
  assert.match(text,/尚未填写/);assert.match(text,/未保存追问/);
});
