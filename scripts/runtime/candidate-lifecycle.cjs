// Only candidate processes load this file through fork(). Losing the deployment
// controller invalidates verification and must not leave a listener behind.
// Production uses its persistent, authenticated host instead.
if (process.connected) {
  process.once('disconnect', () => process.exit(1));
  // A worker has its own event loop, so even a synchronous application loop
  // cannot prevent ownership enforcement when the controller disappears.
  const { Worker } = require('node:worker_threads');
  const path = require('node:path');
  const guard = new Worker(path.join(__dirname, 'candidate-watchdog.mjs'), {
    workerData: { pid: process.ppid, identity: process.env.EDITOR_CANDIDATE_OWNER_ID ? JSON.parse(process.env.EDITOR_CANDIDATE_OWNER_ID) : null },
  });
  guard.on('error', () => process.exit(1));
  guard.unref();
}
