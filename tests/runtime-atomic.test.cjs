const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const io = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const load = require('./helpers/load-typescript.cjs');
const source = path.resolve('lib/atomicFile.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-atomic-'));
const savedProfile = Object.fromEntries(['EDITOR_PROFILE', 'EDITOR_DATA_ROOT', 'EDITOR_PRODUCTION_PATHS'].map(k => [k, process.env[k]]));
Object.assign(process.env, { EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: root, EDITOR_PRODUCTION_PATHS: '[]' });
test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedProfile)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function helper() {
  assert.ok(fs.existsSync(source), 'atomic file helper must exist');
  return load()(source);
}
function fixture(name) {
  const dir = fs.mkdtempSync(path.join(root, name));
  const file = path.join(dir, 'entry.json');
  fs.writeFileSync(file, 'old bytes');
  return { dir, file };
}
for (const sync of [false, true]) {
  const mode = sync ? 'sync' : 'async';
  test(`${mode} replaces existing bytes and creates new files without leftovers`, async () => {
    const h = helper();
    const { dir, file } = fixture(mode);
    const write = sync ? h.atomicWriteFileSync : h.atomicWriteFile;
    await write(file, '新内容');
    assert.equal(fs.readFileSync(file, 'utf8'), '新内容');
    await write(path.join(dir, 'new.txt'), Buffer.from('new bytes'));
    assert.deepEqual(fs.readdirSync(dir).sort(), ['entry.json', 'new.txt']);
  });
  for (const stage of ['write', 'flush', 'rename', 'open']) {
    test(`${mode} ${stage} failure preserves old bytes and cleans owned temp`, async () => {
      const h = helper();
      const { dir, file } = fixture(mode);
      const error = Object.assign(new Error(`injected ${stage}`), { code: stage === 'open' ? 'EACCES' : 'EIO' });
      const write = sync ? h.atomicWriteFileSync : h.atomicWriteFile;
      const originals = { open: io.open, rename: io.rename, openSync: fs.openSync,
        writeFileSync: fs.writeFileSync, fsyncSync: fs.fsyncSync, renameSync: fs.renameSync };
      try {
        if (sync) {
          const method = { open: 'openSync', write: 'writeFileSync', flush: 'fsyncSync', rename: 'renameSync' }[stage];
          fs[method] = (...args) => {
            if (stage === 'write') originals.writeFileSync(args[0], 'partial');
            throw error;
          };
          assert.throws(() => write(file, 'replacement'), e => e === error);
        } else {
          io.open = async (...args) => {
            if (stage === 'open') throw error;
            const handle = await originals.open(...args);
            if (stage === 'write') handle.writeFile = async () => { await handle.write('partial'); throw error; };
            if (stage === 'flush') handle.sync = async () => { throw error; };
            return handle;
          };
          if (stage === 'rename') io.rename = async () => { throw error; };
          await assert.rejects(write(file, 'replacement'), e => e === error);
        }
      } finally {
        io.open = originals.open; io.rename = originals.rename;
        for (const key of ['openSync', 'writeFileSync', 'fsyncSync', 'renameSync']) fs[key] = originals[key];
      }
      assert.equal(fs.readFileSync(file, 'utf8'), 'old bytes');
      assert.deepEqual(fs.readdirSync(dir), ['entry.json']);
    });
  }
  test(`${mode} temp is exclusive, in destination directory, and flushed before replacement`, async () => {
    const h = helper();
    const { dir, file } = fixture(mode);
    const events = [];
    const originals = { open: io.open, rename: io.rename, openSync: fs.openSync, fsyncSync: fs.fsyncSync, renameSync: fs.renameSync };
    function checkTemp(temp, flags) {
      assert.equal(path.dirname(temp), dir);
      assert.notEqual(temp, file);
      assert.equal(flags, 'wx');
    }
    try {
      if (sync) {
        fs.openSync = (temp, flags, ...rest) => { checkTemp(temp, flags); return originals.openSync(temp, flags, ...rest); };
        fs.fsyncSync = fd => { events.push('flush'); return originals.fsyncSync(fd); };
        fs.renameSync = (from, to) => { events.push('rename'); return originals.renameSync(from, to); };
        h.atomicWriteFileSync(file, 'complete');
      } else {
        io.open = async (temp, flags, ...rest) => {
          checkTemp(temp, flags);
          const handle = await originals.open(temp, flags, ...rest);
          const flush = handle.sync.bind(handle);
          handle.sync = async () => { events.push('flush'); return flush(); };
          return handle;
        };
        io.rename = async (from, to) => { events.push('rename'); return originals.rename(from, to); };
        await h.atomicWriteFile(file, 'complete');
      }
    } finally {
      io.open = originals.open; io.rename = originals.rename;
      for (const key of ['openSync', 'fsyncSync', 'renameSync']) fs[key] = originals[key];
    }
    assert.deepEqual(events, ['flush', 'rename']);
    assert.equal(fs.readFileSync(file, 'utf8'), 'complete');
  });
}

