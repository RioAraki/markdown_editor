const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-audio-'));
process.env.INTERVIEW_RECORDINGS_PATH = root;
const route = makeLoader()(path.resolve('app/api/interview/recordings/route.ts'));
const key = 'behavioral:bh-challenge';
const bytes = Buffer.from('test audio bytes');
const request = (method, query = {}, body, headers = {}) => new Request(
  `http://localhost:3002/api/interview/recordings?${new URLSearchParams({ question: key, ...query })}`,
  { method, body, headers: { Origin: 'http://localhost:3002', ...headers } },
);
async function save(question = key) {
  const res = await route.POST(request('POST', { question, duration: '12.5' }, bytes, { 'Content-Type': 'audio/webm' }));
  assert.equal(res.status, 201);
  return res.json();
}
test('new recordings over seven minutes are rejected', async () => {
  const res = await route.POST(request('POST', { question: 'behavioral:bh-limit', duration: '421' }, bytes, { 'Content-Type': 'audio/webm' }));
  assert.equal(res.status, 400);
});
test('a range request reads only the requested audio range, not the full file', async () => {
  const rec = await save('behavioral:bh-range');
  const io = require('node:fs/promises');
  const original = io.readFile;
  io.readFile = async (file, ...args) => {
    if (path.basename(String(file)) === 'audio') throw Error('Full audio read is forbidden');
    return original(file, ...args);
  };
  try {
    const res = await route.GET(request('GET', { question: 'behavioral:bh-range', id: rec.id }, undefined, { Range: 'bytes=2-5' }));
    assert.equal(res.status, 206);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes.subarray(2, 6));
  } finally { io.readFile = original; }
});
test.after(() => {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('interview-audio-'));
  fs.rmSync(root, { recursive: true });
  delete process.env.INTERVIEW_RECORDINGS_PATH;
});

test('multiple takes persist independently, can be played, renamed and deleted', async () => {
  const first = await save();
  const second = await save();
  assert.notEqual(first.id, second.id);
  assert.match(first.name, /^\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}:\d{2}$/);
  assert.equal(first.duration, 12.5);
  const list = await (await route.GET(request('GET'))).json();
  assert.equal(list.recordings.length, 2);
  const media = await route.GET(request('GET', { id: first.id }));
  assert.equal(media.status, 200);
  assert.match(media.headers.get('Content-Type'), /audio\/webm/);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes);
  const rename = await route.PATCH(request('PATCH', { id: first.id }, JSON.stringify({ name: '第二版：更简洁' }), { 'Content-Type': 'application/json' }));
  assert.equal(rename.status, 200);
  const persisted = makeLoader()(path.resolve('app/api/interview/recordings/route.ts'));
  const renamed = await (await persisted.GET(request('GET'))).json();
  assert.equal(renamed.recordings.find(r => r.id === first.id).name, '第二版：更简洁');
  assert.equal((await route.DELETE(request('DELETE', { id: first.id }))).status, 200);
  assert.equal((await route.GET(request('GET', { id: first.id }))).status, 404);
  assert.equal((await route.GET(request('GET', { id: second.id }))).status, 200);
});

