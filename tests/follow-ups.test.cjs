const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'follow-ups-'));
process.env.INTERVIEW_LOG_PATH = path.join(root, 'log');
const load = require('./helpers/load-typescript.cjs')();
const model = load(path.resolve('../diary/shared/interview/stories.ts'));
const docs = load(path.resolve('../diary/shared/interview/storyDoc.ts'));
fs.writeFileSync(path.join(root, 'stories.json'), JSON.stringify({stories:[{id:'fixture',title:'Fixture',clusters:[{id:'one',questions:[{id:'ra-one-1'},{id:'ra-one-2'}]}]}]}));
const route = load(path.resolve('app/api/interview/stories/route.ts'));
const file = path.join(root, 'stories/fixture.md');
const put = body => route.PUT(new Request('http://localhost/api/interview/stories', {method:'PUT',body:JSON.stringify({storyId:'fixture',questionId:'ra-one-1',...body})}));
const read = () => docs.parseStoryDoc('fixture', fs.readFileSync(file,'utf8')).answers['ra-one-1'];
test.after(() => { assert.equal(path.dirname(root),path.resolve(os.tmpdir())); fs.rmSync(root,{recursive:true}); delete process.env.INTERVIEW_LOG_PATH; });
test.beforeEach(() => { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,'# Fixture\n'); });

test('legacy status inference and pending exclude deleted and completed follow-ups', () => {
  for (const [f,want,pending] of [[{},'todo',true],[{answer:'text'},'draft',true],[{stuck:true,answer:'text'},'struggled',true],[{status:'spoken',stuck:true},'spoken',false],[{status:'skipped'},'skipped',false],[{deleted:true},'todo',false]]) {
    assert.equal(model.followUpStatus(f),want); assert.equal(model.followUpPending(f),pending);
  }
});
test('new fields and markdown roundtrip on untouched parent without changing stable dotted id', () => {
  const follow = {id:'1.2',q:'Why | -->\nnext?',quote:'quoted | -->\n### injected',why:'reason | -->',date:'2020-01-01',answer:'### header\n**缺口**\n<!-- status: spoken -->\n\nend',answerDate:'2020-01-02',status:'struggled',stuck:true,revisions:[{date:'2019-01-01',text:'old\n### title'}],deleted:true};
  const parsed = docs.parseStoryDoc('fixture',docs.serializeStoryDoc({id:'fixture',answers:{'ra-one-1':{questionId:'ra-one-1',status:'todo',followUps:[follow]}}}));
  assert.deepEqual(parsed.answers['ra-one-1'].followUps,[follow]);
  assert.deepEqual(Object.keys(parsed.answers),['ra-one-1']);
  const legacy = docs.parseStoryDoc('fixture','### ra-one-1\n<!-- status: draft -->\n**追问 1.2**\n<!-- why: test | stuck: true -->\n> Why?\n**我的答案** · 追问 1.2\nold answer\n');
  assert.equal(legacy.answers['ra-one-1'].followUps[0].id,'1.2');
  assert.equal(legacy.answers['ra-one-1'].followUps[0].answer,'old answer');
});
test('create persists on todo parent; retries preserve existing edits and stable id', async () => {
  const create={followUpAction:'create',followUpId:'172000000000012345',followUpQuestion:'why?',followUpQuote:'line'};
  assert.equal((await put(create)).status,200);
  assert.equal(read().status,'todo'); assert.equal(read().followUps[0].q,'why?');
  assert.equal((await put({...create,followUpAction:'update',followUpQuestion:'edited',followUpQuote:'| -->\nline',followUpStatus:'spoken'})).status,200);
  assert.equal((await put(create)).status,200);
  assert.equal(read().followUps.length,1); assert.equal(read().followUps[0].q,'edited'); assert.equal(read().followUps[0].status,'spoken'); assert.equal(read().followUps[0].quote,'| -->\nline');
});
test('answer changes archive previous day once; delete and restore preserve answer/history', async () => {
  fs.writeFileSync(file,docs.serializeStoryDoc({id:'fixture',answers:{'ra-one-1':{questionId:'ra-one-1',status:'spoken',followUps:[{id:'1.2',q:'why',answer:'old',answerDate:'2020-01-01'}]}}}));
  assert.equal((await put({followUpId:'1.2',followUpAnswer:'new',stuck:true})).status,200);
  assert.equal(read().status,'spoken'); assert.equal(model.followUpStatus(read().followUps[0]),'struggled');
  assert.deepEqual(read().followUps[0].revisions,[{date:'2020-01-01',text:'old'}]);
  await put({followUpId:'1.2',followUpAnswer:'new edit'});
  assert.equal(read().followUps[0].revisions.length,1);
  await put({followUpAction:'delete',followUpId:'1.2'});
  assert.equal(read().followUps[0].deleted,true); assert.equal(read().followUps[0].answer,'new edit');
  await put({followUpAction:'restore',followUpId:'1.2'});
  assert.equal(!!read().followUps[0].deleted,false); assert.equal(read().followUps[0].revisions.length,1);
});
test('invalid actions, ids and fields fail without writing; unknown updates return 404', async () => {
  for (const body of [{followUpAction:'create',followUpId:'../x',followUpQuestion:'x'},{followUpAction:'create',followUpId:'1..2',followUpQuestion:'x'},{followUpAction:'create',followUpId:'1',followUpQuestion:' '},{followUpAction:'unknown',followUpId:'1'},{followUpAction:'update',followUpId:'1',followUpStatus:'bad'},{followUpAction:'create',followUpId:'1'.repeat(81),followUpQuestion:'x'},{followUpAction:'update'},{followUpId:'1',followUpQuote:2}]) assert.equal((await put(body)).status,400,JSON.stringify(body));
  assert.equal((await put({followUpAction:'update',followUpId:'123',followUpQuestion:'x'})).status,404);
  assert.equal(fs.readFileSync(file,'utf8'),'# Fixture\n');
});
test('concurrent parent and follow-up writes preserve all independent changes', async () => {
  const responses=await Promise.all([put({answer:'parent',status:'draft'}),put({followUpAction:'create',followUpId:'100',followUpQuestion:'one'}),put({followUpAction:'create',followUpId:'101',followUpQuestion:'two'})]);
  assert.deepEqual(responses.map(r=>r.status),[200,200,200]);
  assert.equal(read().answer,'parent'); assert.deepEqual(read().followUps.map(f=>f.id).sort(),['100','101']);
  await Promise.all([put({status:'spoken'}),put({followUpAction:'update',followUpId:'100',followUpAnswer:'first'}),put({followUpAction:'update',followUpId:'101',followUpAnswer:'second'})]);
  assert.equal(read().status,'spoken'); assert.deepEqual(Object.fromEntries(read().followUps.map(f=>[f.id,f.answer])),{'100':'first','101':'second'});
});
test('corrupt follow-up metadata is never overwritten', async () => {
  const corrupt='### ra-one-1\n**追问 1**\n<!-- followup-v2: %broken -->\n';
  fs.writeFileSync(file,corrupt);
  const oldError=console.error; console.error=()=>{};
  try { assert.equal((await put({answer:'replacement'})).status,500); } finally {console.error=oldError;}
  assert.equal(fs.readFileSync(file,'utf8'),corrupt);
});