async function isolated(run) {
  const dir = fs.mkdtempSync(path.join(root, 'routes-'));
  const paths = {
    DIARY_DATA_PATH: 'diary', TRAINING_LOG_PATH: 'training/log', TRAINING_PLAN_PATH: 'training/plan.json',
    INTERVIEW_LOG_PATH: 'interview/log', INTERVIEW_PLAN_PATH: 'interview/plan.json',
    INTERVIEW_INVENTORY_PATH: 'interview/inventory.json', INTERVIEW_MASTERY_PATH: 'interview/mastery.json',
    INTERVIEW_RECORDINGS_PATH: 'recordings', LABELS_CONFIG_PATH: 'labels.json', ARCHIVE_PATH: 'archive',
    SHARE_TOKENS_PATH: 'tokens.json', STEAM_EXPORT_PATH: 'steam_export', STEAM_IMG_PATH: 'steam_img', LEETCODE_REPO: 'repo',
  };
  const env = { ...Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, path.join(dir, v)])),
    EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: dir, EDITOR_PRODUCTION_PATHS: '[]', EDITOR_ALLOW_EXTERNAL_WRITES: 'true' };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  try { await run(dir, load()); }
  finally { for (const k of Object.keys(env)) {
    if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
  } }
}
const request = (method, body) => new Request('http://localhost/api/test', { method, body: JSON.stringify(body) });
for (const kind of ['diary', 'training', 'interview', 'labels', 'leetcode', 'sync-repo', 'publish', 'unpublish']) {
  test(`${kind} save keeps old bytes when atomic replacement fails`, () => isolated(async (dir, loader) => {
    let file, save, route = false;
    const seed = (name, bytes) => {
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      return target;
    };
    if (['diary', 'training', 'interview'].includes(kind)) {
      file = seed(`${kind}${kind === 'diary' ? '' : '/log'}/2026-09-15${kind === 'diary' ? '_public' : ''}.md`, 'old bytes');
      const mod = loader(path.resolve(`lib/${kind}FileSystem.ts`));
      const method = { diary: 'writeDiaryFile', training: 'writeTrainingDay', interview: 'writeInterviewDay' }[kind];
      save = () => mod[method]('2026-09-15', 'new bytes');
    } else if (kind === 'labels') {
      file = seed('labels.json', '[]');
      const mod = loader(path.resolve('app/api/labels/route.ts'));
      save = () => mod.POST(request('POST', { labels: [{ id: 'a', name: 'A', color: '#fff' }] }));
      route = true;
    } else if (kind === 'leetcode' || kind === 'sync-repo') {
      file = seed('interview/leetcode-log.json', JSON.stringify({ 1: { attempts: [{ date: '2026-09-14', outcome: 'clean' }] } }));
      seed('interview/leetcode.json', JSON.stringify({ problems: [{ id: 1 }] }));
      seed('repo/1_redo.py', '# fixture');
      const mod = loader(path.resolve(`app/api/interview/leetcode/${kind === 'sync-repo' ? 'sync-repo/' : ''}route.ts`));
      save = kind === 'sync-repo' ? () => mod.POST() : () => mod.PUT(request('PUT', { problemId: 1, date: '2026-09-15', outcome: 'clean' }));
      route = true;
    } else {
      seed('diary/2026-09-15_public.md', 'fixture diary');
      file = seed('tokens.json', JSON.stringify({ tokens: kind === 'unpublish' ? { fixture: { filename: '2026-09-15_public.md' } } : {} }));
      const mod = loader(path.resolve('app/api/publish/route.ts'));
      save = kind === 'publish' ? () => mod.POST(request('POST', { date: '2026-09-15', tokenId: 'fixture' }))
        : () => mod.DELETE(request('DELETE', { date: '2026-09-15' }));
      route = true;
    }
    const before = fs.readFileSync(file);
    const originalAsync = io.rename, originalSync = fs.renameSync, originalError = console.error;
    io.rename = async () => { throw Error('injected replacement failure'); };
    fs.renameSync = () => { throw Error('injected replacement failure'); };
    console.error = () => {};
    try {
      if (route) assert.equal((await save()).status, 500);
      else await assert.rejects(save());
    } finally { io.rename = originalAsync; fs.renameSync = originalSync; console.error = originalError; }
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(path.dirname(file)).filter(n => n.endsWith('.tmp')), []);
  }));
}
