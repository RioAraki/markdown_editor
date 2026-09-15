import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { privateJson, singletonAddress, processIdentity } from './supervisor.mjs';
import { assertReleaseId } from './config.mjs';

// A host owns Next itself, rather than a shell/npm/CLI grandchild. The control
// event loop remains responsive when an HTTP handler never sends a response.
const options = JSON.parse(process.env.EDITOR_HOST_OPTIONS);
const { root, releaseId, token, instanceId, manifestHash, recordFile, port,
  hostname = '0.0.0.0', stopMs = 30000 } = options;
assertReleaseId(releaseId);
if (typeof token !== 'string' || token.length < 32 || typeof instanceId !== 'string' || instanceId.length < 32) throw new Error('Host requires strong launch credentials');
const releaseDir = path.join(root, 'releases', releaseId, 'editor');
const identity = { pid: process.pid, createdAt: new Date().toISOString(), instanceId,
  releaseId, manifestHash, token, port: null, osIdentity: processIdentity(process.pid) };
const guard = net.createServer(socket => socket.destroy());
await new Promise((resolve, reject) => { guard.once('error', reject); guard.listen(singletonAddress(root, `host-${port}`), resolve); });
const actualHash = createHash('sha256').update(await readFile(path.join(releaseDir, '../manifest.json'))).digest('hex');
if (actualHash !== manifestHash) throw new Error('Manifest changed before host start');
let application;
let web;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ event: 'shutdown-deadline', pid: process.pid, releaseId, stopMs }));
    web?.closeAllConnections();
    process.exit(1);
  }, stopMs);
  try {
    if (web?.listening) await new Promise(resolve => { web.close(resolve); web.closeIdleConnections(); });
    await application?.close();
    clearTimeout(deadline);
    process.exit(0);
  } catch (error) { console.error(error); process.exit(1); }
}
const control = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/identity') {
    res.end(JSON.stringify({ ...identity, token: undefined, memory: { rssBytes: process.memoryUsage().rss } }));
  } else if (req.method === 'POST' && req.url === '/shutdown') {
    res.end('{"ok":true}');
    setImmediate(shutdown);
  } else res.writeHead(404).end('{}');
});
await new Promise((resolve, reject) => { control.once('error', reject); control.listen(0, '127.0.0.1', resolve); });
identity.port = control.address().port;
await privateJson(recordFile, identity);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  process.chdir(releaseDir);
  const require = createRequire(path.join(releaseDir, 'package.json'));
  const next = require('next');
  application = next({ dev: false, dir: releaseDir, hostname, port });
  await application.prepare();
  if (!stopping) {
    const handler = application.getRequestHandler();
    web = http.createServer((req, res) => {
      // Existing handlers finish; pipelined requests arriving on a connection
      // being drained must not start new writes after shutdown was accepted.
      if (stopping) { res.writeHead(503, { Connection: 'close' }); res.end('Service draining'); return; }
      Promise.resolve(handler(req, res)).catch(error => {
        console.error(error); if (!res.headersSent) res.writeHead(500); res.end();
      });
    });
    if (application.getUpgradeHandler) {
      const upgrade = application.getUpgradeHandler();
      web.on('upgrade', (req, socket, head) => {
        if (stopping) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
        upgrade(req, socket, head);
      });
    }
    await new Promise((resolve, reject) => { web.once('error', reject); web.listen(port, hostname, resolve); });
  }
} catch (error) { console.error(error); process.exit(1); }
