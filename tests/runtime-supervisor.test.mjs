import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, copyFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const supervisorFile = fileURLToPath(new URL('../scripts/runtime/supervisor.mjs', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const result = await fn(); if (result) return result; } catch {} await sleep(50); }
  throw new Error('Condition timed out');
}
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'runtime-supervisor-'));
  const server = net.createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise(r => server.close(r));
  await mkdir(path.join(root, 'config'));
  await writeFile(path.join(root, 'config/production.env'), 'EDITOR_PROFILE=production\nEDITOR_RELEASE_ID=wrong\n');
  const { requestControl } = await import(new URL('../scripts/runtime/supervisor.mjs', import.meta.url));
  const command = (c, p) => requestControl(c, p, root);
  const children = [];
  let diagnostics = '';
  async function launch() {
    const child = spawn(process.execPath, [supervisorFile], { env: { ...process.env, EDITOR_RUNTIME_ROOT: root,
      EDITOR_SUPERVISOR_OPTIONS: JSON.stringify({ port, intervalMs: 150, timeoutMs: 100, graceMs: 2000,
        stopMs: 250, backoffMs: [50, 80, 100, 120], failureRetryMs: 1500, stableMs: 1000 }) },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.stderr.on('data', data => { diagnostics += data; });
    child.stdout.resume();
    await until(async () => (await command('status')).supervisorPid === child.pid);
    return child;
  }
  async function release(id, behavior = 'healthy') {
    const dir = path.join(root, 'releases', id);
    await mkdir(path.join(dir, 'editor/node_modules/next'), { recursive: true });
    await copyFile(new URL('./fixtures/runtime-next.cjs', import.meta.url), path.join(dir, 'editor/node_modules/next/index.js'));
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ verified: true, releaseId: id }));
    await writeFile(path.join(dir, 'behavior'), behavior);
    // Each release gets the same environment key, changed before a fresh launch.
    return dir;
  }
  async function behaviorFile(dir) {
    await writeFile(path.join(root, 'config/production.env'), JSON.stringify({ RUNTIME_BEHAVIOR_FILE: path.join(dir, 'behavior'), EDITOR_PROFILE: 'production', EDITOR_RELEASE_ID: 'wrong' }));
  }
  t.after(async () => {
    try { await command('shutdown'); } catch {}
    for (const child of children) if (child.exitCode === null) child.kill();
    // If a test failed before recovery, stop only the authenticated host we created.
    try {
      const record = JSON.parse(await readFile(path.join(root, 'host.json'), 'utf8'));
      await fetch(`http://127.0.0.1:${record.port}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${record.token}` }, signal: AbortSignal.timeout(1000) });
    } catch {}
    await sleep(300);
    await rm(root, { recursive: true, force: true });
    if (diagnostics) t.diagnostic(diagnostics);
  });
  return { root, port, launch, command, release, behaviorFile };
}

test('stop persists across supervisor restart and production identity overrides env', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  const supervisor = await x.launch(); await x.command('deploy', { releaseId: 'one' });
  const health = await (await fetch(`http://127.0.0.1:${x.port}/api/health`)).json();
  assert.deepEqual(health, { releaseId: 'one', mode: 'production' });
  await x.command('stop'); await x.command('shutdown');
  await until(() => supervisor.exitCode !== null); await x.launch();
  const state = await x.command('status');
  assert.equal(state.desiredState, 'stopped'); assert.equal(state.child, null);
  await assert.rejects(fetch(`http://127.0.0.1:${x.port}/api/health`));
});

test('exit and three hung probes trigger recovery with a new owned child', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  await x.launch(); await x.command('deploy', { releaseId: 'one' });
  for (const behavior of ['exit', 'hang']) {
    const before = (await x.command('status')).child.instanceId;
    await writeFile(path.join(dir, 'behavior'), behavior);
    await until(async () => (await x.command('status')).phase === 'recovering');
    await writeFile(path.join(dir, 'behavior'), 'healthy');
    await until(async () => { const s = await x.command('status'); return s.child && s.child.instanceId !== before && s.phase === 'idle'; });
  }
});

