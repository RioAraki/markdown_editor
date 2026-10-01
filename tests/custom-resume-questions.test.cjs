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
test.beforeEach(()=>{fs.writeFileSync(bankFile,JSON.stringify(bank));if(fs.existsSync(file))fs.unlinkSync(file);});
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
