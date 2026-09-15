import { workerData } from 'node:worker_threads';
import { processIdentity } from './supervisor.mjs';

let expected = workerData.identity;
function check() {
  try {
    const actual = processIdentity(workerData.pid);
    expected ||= actual;
    if (!expected || !actual || actual.created !== expected.created || actual.command !== expected.command) {
      process.kill(process.pid, 'SIGKILL'); // this worker shares the candidate PID
    }
  } catch { process.kill(process.pid, 'SIGKILL'); }
}
check();
setInterval(check, 2000);