test('failed switch restores old current; unverified release never stops current', async t => {
  const x = await setup(t); const good = await x.release('good'); await x.behaviorFile(good);
  await x.release('bad'); await x.launch(); await x.command('deploy', { releaseId: 'good' });
  await writeFile(path.join(x.root, 'releases/bad/manifest.json'), '{"verified":false}');
  const before = (await x.command('status')).child.instanceId;
  await assert.rejects(x.command('deploy', { releaseId: 'bad' }), /verified/);
  assert.equal((await x.command('status')).child.instanceId, before);
  // Valid manifest but an application that cannot load.
  await writeFile(path.join(x.root, 'releases/bad/manifest.json'), '{"verified":true}');
  await writeFile(path.join(x.root, 'releases/bad/editor/node_modules/next/index.js'), 'throw new Error("broken release")');
  await assert.rejects(x.command('deploy', { releaseId: 'bad' }));
  const state = await x.command('status');
  assert.equal(state.current, 'good'); assert.equal(state.phase, 'idle');
  assert.equal((await (await fetch(`http://127.0.0.1:${x.port}/api/health`)).json()).releaseId, 'good');
});

test('unexpected supervisor death recovers authenticated orphan without duplicate port owner', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  const supervisor = await x.launch(); await x.command('deploy', { releaseId: 'one' });
  const old = (await x.command('status')).child;
  supervisor.kill('SIGKILL'); await until(() => supervisor.exitCode !== null || supervisor.signalCode !== null);
  await x.launch();
  await until(async () => { const s = await x.command('status'); return s.phase === 'idle' && s.child && s.child.instanceId !== old.instanceId; });
  assert.equal((await (await fetch(`http://127.0.0.1:${x.port}/api/health`)).json()).releaseId, 'one');
});

test('control rejects unauthenticated requests without changing stopped intent', async t => {
  const x = await setup(t); await x.launch();
  const endpoint = JSON.parse(await readFile(path.join(x.root, 'control-endpoint.json'), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${endpoint.port}/control`, { method: 'POST', body: '{"command":"start"}' });
  assert.equal(response.status, 401);
  assert.equal((await x.command('status')).desiredState, 'stopped');
});

test('wrong release health is rejected and unrelated port owner is never killed', async t => {
  const x = await setup(t); const dir = await x.release('one', 'wrong'); await x.behaviorFile(dir);
  await x.launch();
  await assert.rejects(x.command('deploy', { releaseId: 'one' }), /Health releaseId/);
  assert.equal((await x.command('status')).current, null);
  const unrelated = net.createServer(socket => socket.end('alive'));
  await new Promise(resolve => unrelated.listen(x.port, '0.0.0.0', resolve));
  t.after(() => new Promise(resolve => unrelated.close(resolve)));
  await assert.rejects(x.command('deploy', { releaseId: 'one' }), /EADDRINUSE/);
  assert.equal(unrelated.listening, true);
});

test('switching crash recovers the pre-transaction release', async t => {
  const x = await setup(t); const good = await x.release('good'); await x.behaviorFile(good);
  await x.release('slow');
  await writeFile(path.join(x.root, 'releases/slow/editor/node_modules/next/index.js'), 'module.exports=()=>({prepare:()=>new Promise(()=>{}),close:async()=>{}})');
  const supervisor = await x.launch(); await x.command('deploy', { releaseId: 'good' });
  const switching = x.command('deploy', { releaseId: 'slow' }).catch(() => {});
  await until(async () => { const s = await x.command('status'); return s.phase === 'switching' && s.child?.releaseId === 'slow'; });
  supervisor.kill('SIGKILL'); await switching;
  await until(() => supervisor.exitCode !== null || supervisor.signalCode !== null);
  await x.launch();
  const s = await x.command('status'); assert.equal(s.current, 'good'); assert.equal(s.phase, 'idle');
  assert.equal((await (await fetch(`http://127.0.0.1:${x.port}/api/health`)).json()).releaseId, 'good');
});

test('repeated exits exhaust the retry budget then enter throttled failed state', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  await x.launch(); await x.command('deploy', { releaseId: 'one' });
  await writeFile(path.join(dir, 'behavior'), 'exit');
  await until(async () => (await x.command('status')).phase === 'failed', 20000);
  const before = await x.command('status');
  assert.equal(before.retryAttempts.length, 5);
  await sleep(400);
  assert.equal((await x.command('status')).retryAttempts.length, 5);
  await x.command('stop');
  assert.equal((await x.command('status')).desiredState, 'stopped');
});

test('Windows-compatible HTTP shutdown drains an in-flight request', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  await x.launch(); await x.command('deploy', { releaseId: 'one' });
  const response = await fetch(`http://127.0.0.1:${x.port}/drain`);
  const stopping = x.command('stop');
  assert.equal(await response.text(), 'completed');
  await stopping;
  assert.equal((await x.command('status')).child, null);
});

