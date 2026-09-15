import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, appendFile, unlink, chmod, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { runtimeRoot, loadProfile, readJson, writeJson, assertReleaseId, releaseDirectory } from './config.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const secret = () => randomBytes(32).toString('hex');
// OS creation identity prevents a recycled PID from being signalled. The random
// instance argument additionally ties the OS process to this exact launch.
export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid pid');
  if (process.platform === 'win32') {
    const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){ @{created=$p.CreationDate.ToUniversalTime().Ticks.ToString();command=$p.CommandLine} | ConvertTo-Json -Compress }`;
    const text = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    return text ? JSON.parse(text) : null;
  }
  try {
    const value = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return { created: value.slice(value.lastIndexOf(')') + 2).split(' ')[19], command: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ') };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function singletonAddress(root, role) {
  const id = createHash('sha256').update(path.resolve(root).toLowerCase() + role).digest('hex').slice(0, 28);
  return process.platform === 'win32' ? `\\\\.\\pipe\\editor-${id}` : path.join(os.tmpdir(), `editor-${id}.sock`);
}
export async function privateJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${secret().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    if (process.platform === 'win32') {
      const account = execFileSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true }).trim();
      execFileSync('icacls.exe', [temporary, '/inheritance:r', '/grant:r', `${account}:(F)`], { windowsHide: true, stdio: 'pipe' });
    } else await chmod(temporary, 0o600);
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

export function hostRequest(record, command, timeoutMs = 5000) {
  return jsonRequest(record.port, record.token, command === 'identity' ? '/identity' : '/shutdown',
    command === 'identity' ? undefined : {}, timeoutMs);
}
function jsonRequest(port, token, pathname, body, timeoutMs) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.reject(new Error('Invalid local control port'));
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname,
      method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, res => {
      let data = '';
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Control/health response aborted')));
      res.on('data', chunk => { data += chunk; if (data.length > 1024 * 1024) req.destroy(new Error('Control response too large')); });
      res.on('end', () => {
        try { const result = JSON.parse(data); if (res.statusCode !== 200) throw new Error(result.error || `HTTP ${res.statusCode}`); resolve(result); }
        catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
export async function requestControl(command, payload = {}, root = runtimeRoot()) {
  const endpoint = await readJson(path.join(root, 'control-endpoint.json'));
  if (!endpoint) throw new Error('Supervisor is not running (no control endpoint)');
  return jsonRequest(endpoint.port, endpoint.token, '/control', { command, payload }, 600000);
}

class Logs {
  constructor(root) { this.root = path.join(root, 'logs'); this.queue = Promise.resolve(); this.day = ''; }
  write(event, details = {}, stream = 'supervisor') {
    this.queue = this.queue.then(async () => {
      await mkdir(this.root, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      if (day !== this.day) {
        this.day = day;
        for (const name of await readdir(this.root)) {
          if (!/^(supervisor|stdout|stderr)-.*\.log$/.test(name)) continue;
          const file = path.join(this.root, name);
          if (Date.now() - (await stat(file)).mtimeMs > 14 * 86400000) await unlink(file);
        }
      }
      const line = Buffer.from(JSON.stringify({ at: new Date().toISOString(), event, ...details }) + '\n');
      // Bound individual chunks as well as total files; never split into a >20MiB file.
      for (let offset = 0; offset < line.length; offset += 65536) {
        const chunk = line.subarray(offset, offset + 65536);
        let index = 0;
        while (true) {
          const file = path.join(this.root, `${stream}-${day}-${index}.log`);
          const size = await stat(file).then(s => s.size, () => 0);
          if (size + chunk.length <= 20 * 1024 * 1024) { await appendFile(file, chunk); break; }
          index++;
        }
      }
    }).catch(error => console.error('Runtime log error:', error.message));
    return this.queue;
  }
}

export async function runSupervisor(root = runtimeRoot(), overrides = {}) {
  root = path.resolve(root);
  const options = { port: 3002, hostname: '0.0.0.0', intervalMs: 30000, timeoutMs: 5000,
    graceMs: 120000, stopMs: 30000, backoffMs: [5000, 15000, 30000, 60000],
    failureRetryMs: 300000, stableMs: 300000, ...overrides };
  await mkdir(root, { recursive: true });
  const guard = net.createServer(socket => socket.destroy());
  const address = singletonAddress(root, 'supervisor');
  // Windows named pipes disappear with their owner. Unix socket files need an
  // explicit stale-socket check, never a process/port based kill.
  if (process.platform !== 'win32') {
    const live = await new Promise(resolve => { const s = net.connect(address); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
    if (!live) await unlink(address).catch(() => {});
  }
  await new Promise((resolve, reject) => { guard.once('error', reject); guard.listen(address, resolve); });
  const log = new Logs(root);
  const stateFile = path.join(root, 'state.json');
  const hostFile = path.join(root, 'host.json');
  let state = { current: null, previous: null, desiredState: 'stopped', phase: 'idle',
    ...(await readJson(stateFile, {})) };
  let busy = false, closing = false, child = null, timer, failures = 0, healthySince = 0;
  let attempts = state.retryAttempts || [];
  let nextAttempt = state.nextAttemptAt || 0;
  const save = async () => { state.updatedAt = new Date().toISOString(); await writeJson(stateFile, state); };
  const summary = () => ({ ...state, child: child ? { ...child, token: undefined } : null,
    supervisorPid: process.pid, busy });
  const fault = async error => {
    state.lastError = { at: new Date().toISOString(), message: error.message };
    await log.write('error', { ...state.lastError, releaseId: state.current, child: child ? { pid: child.pid, createdAt: child.createdAt } : null });
    await save();
  };
  async function manifest(id) {
    assertReleaseId(id);
    const dir = releaseDirectory(id, root);
    const raw = await readFile(path.join(dir, 'manifest.json'));
    const data = JSON.parse(raw);
    if (data.verified !== true) throw new Error(`Release ${id} is not verified`);
    if (data.releaseId && data.releaseId !== id) throw new Error('Manifest release identity mismatch');
    return { dir, hash: createHash('sha256').update(raw).digest('hex') };
  }
  async function identify(record) {
    const actual = await hostRequest(record, 'identity', options.timeoutMs);
    for (const key of ['pid', 'createdAt', 'instanceId', 'releaseId', 'manifestHash']) {
      if (actual[key] !== record[key]) throw new Error(`Child identity mismatch: ${key}`);
    }
    return actual;
  }
  async function stopChild() {
    const record = child || await readJson(hostFile);
    if (!record) return;
    try {
      await identify(record);
      await hostRequest(record, 'shutdown', options.timeoutMs);
      const end = Date.now() + options.stopMs + 3000;
      while (Date.now() < end) {
        try { await identify(record); } catch (error) {
          if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            child = null; await unlink(hostFile).catch(() => {}); state.child = null; await save(); return;
          }
          throw error;
        }
        await delay(50);
      }
      throw new Error('Owned host did not shut down; checking OS identity before forced stop');
    } catch (error) {
      // An already exited host cannot authenticate. Refusal permits a fresh bind;
      // any unrelated listener is left untouched and will cause startup failure.
      if (error.code === 'ECONNREFUSED') {
        child = null; await unlink(hostFile).catch(() => {}); state.child = null; await save(); return;
      }
      const actual = processIdentity(record.pid);
      if (actual && record.osIdentity && actual.created === record.osIdentity.created &&
          actual.command === record.osIdentity.command && actual.command.includes(record.instanceId)) {
        await log.write('forced-stop', { pid: record.pid, releaseId: record.releaseId, createdAt: record.createdAt,
          reason: error.message, warning: 'Forced termination does not guarantee in-flight write safety' });
        process.kill(record.pid, 'SIGKILL');
        const end = Date.now() + 5000;
        while (Date.now() < end) {
          const remaining = processIdentity(record.pid);
          if (!remaining || remaining.created !== actual.created) {
            child = null; state.child = null; await unlink(hostFile).catch(() => {}); await save(); return;
          }
          await delay(100);
        }
      }
      throw error;
    }
  }
  async function probe(id) {
    const started = Date.now();
    const response = await jsonRequest(options.port, '', '/api/health', undefined, options.timeoutMs);
    if (response.releaseId !== id || response.mode !== 'production') throw new Error('Health releaseId/mode mismatch');
    state.health = { at: new Date().toISOString(), latencyMs: Date.now() - started, releaseId: id };
  }
  async function startChild(id) {
    const release = await manifest(id);
    // Never signal whatever happens to be listening on the production port.
    const check = net.createServer();
    await new Promise((resolve, reject) => { check.once('error', reject); check.listen(options.port, options.hostname, resolve); });
    await new Promise(resolve => check.close(resolve));
    const instanceId = secret();
    const token = secret();
    const env = { ...loadProfile('production', root), EDITOR_PROFILE: 'production', EDITOR_RELEASE_ID: id,
      NODE_ENV: 'production', EDITOR_RUNTIME_ROOT: root };
    env.EDITOR_HOST_OPTIONS = JSON.stringify({ root, releaseId: id, port: options.port, hostname: options.hostname,
      stopMs: options.stopMs, instanceId, token, manifestHash: release.hash, recordFile: hostFile });
    // Persist the launch intent BEFORE spawning. The host publishes its own pid,
    // timestamp and authentication endpoint before it opens the application port.
    state.child = { instanceId, releaseId: id, manifestHash: release.hash, launching: true };
    await save();
    const proc = spawn(process.execPath, [fileURLToPath(new URL('./host.mjs', import.meta.url)), '--instance-id', instanceId], {
      cwd: path.join(release.dir, 'editor'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let exited = false, exitError;
    proc.once('error', error => { exited = true; exitError = error; });
    proc.once('exit', (code, signal) => {
      exited = true; exitError = new Error(`Child exited: code=${code}, signal=${signal}`);
      log.write('child-exit', { pid: proc.pid, instanceId, releaseId: id, code, signal });
      if (child?.instanceId === instanceId) child.exited = true;
      if (!busy && !closing) setImmediate(() => tick().finally(arm));
    });
    for (const name of ['stdout', 'stderr']) proc[name].on('data', data => log.write('output', { pid: proc.pid, releaseId: id, text: data.toString() }, name));
    const deadline = Date.now() + options.graceMs;
    let lastError = new Error('Startup health deadline exceeded');
    while (Date.now() < deadline) {
      if (exited) throw exitError;
      const record = await readJson(hostFile);
      if (record?.instanceId === instanceId) {
        child = record;
        try {
          await identify(record); await probe(id);
          state.child = { ...record, token: undefined }; await save();
          await log.write('child-ready', { pid: record.pid, createdAt: record.createdAt, releaseId: id, instanceId });
          failures = 0; state.consecutiveFailures = 0; healthySince = Date.now(); return;
        } catch (error) { lastError = error; }
      }
      await delay(Math.min(250, options.intervalMs));
    }
    throw lastError;
  }
  async function scheduleFailure(error) {
    await fault(error); healthySince = 0;
    const now = Date.now(); attempts = attempts.filter(time => now - time < 600000);
    state.retryLimited = state.retryLimited || attempts.length >= 5;
    state.phase = state.retryLimited ? 'failed' : 'recovering';
    nextAttempt = now + (state.retryLimited ? options.failureRetryMs : options.backoffMs[Math.min(attempts.length, options.backoffMs.length - 1)]);
    state.retryAttempts = attempts; state.nextAttemptAt = nextAttempt; await save();
  }
  async function switchRelease(id) {
    await manifest(id); // Reject unverified inputs before disturbing current.
    const old = state.current;
    state.transaction = { from: old, to: id, previous: state.previous };
    state.phase = 'switching'; state.desiredState = 'running'; await save();
    try {
      await stopChild();
      // Back up only after the old host has drained and exited. Keep this inside
      // the switch transaction so an IO failure restores the old service.
      if (loadProfile('production', root).EDITOR_BACKUP_ON_DEPLOY === 'true') {
        const backup = options.backup || (await import('./backup.mjs')).backupData;
        state.lastBackup = await backup(root);
        await save();
        await log.write('switch-backup-completed', { path: state.lastBackup, from: old, to: id });
      }
      await startChild(id);
      state.current = id; state.previous = old === id ? state.previous : old;
      state.phase = 'idle'; state.transaction = null; await save();
      await log.write('switch-committed', { from: old, to: id });
    } catch (error) {
      await fault(error);
      state.current = old; state.phase = 'recovering'; await save();
      try {
        await stopChild(); if (old) await startChild(old);
        state.phase = old ? 'idle' : 'failed'; state.transaction = null; await save();
      } catch (restoreError) { await scheduleFailure(restoreError); }
      throw new Error(`Deployment failed; current remains ${old}: ${error.message}`);
    }
  }
  async function tick() {
    if (busy || closing || state.desiredState !== 'running' || !state.current) return;
    busy = true;
    try {
      if (state.phase === 'recovering' || state.phase === 'failed' || !child) {
        if (Date.now() < nextAttempt) return;
        attempts = attempts.filter(time => Date.now() - time < 600000); attempts.push(Date.now());
        state.retryAttempts = attempts; await save();
        try { await stopChild(); await startChild(state.current); state.phase = 'idle'; state.transaction = null; await save(); }
        catch (error) { await scheduleFailure(error); }
      } else {
        try {
          if (child.exited) throw new Error('Owned child exited');
          const identity = await identify(child); await probe(state.current);
          state.memory = { ...identity.memory, metric: 'Node RSS bytes (resident memory); not private bytes' };
          failures = 0; state.consecutiveFailures = 0;
          if (!healthySince) healthySince = Date.now();
          if (Date.now() - healthySince >= options.stableMs) { attempts = []; state.retryAttempts = []; state.nextAttemptAt = null; state.retryLimited = false; }
          await save();
        } catch (error) {
          healthySince = 0; failures++; state.consecutiveFailures = failures;
          await fault(error);
          if (child?.exited || failures >= 3) await scheduleFailure(error);
        }
      }
    } catch (error) { await scheduleFailure(error); }
    finally { busy = false; }
  }
  function arm() {
    clearTimeout(timer);
    if (closing) return;
    const recovering = state.desiredState === 'running' && state.current && ['recovering', 'failed'].includes(state.phase);
    timer = setTimeout(async () => { await tick(); arm(); }, recovering ? Math.max(1, nextAttempt - Date.now()) : options.intervalMs);
  }
  async function execute(command, payload) {
    if (command === 'status') return summary();
    if (!['start', 'stop', 'deploy', 'rollback', 'shutdown'].includes(command)) throw new Error('Unknown control command');
    if (busy || closing) throw new Error('Supervisor is busy; retry after the current operation');
    busy = true;
    try {
      if (command === 'deploy' || command === 'rollback') {
        const id = command === 'rollback' ? state.previous : payload.releaseId;
        if (!id) throw new Error('No release selected'); await switchRelease(id);
      } else if (command === 'stop') {
        state.desiredState = 'stopped'; await save(); await stopChild(); state.phase = 'idle'; state.transaction = null; await save();
      } else if (command === 'start') {
        if (!state.current) throw new Error('No current release; deploy a verified release first');
        state.desiredState = 'running'; await save();
        if (!child || state.phase !== 'idle') { await stopChild(); await startChild(state.current); }
        state.phase = 'idle'; await save();
      } else {
        closing = true; await stopChild(); clearTimeout(timer); await save();
        setTimeout(async () => { await log.queue; await unlink(path.join(root, 'control-endpoint.json')).catch(() => {}); server.close(); guard.close(); }, 100);
      }
      return summary();
    } catch (error) { await fault(error); if (command === 'start') await scheduleFailure(error); if (command === 'shutdown') closing = false; throw error; }
    finally { busy = false; if (!closing) arm(); }
  }
  const token = secret();
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{"error":"Unauthorized"}'); return; }
    if (req.method !== 'POST' || req.url !== '/control') { res.writeHead(404).end('{}'); return; }
    let body = ''; let oversized = false;
    req.on('data', data => { body += data; if (body.length > 16384) { oversized = true; req.destroy(); } });
    req.on('end', async () => {
      if (oversized) return;
      try { const { command, payload = {} } = JSON.parse(body); const result = await execute(command, payload); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); }
      catch (error) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
    });
  });
  server.requestTimeout = 15000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  busy = true;
  try {
    // A host spawned just before supervisor death may still be publishing its
    // endpoint. Wait for that intent before assuming there is no orphan.
    if (state.child?.launching && !(await readJson(hostFile))) {
      const end = Date.now() + options.graceMs;
      while (Date.now() < end && !(await readJson(hostFile))) await delay(100);
    }
    await stopChild();
    if (state.transaction) {
      state.current = state.transaction.from; state.previous = state.transaction.previous;
      state.transaction = null; state.phase = 'recovering'; await save();
    }
    if (state.desiredState === 'running' && state.current) {
      if (Date.now() >= nextAttempt) { await startChild(state.current); state.phase = 'idle'; }
      else state.phase = state.retryLimited ? 'failed' : 'recovering';
    } else state.phase = 'idle';
    await save();
  } catch (error) { await scheduleFailure(error); }
  finally { busy = false; }
  await privateJson(path.join(root, 'control-endpoint.json'), { port: server.address().port, token, pid: process.pid });
  await log.write('supervisor-ready', { pid: process.pid, desiredState: state.desiredState, current: state.current });
  arm();
  const onSignal = () => execute('shutdown', {}).catch(error => log.write('shutdown-error', { message: error.message }));
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  return { request: execute, closed: new Promise(resolve => guard.once('close', () => {
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); resolve();
  })) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSupervisor(runtimeRoot(), process.env.EDITOR_SUPERVISOR_OPTIONS ? JSON.parse(process.env.EDITOR_SUPERVISOR_OPTIONS) : {})
    .catch(error => { console.error(error); process.exit(1); });
}
