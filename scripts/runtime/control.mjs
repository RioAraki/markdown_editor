import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runtimeRoot, loadProfile, readJson } from './config.mjs';
import { prepareRelease, pruneReleases } from './release.mjs';
import { backupData, initializeSandbox } from './backup.mjs';
import { verifyCandidate } from './smoke.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = runtimeRoot();
async function withDeployLock(callback) {
  await fs.mkdir(root, { recursive: true });
  const lock = path.join(root, 'deploy.lock');
  const handle = await fs.open(lock, 'wx').catch(error => { if (error.code === 'EEXIST') throw new Error('Another deployment owns deploy.lock. If interrupted, check its PID before removing this lock.'); throw error; });
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return await callback(); }
  finally { await handle.close(); await fs.unlink(lock); }
}
async function control(command, payload = {}) {
  const { requestControl } = await import('./supervisor.mjs');
  return requestControl(command, payload, root);
}
async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === 'dev') {
    const env = { ...loadProfile('development', root), NODE_ENV: 'development', EDITOR_RELEASE_ID: 'development' };
    const child = spawn(process.execPath, ['--max-old-space-size=2048', path.join(project, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3003', '-H', '127.0.0.1'], { cwd: project, env, windowsHide: true, stdio: 'inherit' });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code || 0; });
    return;
  }
  if (command === 'init-sandbox') {
    await initializeSandbox(argument || 'development', root);
    console.log('Sandbox initialized. Existing copies are never overwritten.'); return;
  }
  if (command === 'backup') { console.log(await backupData(root)); return; }
  if (command === 'deploy' || command === 'prepare') {
    await withDeployLock(async () => {
      console.log('Building an isolated release; current 3002 is unchanged.');
      const candidate = await prepareRelease({ editorRepo: project, root });
      console.log(`Build passed: ${candidate.manifest.releaseId}. Checking candidate on 3004.`);
      await verifyCandidate({ releaseDir: candidate.releaseDir, root });
      console.log('Candidate verified.');
      if (command === 'prepare') { console.log(candidate.manifest.releaseId); return; }
      console.log('Switching after requests drain; supervisor will back up data while writes are stopped.');
      console.log(JSON.stringify(await control('deploy', { releaseId: candidate.manifest.releaseId }), null, 2));
      console.log(JSON.stringify({ retiredReleases: await pruneReleases(root) }));
    });
    return;
  }
  if (['status', 'start', 'stop', 'rollback', 'shutdown'].includes(command)) {
    try { console.log(JSON.stringify(await control(command), null, 2)); }
    catch (error) {
      if (command !== 'status') throw error;
      console.log(JSON.stringify({ supervisorReachable: false, error: error.message, state: await readJson(path.join(root, 'state.json')) }, null, 2));
      process.exitCode = 1;
    }
    return;
  }
  throw new Error('Use dev | init-sandbox development/candidate | prepare | deploy | backup | status | start | stop | rollback');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
