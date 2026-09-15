import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

for (const blocked of [false, true]) test(`candidate exits after controller death with ${blocked ? 'blocked' : 'responsive'} event loop`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-candidate-owner-'));
  const preload = fileURLToPath(new URL('../scripts/runtime/candidate-lifecycle.cjs', import.meta.url));
  let controller, pid;
  try {
    await fs.access(preload);
    const childFile = path.join(root, 'child.cjs');
    await fs.writeFile(childFile, 'process.send(process.pid); ' + (blocked ? 'while(true){}' : 'setInterval(()=>{},1000);'));
    const controllerFile = path.join(root, 'parent.cjs');
    await fs.writeFile(controllerFile, `const {fork}=require('node:child_process'); const fs=require('node:fs'); const c=fork(${JSON.stringify(childFile)},[],{execArgv:['--require',${JSON.stringify(preload)}],windowsHide:true});c.on('message',pid=>fs.writeFileSync(${JSON.stringify(path.join(root, 'pid'))},String(pid)));`);
    controller = spawn(process.execPath, [controllerFile], { windowsHide: true, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { pid = Number(await fs.readFile(path.join(root, 'pid'), 'utf8').catch(() => '0')); if (pid) break; await delay(50); }
    assert(pid > 0);
    // Let the child enter its synchronous loop before cutting the IPC channel.
    await delay(500);
    assert.doesNotThrow(() => process.kill(pid, 0), 'candidate must still be alive before owner death');
    controller.kill();
    let alive = true;
    for (let i = 0; i < 300; i++) { try { process.kill(pid, 0); } catch { alive = false; break; } await delay(50); }
    assert.equal(alive, false, 'candidate survived controller death');
  } finally {
    controller?.kill();
    if (pid) { try { process.kill(pid); } catch {} }
    await fs.rm(root, { recursive: true, force: true });
  }
});
