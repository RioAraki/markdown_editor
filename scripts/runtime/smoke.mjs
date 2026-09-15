import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadProfile, writeJson, readJson, runtimeRoot } from './config.mjs';
import { processIdentity } from './supervisor.mjs';

export async function assertPortFree(port, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, host, () => server.close(resolve));
  });
}
export async function runSmoke(base, { releaseId, mode = 'candidate', mutations = false } = {}) {
  const results = [];
  const call = async (url, method = 'GET', body, rawHeaders) => {
    const response = await fetch(base + url, { method, headers: rawHeaders || (body === undefined ? {} : { 'Content-Type': 'application/json' }), body: body === undefined ? undefined : rawHeaders ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    assert(response.ok, `${method} ${url}: HTTP ${response.status}`);
    results.push({ method, url, status: response.status });
    return response;
  };
  const health = await (await call('/api/health')).json();
  assert.equal(health.mode, mode);
  if (releaseId) assert.equal(health.releaseId, releaseId);
  if (mutations && !['candidate', 'development'].includes(health.mode)) throw new Error('Refusing smoke writes against production');
  const html = await (await call('/')).text();
  const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
  for (const asset of new Set(assets.filter(a => a.startsWith('/_next/')))) await call(asset);
  const responses = {};
  for (const url of ['/api/diaries', '/api/training', '/api/training/rotation', '/api/interview', '/api/interview/overview', '/api/interview/qbank', '/api/interview/blocks', '/api/interview/topics', '/api/interview/stories', '/api/interview/papers', '/api/interview/leetcode', '/api/labels', '/api/steam']) {
    responses[url] = await (await call(url)).json();
  }
  if (!mutations) return { health, checks: results };
  await call('/api/archive'); // the legacy GET may migrate data; only sandbox
  const marker = 'runtime-smoke-' + randomUUID();
  const date = responses['/api/diaries'].diaries[0]?.date;
  assert(date, 'Smoke writes require at least one copied diary entry');
  const originalDiary = (await (await call('/api/diaries/' + date)).json()).entry.content;
  const originalLabels = responses['/api/labels'].labels;
  let recordingId, archiveId;
  try {
    await call('/api/diaries/' + date, 'PUT', { content: marker });
    assert.equal((await (await call('/api/diaries/' + date)).json()).entry.content, marker);
    const labels = [...originalLabels, { id: marker, name: marker, color: '#2563eb' }];
    await call('/api/labels', 'POST', { labels });
    assert((await (await call('/api/labels')).json()).labels.some(l => l.id === marker));
    const archive = await (await call('/api/archive', 'POST', { title: marker, content: marker })).json();
    archiveId = archive.archive.id;
    assert((await (await call('/api/archive/' + encodeURIComponent(archiveId))).text()).includes(marker));
    const audio = Buffer.alloc(44); audio.write('RIFF'); audio.writeUInt32LE(36, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36);
    const recording = await (await call('/api/interview/recordings?question=behavioral:runtime-smoke&duration=0', 'POST', audio, { 'Content-Type': 'audio/wav' })).json();
    recordingId = recording.id;
    assert(recordingId, 'Recording API returned no id');
    const audioRead = await call('/api/interview/recordings?question=behavioral:runtime-smoke&id=' + recordingId);
    assert.deepEqual(Buffer.from(await audioRead.arrayBuffer()), audio);
    const blocked = await fetch(base + '/api/interview/leetcode/sync-repo', { method: 'POST', signal: AbortSignal.timeout(5000) });
    assert.equal(blocked.status, 403, 'Sandbox must block repository sync');
    results.push({ method: 'POST', url: '/api/interview/leetcode/sync-repo', status: 403, expected: 'sandbox sync blocked' });
  } finally {
    if (recordingId) await call('/api/interview/recordings?question=behavioral:runtime-smoke&id=' + recordingId, 'DELETE');
    if (archiveId) await call('/api/archive/' + encodeURIComponent(archiveId), 'DELETE');
    await call('/api/labels', 'POST', { labels: originalLabels });
    await call('/api/diaries/' + date, 'PUT', { content: originalDiary });
  }
  return { health, checks: results };
}
export async function verifyCandidate({ releaseDir, root = runtimeRoot(), port = 3004 }) {
  await assertPortFree(port);
  const manifest = await readJson(path.join(releaseDir, 'manifest.json'));
  const env = { ...loadProfile('candidate', root), EDITOR_RELEASE_ID: manifest.releaseId, NODE_ENV: 'production', EDITOR_CANDIDATE_OWNER_ID: JSON.stringify(processIdentity(process.pid)) };
  const log = fs.openSync(path.join(releaseDir, 'candidate.log'), 'a');
  const child = fork(path.join(releaseDir, 'editor/node_modules/next/dist/bin/next'), ['start', '-p', String(port), '-H', '127.0.0.1'], { execArgv: ['--require', fileURLToPath(new URL('./candidate-lifecycle.cjs', import.meta.url))], cwd: path.join(releaseDir, 'editor'), env, windowsHide: true, stdio: ['ignore', log, log, 'ipc'] });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  const closed = new Promise(resolve => child.once('close', () => resolve(true)));
  let cancelled = false;
  const interrupt = () => { cancelled = true; child.kill(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  let result;
  try {
    await writeJson(path.join(releaseDir, 'candidate-process.json'), { pid: child.pid, ownerPid: process.pid, releaseId: manifest.releaseId, port, startedAt: new Date().toISOString() });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Candidate exited: see candidate.log');
      try { const h = await (await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).json(); ready = h.releaseId === manifest.releaseId && h.mode === 'candidate'; } catch {}
      if (ready) break;
      await delay(1000);
    }
    if (!ready) throw new Error('Candidate health timeout');
    result = await runSmoke(base, { releaseId: manifest.releaseId, mutations: true });
    await writeJson(path.join(releaseDir, 'smoke.json'), result);
  } finally {
    if (child.exitCode === null) child.kill();
    const stopped = await Promise.race([closed, delay(10000, false, { ref: false })]);
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    fs.closeSync(log);
    if (!stopped) throw new Error('Candidate shutdown not confirmed; release remains unverified');
    await fsp.unlink(path.join(releaseDir, 'candidate-process.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  if (cancelled) throw new Error('Candidate verification interrupted');
  await writeJson(path.join(releaseDir, 'manifest.json'), { ...manifest, verified: true, verifiedAt: new Date().toISOString() });
  return result;
}