test('question histories are isolated and media supports seeking', async () => {
  const rec = await save('resume:research-agent:ra-value-1');
  assert.equal((await route.GET(request('GET', { id: rec.id }))).status, 404);
  const query = { question: 'resume:research-agent:ra-value-1', id: rec.id };
  const range = await route.GET(request('GET', query, undefined, { Range: 'bytes=2-5' }));
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('Content-Range'), `bytes 2-5/${bytes.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(2, 6));
  assert.equal((await route.GET(request('GET', query, undefined, { Range: 'bytes=999-' }))).status, 416);
});

test('remote origins, unsafe keys, empty audio, oversized bodies and invalid names are rejected', async () => {
  assert.equal((await route.GET(new Request('https://example.com/api/interview/recordings?question=behavioral:bh-challenge'))).status, 403);
  assert.equal((await route.POST(request('POST', {}, bytes, { Origin: 'https://example.com', 'Content-Type': 'audio/webm' }))).status, 403);
  assert.equal((await route.GET(request('GET', { question: '../../escape' }))).status, 400);
  assert.equal((await route.POST(request('POST', {}, bytes, { 'Content-Type': 'text/html' }))).status, 415);
  assert.equal((await route.POST(request('POST', {}, '', { 'Content-Type': 'audio/webm' }))).status, 400);
  assert.equal((await route.POST(request('POST', {}, bytes, { 'Content-Type': 'audio/webm', 'Content-Length': String(65 * 1024 * 1024) }))).status, 413);
  const rec = await save('behavioral:bh-intro');
  assert.equal((await route.PATCH(request('PATCH', { question: 'behavioral:bh-intro', id: rec.id }, JSON.stringify({ name: '  ' }), { 'Content-Type': 'application/json' }))).status, 400);
});

test('Next wildcard bind URL accepts the actual loopback Host but rejects a remote Host', async () => {
  const url = 'http://0.0.0.0:3002/api/interview/recordings?question=behavioral:bh-challenge';
  const local = await route.GET(new Request(url, { headers: { Host: '127.0.0.1:3002', Origin: 'http://127.0.0.1:3002' } }));
  assert.equal(local.status, 200);
  const remote = await route.GET(new Request(url, { headers: { Host: '192.168.1.5:3002' } }));
  assert.equal(remote.status, 403);
});

test('retrying a save after a lost response does not create another take', async () => {
  const query = { question: 'behavioral:bh-retry', id: '12345678-1234-1234-1234-123456789abc' };
  for (let i = 0; i < 2; i++) {
    assert.equal((await route.POST(request('POST', query, bytes, { 'Content-Type': 'audio/webm' }))).status, 201);
  }
  const list = await (await route.GET(request('GET', { question: query.question }))).json();
  assert.equal(list.recordings.length, 1);
});

test('processed audio and waveforms persist separately from the untouched original', async () => {
  const { encodeWave } = makeLoader()(path.resolve('lib/audioProcessing.ts'));
  const record = await save('behavioral:bh-wave');
  const query = { question: 'behavioral:bh-wave', id: record.id };
  const wav = Buffer.from(encodeWave(new Float32Array(8000).fill(.1), 8000));
  const form = new FormData();
  form.set('audio', new Blob([wav], { type: 'audio/wav' }), 'cleaned.wav');
  form.set('analysis', JSON.stringify({ version: 1, status: 'trimmed', duration: 1, originalDuration: 2, removedSeconds: 1, waveform: Array(240).fill(.1), originalWaveform: Array(240).fill(.2) }));
  const res = await route.PUT(request('PUT', query, form));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).enhancement.waveform.length, 240);
  const original = await route.GET(request('GET', query));
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  const clean = await route.GET(request('GET', { ...query, variant: 'cleaned' }));
  assert.deepEqual(Buffer.from(await clean.arrayBuffer()), wav);
  await route.PATCH(request('PATCH', query, JSON.stringify({ name: '波形测试' }), { 'Content-Type': 'application/json' }));
  const list = await (await route.GET(request('GET', { question: query.question }))).json();
  assert.equal(list.recordings[0].enhancement.duration, 1);
  await route.DELETE(request('DELETE', query));
  assert.equal((await route.GET(request('GET', { ...query, variant: 'cleaned' }))).status, 404);
});

test('an existing v1 take can gain independent standard and compact versions', async () => {
  const { encodeWave } = makeLoader()(path.resolve('lib/audioProcessing.ts'));
  const rec = await save('behavioral:bh-strength');
  const query = { question: 'behavioral:bh-strength', id: rec.id };
  for (const [version, strength, duration] of [[1, undefined, 3], [2, 'standard', 2], [2, 'compact', 1]]) {
    const form = new FormData();
    form.set('audio', new Blob([encodeWave(new Float32Array(duration * 8000).fill(.1), 8000)], { type: 'audio/wav' }), 'cleaned.wav');
    form.set('analysis', JSON.stringify({ version, strength, duration, originalDuration: 3, removedSeconds: 3 - duration, status: duration < 3 ? 'trimmed' : 'unchanged', waveform: Array(240).fill(.1), originalWaveform: Array(240).fill(.1) }));
    assert.equal((await route.PUT(request('PUT', query, form))).status, 200);
  }
  const list = await (await route.GET(request('GET', { question: query.question }))).json();
  assert.equal(list.recordings[0].enhancement.strength, 'standard');
  assert.equal(list.recordings[0].enhancements.compact.duration, 1);
  for (const [strength, duration] of [['standard', 2], ['compact', 1]]) {
    const media = await route.GET(request('GET', { ...query, variant: 'cleaned', strength }));
    assert.equal(media.status, 200);
    assert.equal((await media.arrayBuffer()).byteLength, 44 + duration * 8000 * 2);
  }
  const original = await route.GET(request('GET', query));
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  assert.equal((await route.GET(request('GET', { ...query, variant: 'cleaned', strength: '../../other' }))).status, 400);
});
