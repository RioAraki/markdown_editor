const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-resume-'));
process.env.INTERVIEW_LOG_PATH = path.join(root,'log');
const load = require('./helpers/load-typescript.cjs')();
const route = load(path.resolve('app/api/interview/stories/route.ts'));
const {loadStories} = load(path.resolve('../diary/shared/interview/load.ts'));
const {parseStoryUnit} = load(path.resolve('../diary/shared/interview/stories.ts'));
const bank={stories:[{id:'fixture',title:'Fixture',order:0,clusters:[{id:'cluster',title:'Topic',questions:[{id:'ra-one-1',q:'Original',p:0,lens:'机制',tests:'test'}]}]}]};
const file=path.join(root,'custom-resume-questions.json');
const bankFile=path.join(root,'stories.json');
const id=n=>'cq-custom-'+String(n).padStart(40,'0');
const post=(n,more={})=>route.POST(new Request('http://localhost/api/interview/stories',{method:'POST',body:JSON.stringify({storyId:'fixture',clusterId:'cluster',id:id(n),question:'Actual interview question '+n,...more})}));
test.beforeEach(()=>{fs.writeFileSync(bankFile,JSON.stringify(bank));if(fs.existsSync(file))fs.unlinkSync(file); const orderFile=path.join(root,'resume-question-order.json');if(fs.existsSync(orderFile))fs.unlinkSync(orderFile);});
test.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true});delete process.env.INTERVIEW_LOG_PATH;});

test('independent questions persist outside generated bank; concurrent creation and retries never lose or duplicate them',async()=>{
  const before=fs.readFileSync(bankFile,'utf8');
  assert.deepEqual((await Promise.all([post(1),post(2)])).map(r=>r.status),[201,201]);
  assert.equal((await post(1)).status,200);
  assert.equal(fs.readFileSync(bankFile,'utf8'),before);
  let result=await loadStories(root);
  assert.equal(result.bank.stories[0].clusters[0].questions.length,3);
  const q=result.bank.stories[0].clusters[0].questions[1];
  assert.equal(q.custom,true);assert.equal(parseStoryUnit(`[${q.id}] ${q.q}`).id,q.id);
  const put=await route.PUT(new Request('http://localhost/api/interview/stories',{method:'PUT',body:JSON.stringify({storyId:'fixture',questionId:id(1),answer:'Independent answer',status:'spoken'})}));
  assert.equal(put.status,200);
  const follow=await route.PUT(new Request('http://localhost/api/interview/stories',{method:'PUT',body:JSON.stringify({storyId:'fixture',questionId:id(1),followUpAction:'create',followUpId:'1',followUpQuestion:'Its own follow-up'})}));
  assert.equal(follow.status,200);
  fs.writeFileSync(bankFile,JSON.stringify({...bank,source:'updated resume'}));
  result=await loadStories(root);
  assert.equal(result.bank.stories[0].clusters[0].questions.length,3);
  assert.equal(result.answers.fixture[id(1)].answer,'Independent answer');
  assert.equal(result.answers.fixture[id(1)].followUps[0].q,'Its own follow-up');
});

test('invalid categories and traversal IDs cannot create data; corrupt custom file is preserved',async()=>{
  assert.equal((await post(1,{clusterId:'missing'})).status,404);
  assert.equal((await post(1,{id:'../../bad'})).status,400);
  assert.equal((await post(1,{question:'  '})).status,400);
  assert.equal(fs.existsSync(file),false);
  fs.writeFileSync(file,'broken');const old=console.error;console.error=()=>{};
  try{assert.equal((await post(1)).status,500);}finally{console.error=old;}
  assert.equal(fs.readFileSync(file,'utf8'),'broken');
});


test('multiline custom questions remain one valid daily-plan unit',async()=>{
  const response=await post(3,{question:'First line\nSecond line'});
  assert.equal(response.status,201);
  assert.equal((await response.json()).question.q,'First line Second line');
});


const reorder=(questionIds,expectedOrder,clusterId='cluster')=>route.PATCH(new Request('http://localhost/api/interview/stories',{method:'PATCH',body:JSON.stringify({storyId:'fixture',clusterId,questionIds,expectedOrder})}));
test('saved order interleaves authored and custom questions; answers are untouched and new questions append',async()=>{
  await post(1);await post(2);
  const original=['ra-one-1',id(1),id(2)];
  const wanted=[id(2),'ra-one-1',id(1)];
  const answerFile=path.join(root,'stories/fixture.md');
  fs.mkdirSync(path.dirname(answerFile),{recursive:true});
  fs.writeFileSync(answerFile,'### ra-one-1\n<!-- status: spoken | date: 2020-01-01 -->\n**我的答案**\nKept answer\n');
  const before=fs.readFileSync(answerFile,'utf8');
  assert.equal((await reorder(wanted,original)).status,200);
  assert.equal((await reorder(wanted,original)).status,200); // retry
  assert.deepEqual((await loadStories(root)).bank.stories[0].clusters[0].questions.map(q=>q.id),wanted);
  assert.equal(fs.readFileSync(answerFile,'utf8'),before);
  await post(3);
  assert.deepEqual((await loadStories(root)).bank.stories[0].clusters[0].questions.map(q=>q.id),[...wanted,id(3)]);
  // Resume refresh removes a question but preserves the relative custom order.
  const changed=JSON.parse(JSON.stringify(bank));changed.stories[0].clusters[0].questions=[];
  fs.writeFileSync(bankFile,JSON.stringify(changed));
  assert.deepEqual((await loadStories(root)).bank.stories[0].clusters[0].questions.map(q=>q.id),[id(2),id(1),id(3)]);
});

test('invalid and stale orders never drop questions or overwrite the saved order',async()=>{
  await post(1);await post(2);
  const original=['ra-one-1',id(1),id(2)];const wanted=[id(2),id(1),'ra-one-1'];
  assert.equal((await reorder(wanted,original)).status,200);
  const file=path.join(root,'resume-question-order.json');const before=fs.readFileSync(file,'utf8');
  assert.equal((await reorder([id(1),'ra-one-1',id(2)],original)).status,409);
  assert.equal((await reorder([id(1)],wanted)).status,409);
  assert.equal((await reorder([id(1),id(1)],wanted)).status,400);
  assert.equal((await reorder([id(1)],wanted,'missing')).status,404);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('concurrent reorders in different categories both persist',async()=>{
  const copy=JSON.parse(JSON.stringify(bank));
  copy.stories[0].clusters[0].questions.push({id:'ra-one-2',q:'Second',p:1,lens:'机制',tests:'test'});
  copy.stories[0].clusters.push({id:'other',title:'Other',questions:[{id:'ra-two-1',q:'One',p:0,lens:'机制',tests:'test'},{id:'ra-two-2',q:'Two',p:1,lens:'机制',tests:'test'}]});
  fs.writeFileSync(bankFile,JSON.stringify(copy));
  const responses=await Promise.all([reorder(['ra-one-2','ra-one-1'],['ra-one-1','ra-one-2']),reorder(['ra-two-2','ra-two-1'],['ra-two-1','ra-two-2'],'other')]);
  assert.deepEqual(responses.map(r=>r.status),[200,200]);
  const result=await loadStories(root);
  assert.deepEqual(result.bank.stories[0].clusters.map(c=>c.questions.map(q=>q.id)),[['ra-one-2','ra-one-1'],['ra-two-2','ra-two-1']]);
});