test('read errors refuse replacement and the write queue recovers for the next request', async () => {
  fs.unlinkSync(file); fs.mkdirSync(file);
  const oldError=console.error; console.error=()=>{};
  try { assert.equal((await put({answer:'replacement'})).status,500); }
  finally {console.error=oldError;}
  assert.equal(fs.statSync(file).isDirectory(),true);
  fs.rmdirSync(file);
  assert.equal((await put({followUpAction:'create',followUpId:'200',followUpQuestion:'after failure'})).status,200);
  assert.equal(read().followUps[0].q,'after failure');
});
test('legacy recording key stays playable after follow-up deletion and restoration', async () => {
  process.env.INTERVIEW_RECORDINGS_PATH=path.join(root,'recordings');
  const recordings=load(path.resolve('app/api/interview/recordings/route.ts'));
  const question='resume:fixture:ra-one-1-followup-1-2';
  const request=(method,extra={},body,headers={})=>new Request(`http://localhost:3002/api/interview/recordings?${new URLSearchParams({question,...extra})}`,{method,body,headers:{Origin:'http://localhost:3002',...headers}});
  try {
    const response=await recordings.POST(request('POST',{duration:'2'},Buffer.from('fixture audio'),{'Content-Type':'audio/webm'}));
    assert.equal(response.status,201); const recording=await response.json();
    fs.writeFileSync(file,'### ra-one-1\n<!-- status: todo -->\n**追问 1.2**\n> why?\n');
    for (const followUpAction of ['delete','restore']) {
      assert.equal((await put({followUpAction,followUpId:'1.2'})).status,200);
      const follow=read().followUps[0];
      assert.equal(`resume:fixture:ra-one-1-followup-${follow.id.replaceAll('.','-')}`,question);
      const audio=await recordings.GET(request('GET',{id:recording.id}));
      assert.equal(audio.status,200); assert.equal(Buffer.from(await audio.arrayBuffer()).toString(),'fixture audio');
    }
  } finally {delete process.env.INTERVIEW_RECORDINGS_PATH;}
});

test('delete and restore commit supplied dirty fields before changing visibility', async () => {
  await put({followUpAction:'create',followUpId:'300',followUpQuestion:'original'});
  const deleted = await put({followUpAction:'delete',followUpId:'300',followUpAnswer:'just typed',followUpStatus:'struggled',followUpQuestion:'edited question',followUpQuote:'edited quote'});
  assert.equal(deleted.status,200);
  const response = await deleted.json();
  assert.equal(response.answer.followUps[0].answer,'just typed');
  assert.equal(read().followUps[0].answer,'just typed');
  assert.equal(read().followUps[0].status,'struggled');
  assert.equal(read().followUps[0].q,'edited question');
  assert.equal(read().followUps[0].quote,'edited quote');
  assert.equal(read().followUps[0].deleted,true);
  assert.equal((await put({followUpAction:'restore',followUpId:'300',followUpAnswer:'restored edit',followUpStatus:'draft'})).status,200);
  assert.equal(read().followUps[0].answer,'restored edit');
  assert.equal(read().followUps[0].status,'draft');
  assert.equal(!!read().followUps[0].deleted,false);
  assert.equal(read().status,'todo');
});