test('blocked host event loop is forcibly stopped only through matching OS creation identity', async t => {
  const x = await setup(t); const dir = await x.release('one'); await x.behaviorFile(dir);
  await x.launch(); await x.command('deploy', { releaseId: 'one' });
  const old = (await x.command('status')).child;
  await writeFile(path.join(dir, 'behavior'), 'cpu');
  await until(async () => (await x.command('status')).phase === 'recovering');
  await writeFile(path.join(dir, 'behavior'), 'healthy');
  await until(async () => { const s = await x.command('status'); return s.phase === 'idle' && s.child?.instanceId !== old.instanceId; }, 20000);
  const files = await readdir(path.join(x.root, 'logs'));
  const logs = (await Promise.all(files.filter(name => name.startsWith('supervisor-')).map(name => readFile(path.join(x.root, 'logs', name), 'utf8')))).join('');
  assert.match(logs, /forced-stop/);
});

test('backup failure restores the stopped release; successful backup contains drained writes before switch', async t => {
  const x = await setup(t); const good = await x.release('good'); await x.release('next');
  const { dataSources } = await import('../scripts/runtime/config.mjs');
  // Every configured source is explicitly inside this test root, including
  // optional/missing sources. No production default is ever passed to backup.
  const sources = Object.fromEntries(Object.keys(dataSources({})).map(key => [key, path.join(x.root, 'data', key, 'value')]));
  await mkdir(sources.DIARY_DATA_PATH, { recursive: true });
  const diary = path.join(sources.DIARY_DATA_PATH, 'entry.txt');
  await writeFile(diary, 'before');
  const profile = { ...sources, EDITOR_PROFILE: 'production', RUNTIME_BEHAVIOR_FILE: path.join(good, 'behavior'), RUNTIME_DRAIN_FILE: diary };
  const profileFile = path.join(x.root, 'config/production.env');
  await writeFile(profileFile, JSON.stringify(profile));
  await x.launch(); await x.command('deploy', { releaseId: 'good' });
  const old = (await x.command('status')).child.instanceId;
  await writeFile(profileFile, JSON.stringify({ ...profile, EDITOR_BACKUP_ON_DEPLOY: 'true' }));
  // A file where the backup directory should be gives a deterministic, real IO failure.
  await writeFile(path.join(x.root, 'backups'), 'blocked');
  await assert.rejects(x.command('deploy', { releaseId: 'next' }), /Deployment failed/);
  const restored = await x.command('status');
  assert.equal(restored.current, 'good'); assert.equal(restored.phase, 'idle');
  assert.notEqual(restored.child.instanceId, old);
  assert.equal((await (await fetch(`http://127.0.0.1:${x.port}/api/health`)).json()).releaseId, 'good');
  await unlink(path.join(x.root, 'backups'));
  const response = await fetch(`http://127.0.0.1:${x.port}/drain`);
  const switching = x.command('deploy', { releaseId: 'next' });
  assert.equal(await response.text(), 'completed');
  const switched = await switching;
  assert.equal(switched.current, 'next'); assert.equal(switched.previous, 'good');
  assert.ok(switched.lastBackup.startsWith(path.join(x.root, 'backups') + path.sep));
  assert.equal(await readFile(path.join(switched.lastBackup, 'diary/data/diary/entry.txt'), 'utf8'), 'completed');
  assert.ok(JSON.parse(await readFile(path.join(switched.lastBackup, 'manifest.json'), 'utf8')).entries.length > 0);
});
