const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'declare-problem-'));
process.env.INTERVIEW_LOG_PATH = path.join(root, 'log');
fs.mkdirSync(path.join(root, 'log'));
const seed = { problems: [{ id: 1, title: '两数之和', url: 'https://leetcode.cn/problems/two-sum/', difficulty: 'easy', item: 'lc-array', seq: 0 }] };
fs.writeFileSync(path.join(root, 'leetcode.json'), JSON.stringify(seed));
const load = require('./helpers/load-typescript.cjs')();
const request = (url, extra = {}) => new Request('http://localhost/api/interview/leetcode/declare', {method:'POST',body:JSON.stringify({url,date:'2026-09-13',...extra})});
const realFetch = global.fetch;
test.after(() => { global.fetch = realFetch; delete process.env.INTERVIEW_LOG_PATH; assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root,{recursive:true}); });
const post = req => load(path.resolve('app/api/interview/leetcode/declare/route.ts')).POST(req);

test('a known CN URL with description and query uses the bank without a network request', async () => {
  global.fetch = async () => { throw Error('must not query online'); };
  const res = await post(request('https://leetcode.cn/problems/two-sum/description/?envType=study-plan'));
  assert.equal(res.status,200);
  const data = await res.json();
  assert.equal(data.problem.id,1);
  assert.equal(data.unitText,'#1 两数之和');
});
test('an outside-bank problem is identified, retained across loads and records normal outcomes', async () => {
  const calls=[];
  global.fetch=async (url, options) => { calls.push([url,JSON.parse(options.body)]); return Response.json({data:{question:{questionFrontendId:'9876',translatedTitle:'额外测试题',title:'Extra',titleSlug:'extra-test',difficulty:'Medium'}}}); };
  const res=await post(request('https://leetcode.cn/problems/extra-test/'));
  assert.equal(res.status,200);
  assert.equal((await res.json()).problem.id,9876);
  assert.equal(calls[0][0],'https://leetcode.cn/graphql/');
  assert.equal(calls[0][1].variables.titleSlug,'extra-test');
  const bank=await load(path.resolve('../diary/shared/interview/load.ts')).loadLeetCode(root);
  assert.equal(bank.bank.problems.find(p=>p.id===9876).title,'额外测试题');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'leetcode.json'),'utf8')),seed);
  const result = await load(path.resolve('app/api/interview/leetcode/route.ts')).PUT(new Request('http://localhost/api/interview/leetcode',{method:'PUT',body:JSON.stringify({problemId:9876,date:'2026-09-13',outcome:'struggled',note:'自己的批注',redo:true})}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.log['9876'].attempts[0].note,'自己的批注');
  assert.equal(data.log['9876'].attempts[0].redo,true);
  const retry=await post(request('https://leetcode.cn/problems/extra-test/solutions/'));
  assert.equal(retry.status,200);
  assert.equal(calls.length,1);
});
test('duplicates in unsaved or persisted day entries are rejected', async () => {
  assert.equal((await post(request('https://leetcode.cn/problems/two-sum/',{exclude:[1]}))).status,409);
  fs.writeFileSync(path.join(root,'log/2026-09-12.md'),'# 2026-09-12\n- 刷题\n  - [x] #1 两数之和\n');
  assert.equal((await post(request('https://leetcode.cn/problems/two-sum/',{date:'2026-09-12'}))).status,409);
});
test('bad links and absent questions are rejected without importing guessed data', async () => {
  let calls=0;
  global.fetch=async()=>{ calls++;return Response.json({data:{question:null}}); };
  for(const url of ['https://evil.test/problems/x/','https://leetcode.cn.evil.test/problems/x/','file:///problems/x','https://leetcode.cn@evil.test/problems/x/','https://leetcode.cn/problemset/']) {
    assert.equal((await post(request(url))).status,400);
  }
  assert.equal(calls,0);
  assert.equal((await post(request('https://leetcode.cn/problems/not-a-real-question/'))).status,404);
});
test('manual imports do not enter the course, while explicit redo follows the normal ratio', () => {
  const { recommendProblems }=load(path.resolve('../diary/shared/interview/leetcode.ts'));
  const manual={id:99,title:'自选题',url:'https://leetcode.cn/problems/manual/',difficulty:'medium',item:null,source:'manual'};
  const bank={problems:[...Array.from({length:5},(_,i)=>({...seed.problems[0],id:i+1})),manual]};
  const recommend=log=>recommendProblems({bank,log,today:'2026-09-13',itemId:null,count:6,exclude:new Set()});
  assert.ok(!recommend({}).some(r=>r.problem.id===99));
  assert.ok(!recommend({'99':{attempts:[{date:'2026-09-01',outcome:'struggled'}]}}).some(r=>r.problem.id===99));
  const rows=recommend({'99':{attempts:[{date:'2026-09-01',outcome:'struggled',redo:true}]}});
  assert.equal(rows[2].problem.id,99);
  assert.equal(rows[2].kind,'review');
});
