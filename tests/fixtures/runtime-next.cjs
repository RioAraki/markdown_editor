// A real HTTP application loaded inside the child host; no production data/ports.
const fs = require('node:fs');
module.exports = () => ({
  async prepare() {},
  getRequestHandler() {
    return (req, res) => {
      let behavior = 'healthy';
      try { behavior = fs.readFileSync(process.env.RUNTIME_BEHAVIOR_FILE, 'utf8').trim(); } catch {}
      if (behavior === 'exit') process.exit(17);
      if (behavior === 'hang') return;
      if (behavior === 'cpu') { while (true) {} }
      if (req.url === '/drain') {
        res.writeHead(200); res.flushHeaders();
        setTimeout(() => {
          if (process.env.RUNTIME_DRAIN_FILE) fs.writeFileSync(process.env.RUNTIME_DRAIN_FILE, 'completed');
          res.end('completed');
        }, 120);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ releaseId: behavior === 'wrong' ? 'other' : process.env.EDITOR_RELEASE_ID,
        mode: process.env.EDITOR_PROFILE }));
    };
  },
  async close() {},
});
