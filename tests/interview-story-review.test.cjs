const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-story-'));
process.env.INTERVIEW_LOG_PATH = path.join(root, 'log');
const load = require('./helpers/load-typescript.cjs')();
const stories = load(path.resolve('../diary/shared/interview/stories.ts'));
const docs = load(path.resolve('../diary/shared/interview/storyDoc.ts'));
const q = id => ({ id, q: id, tests: 'example', lens: '归属', p: 0 });
const bank = { stories: [{ id: 'test-story', title: 'Example', order: 0, clusters: [
  { id: 'rs-first', title: 'First', questions: [q('ra-one-1')] },
  { id: 'rs-second', title: 'Second', questions: [q('ra-two-1')] },
] }] };
fs.writeFileSync(path.join(root, 'stories.json'), JSON.stringify(bank));
const route = load(path.resolve('app/api/interview/stories/route.ts'));
test.after(() => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true }); delete process.env.INTERVIEW_LOG_PATH; });

test('struggled persists and stays visible as attempted, without scheduling another attempt', async () => {
  const response = await route.PUT(new Request('http://localhost/api/interview/stories', { method: 'PUT', body: JSON.stringify({ storyId: 'test-story', questionId: 'ra-one-1', answer: 'My answer', status: 'struggled' }) }));
  assert.equal(response.status, 200);
  const parsed = docs.parseStoryDoc('test-story', fs.readFileSync(path.join(root, 'stories/test-story.md'), 'utf8'));
  assert.equal(parsed.answers['ra-one-1'].status, 'struggled');
  const answers = { 'test-story': parsed.answers };
  assert.equal(stories.clusterProgress(bank, answers)[0].touched, 1);
  assert.equal(stories.clusterProgress(bank, answers)[0].done, 0);
  assert.equal(stories.storyDebt(bank, answers).struggled, 1);
  assert.equal(stories.currentCluster(bank, answers).cluster.id, 'rs-second');
  assert.deepEqual(stories.clusterQuestions(bank, answers).map(p => p.question.id), ['ra-two-1']);
  assert.deepEqual(stories.pickQuestions(bank, answers, 10).map(p => p.question.id), ['ra-two-1']);
});
