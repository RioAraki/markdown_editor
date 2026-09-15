const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const makeLoader = require('./helpers/load-typescript.cjs');
const helper = path.resolve('lib/serverPaths.ts');
const resolve = (...args) => {
  assert.ok(fs.existsSync(helper), 'central server path resolver must exist');
  return makeLoader()(helper).resolveServerPaths(...args);
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-isolation-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('production defaults are independent of the release cwd', () => {
  const a = resolve({ EDITOR_PROFILE: 'production' }, 'D:/release/a/editor');
  const b = resolve({ EDITOR_PROFILE: 'production' }, 'D:/release/b/editor');
  assert.deepEqual(a, b);
  assert.equal(a.recordings, path.resolve('D:/markdown_editor/.local/interview-recordings'));
  assert.equal(a.labels, path.resolve('D:/markdown_editor/config/labels.json'));
});
test('legacy tests retain cwd defaults and environment overrides', () => {
  const p = resolve({ INTERVIEW_LOG_PATH: path.join(root, 'interview/log') }, root);
  assert.equal(p.recordings, path.join(root, '.local/interview-recordings'));
  assert.equal(p.interviewPlan, path.join(root, 'interview/plan.json'));
});
for (const profile of ['development', 'candidate']) {
  test(`${profile} requires an absolute data root and contains every default`, () => {
    assert.throws(() => resolve({ EDITOR_PROFILE: profile }, root), /EDITOR_DATA_ROOT/);
    assert.throws(() => resolve({ EDITOR_PROFILE: profile, EDITOR_DATA_ROOT: 'relative' }, root), /absolute/);
    const p = resolve({ EDITOR_PROFILE: profile, EDITOR_DATA_ROOT: root }, root);
    for (const target of Object.values(p)) {
      assert.ok(path.isAbsolute(target));
      assert.ok(!path.relative(root, target).startsWith('..'), target);
    }
  });
  test(`${profile} rejects every override escaping the sandbox`, () => {
    for (const key of ['DIARY_DATA_PATH', 'TRAINING_LOG_PATH', 'TRAINING_PLAN_PATH',
      'INTERVIEW_LOG_PATH', 'INTERVIEW_PLAN_PATH', 'INTERVIEW_INVENTORY_PATH',
      'INTERVIEW_MASTERY_PATH', 'INTERVIEW_RECORDINGS_PATH', 'LABELS_CONFIG_PATH',
      'STEAM_EXPORT_PATH', 'STEAM_IMG_PATH', 'ARCHIVE_PATH', 'SHARE_TOKENS_PATH', 'LEETCODE_REPO']) {
      assert.throws(() => resolve({ EDITOR_PROFILE: profile, EDITOR_DATA_ROOT: root,
        [key]: path.join(root, '../outside') }, root), /outside|sandbox/);
    }
    assert.throws(() => resolve({ EDITOR_PROFILE: profile, EDITOR_DATA_ROOT: root,
      INTERVIEW_LOG_PATH: root }, root), /outside|sandbox/);
  });
}
test('junction escape is refused even for a target that does not exist yet', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-outside-'));
  try {
    fs.symlinkSync(outside, path.join(root, 'escape'), 'junction');
    assert.throws(() => resolve({ EDITOR_PROFILE: 'development', EDITOR_DATA_ROOT: root,
      LABELS_CONFIG_PATH: path.join(root, 'escape/new/labels.json') }, root), /outside|sandbox/);
  } finally { fs.unlinkSync(path.join(root, 'escape')); fs.rmSync(outside, { recursive: true }); }
});
test('unknown profiles fail closed', () => {
  assert.throws(() => resolve({ EDITOR_PROFILE: 'developmnt' }, root), /profile/i);
});
test('health is dynamic and does not cache release identity', async () => {
  const filename = path.resolve('app/api/health/route.ts');
  assert.ok(fs.existsSync(filename), 'health route must exist');
  const route = makeLoader()(filename);
  assert.equal(route.dynamic, 'force-dynamic');
  const response = await route.GET();
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.releaseId, process.env.EDITOR_RELEASE_ID || 'development');
  assert.equal(body.mode, process.env.EDITOR_PROFILE || 'development');
  assert.ok(body.uptimeSeconds >= 0);
  assert.deepEqual(Object.keys(body).sort(), ['mode', 'releaseId', 'status', 'uptimeSeconds']);
});
test('sync-repo is blocked before reading or writing data', () => inSandbox(async (p, load) => {
  const route = load(path.resolve('app/api/interview/leetcode/sync-repo/route.ts'));
  const response = await route.POST();
  assert.equal(response.status, 403);
}));

async function inSandbox(run) {
  const keys = ['EDITOR_PROFILE', 'EDITOR_DATA_ROOT', 'EDITOR_PRODUCTION_PATHS', 'EDITOR_ALLOW_EXTERNAL_WRITES',
    'DIARY_DATA_PATH', 'TRAINING_LOG_PATH', 'TRAINING_PLAN_PATH', 'INTERVIEW_LOG_PATH',
    'INTERVIEW_PLAN_PATH', 'INTERVIEW_INVENTORY_PATH', 'INTERVIEW_MASTERY_PATH',
    'INTERVIEW_RECORDINGS_PATH', 'LABELS_CONFIG_PATH', 'STEAM_EXPORT_PATH',
    'STEAM_IMG_PATH', 'ARCHIVE_PATH', 'SHARE_TOKENS_PATH', 'LEETCODE_REPO'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  keys.forEach(k => delete process.env[k]);
  Object.assign(process.env, { EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: root,
    EDITOR_ALLOW_EXTERNAL_WRITES: 'false' });
  try { await run(resolve(process.env, root), makeLoader()); }
  finally { for (const k of keys) {
    if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
  } }
}
const req = (method, data) => new Request('http://localhost/api/test', {
  method, ...(data ? { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } } : {}),
});
test('labels persist across fresh route loads in the candidate copy', () => inSandbox(async (p, load) => {
  const route = load(path.resolve('app/api/labels/route.ts'));
  const labels = [{ id: 'test', name: 'copy only', color: '#abcdef' }];
  assert.equal((await route.POST(req('POST', { labels }))).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(p.labels, 'utf8')), labels);
  const fresh = makeLoader()(path.resolve('app/api/labels/route.ts'));
  assert.deepEqual((await (await fresh.GET(req('GET'))).json()).labels, labels);
}));
test('archive GET migrates only its configured copy and survives reload', () => inSandbox(async (p, load) => {
  fs.mkdirSync(p.archive, { recursive: true });
  const json = path.join(p.archive, 'legacy.json');
  fs.writeFileSync(json, JSON.stringify({ title: 'Copy archive', content: 'only sandbox', createdAt: '2026-09-15' }));
  const route = load(path.resolve('app/api/archive/route.ts'));
  const response = await route.GET(req('GET'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).archives[0].content.trim(), 'only sandbox');
  assert.equal(fs.existsSync(json), false);
  assert.equal(fs.readdirSync(p.archive).filter(f => f.endsWith('.md')).length, 1);
  const fresh = makeLoader()(path.resolve('app/api/archive/route.ts'));
  assert.equal((await (await fresh.GET(req('GET'))).json()).archives.length, 1);
}));
test('local publication tokens are created only in the isolated data copy', () => inSandbox(async (p, load) => {
  fs.mkdirSync(p.diary, { recursive: true });
  fs.writeFileSync(path.join(p.diary, '2026-09-15_public.md'), 'sandbox diary');
  const route = load(path.resolve('app/api/publish/route.ts'));
  const response = await route.POST(req('POST', { date: '2026-09-15', tokenId: 'sandbox-token' }));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(p.shareTokens, 'utf8')).tokens['sandbox-token'].filename, '2026-09-15_public.md');
}));
test('archive traversal is rejected before changing an outside file', () => inSandbox(async (p, load) => {
  const sentinel = path.join(root, 'outside.md');
  fs.writeFileSync(sentinel, 'preserve me');
  const route = load(path.resolve('app/api/archive/[id]/route.ts'));
  const response = await route.DELETE(req('DELETE'), { params: Promise.resolve({ id: '../outside' }) });
  assert.equal(response.status, 400);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me');
}));
test('external-write opt-out blocks publication against non-isolated profiles', () => inSandbox(async (p, load) => {
  fs.mkdirSync(p.diary, { recursive: true });
  fs.writeFileSync(path.join(p.diary, '2026-09-15_public.md'), 'sandbox diary');
  fs.writeFileSync(p.shareTokens, JSON.stringify({ tokens: {} }));
  process.env.EDITOR_PROFILE = 'production';
  process.env.DIARY_DATA_PATH = p.diary;
  process.env.SHARE_TOKENS_PATH = p.shareTokens;
  const before = fs.readFileSync(p.shareTokens, 'utf8');
  const route = load(path.resolve('app/api/publish/route.ts'));
  assert.equal((await route.POST(req('POST', { date: '2026-09-15', tokenId: 'disabled-token' }))).status, 403);
  assert.equal(fs.readFileSync(p.shareTokens, 'utf8'), before);
}));
test('diary, training and recordings persist inside a candidate after module reload', () => inSandbox(async (p, load) => {
  const diary = load(path.resolve('lib/diaryFileSystem.ts'));
  const filename = await diary.writeDiaryFile('2026-09-16', 'copy diary');
  assert.equal(fs.readFileSync(path.join(p.diary, filename), 'utf8'), 'copy diary');
  assert.equal(await makeLoader()(path.resolve('lib/diaryFileSystem.ts')).readDiaryFile('2026-09-16'), 'copy diary');
  const training = load(path.resolve('lib/trainingFileSystem.ts'));
  fs.mkdirSync(p.trainingLog, { recursive: true });
  await training.createTrainingDay('2026-09-16', 'copy training');
  assert.equal(await makeLoader()(path.resolve('lib/trainingFileSystem.ts')).readTrainingDay('2026-09-16'), 'copy training');
  const recordings = load(path.resolve('lib/interviewRecordings.ts'));
  const saved = await recordings.saveRecording('behavioral:copy-test', Buffer.from('copy audio'), 'audio/webm', 1);
  const fresh = makeLoader()(path.resolve('lib/interviewRecordings.ts'));
  assert.equal((await fresh.readRecording('behavioral:copy-test', saved.id)).id, saved.id);
  assert.equal(fs.readFileSync(path.join(p.recordings, 'behavioral/copy-test', saved.id, 'audio'), 'utf8'), 'copy audio');
}));
test('Steam exports and image routes read only the configured copy', () => inSandbox(async (p, load) => {
  fs.mkdirSync(p.steamExport, { recursive: true });
  fs.mkdirSync(p.steamImages, { recursive: true });
  fs.writeFileSync(path.join(p.steamExport, 'steam_dashboard_2026-09-15.json'), JSON.stringify({ copy: true }));
  fs.writeFileSync(path.join(p.steamImages, 'test.jpg'), 'image bytes');
  const steam = load(path.resolve('app/api/steam/[date]/route.ts'));
  const response = await steam.GET(req('GET'), { params: Promise.resolve({ date: '2026-09-15' }) });
  assert.deepEqual((await response.json()).export, { copy: true });
  const images = load(path.resolve('app/steam_img/[filename]/route.ts'));
  const image = await images.GET(req('GET'), { params: Promise.resolve({ filename: 'test.jpg' }) });
  assert.equal(await image.text(), 'image bytes');
}));
test('Steam rejects traversal in date parameters', () => inSandbox(async (p, load) => {
  const route = load(path.resolve('app/api/steam/[date]/route.ts'));
  const response = await route.GET(req('GET'), { params: Promise.resolve({ date: 'x/../../outside' }) });
  assert.equal(response.status, 400);
}));
for (const body of ['replacement', '']) {
  test(`topics PUT cannot ${body ? 'overwrite' : 'delete'} through a descendant junction`, () => inSandbox(async (p, load) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-sentinel-'));
    const link = path.join(p.interviewData, 'topics');
    fs.mkdirSync(p.interviewData, { recursive: true });
    const sentinel = path.join(outside, 'fixture.md');
    fs.writeFileSync(sentinel, '# Original\n\npreserve me');
    // Load before junction creation: cached root validation is not sufficient.
    const route = load(path.resolve('app/api/interview/topics/route.ts'));
    fs.symlinkSync(outside, link, 'junction');
    const oldError = console.error;
    console.error = () => {};
    try {
      const response = await route.PUT(req('PUT', { id: 'fixture', body }));
      assert.ok(response.status >= 400);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), '# Original\n\npreserve me');
    } finally { console.error = oldError; fs.unlinkSync(link); fs.rmSync(outside, { recursive: true }); }
  }));
}
test('labels save rejects a final file symlink created after module load', t => inSandbox(async (p, load) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-sentinel-'));
  const sentinel = path.join(outside, 'labels.json');
  fs.writeFileSync(sentinel, '[]');
  const route = load(path.resolve('app/api/labels/route.ts'));
  fs.rmSync(p.labels, { force: true });
  fs.mkdirSync(path.dirname(p.labels), { recursive: true });
  try { fs.symlinkSync(sentinel, p.labels, 'file'); }
  catch (error) {
    fs.rmSync(outside, { recursive: true });
    if (error.code === 'EPERM') { t.skip('Windows account cannot create file symlinks'); return; }
    throw error;
  }
  const oldError = console.error;
  console.error = () => {};
  try {
    const response = await route.POST(req('POST', { labels: [{ id: 'a', name: 'A', color: '#fff' }] }));
    assert.ok(response.status >= 400);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), '[]');
    assert.ok(fs.lstatSync(p.labels).isSymbolicLink());
  } finally { console.error = oldError; fs.unlinkSync(p.labels); fs.rmSync(outside, { recursive: true }); }
}));
test('sandbox root cannot overlap actual production targets, including junction aliases', () => {
  const production = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-prod-fixture-'));
  const alias = path.join(root, 'production-alias');
  try {
    fs.symlinkSync(production, alias, 'junction');
    for (const dataRoot of [production, path.dirname(production), path.join(production, 'child'), alias]) {
      assert.throws(() => resolve({ EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: dataRoot,
        EDITOR_PRODUCTION_PATHS: JSON.stringify([production]) }, root), /production|overlap/i);
    }
  } finally { fs.unlinkSync(alias); fs.rmSync(production, { recursive: true }); }
});
test('guarded filesystem refuses reads, deletes and both rename paths through junctions', () => inSandbox(async (p, load) => {
  const { guardedFs: sync, guardedPromises: asyncFs } = load(path.resolve('lib/guardedFs.ts'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-guard-fixture-'));
  const link = path.join(root, 'nested-link');
  const sentinel = path.join(outside, 'sentinel.txt');
  const viaLink = path.join(link, 'sentinel.txt');
  const local = path.join(root, 'rename-source.txt');
  fs.writeFileSync(sentinel, 'preserved');
  fs.writeFileSync(local, 'local');
  fs.symlinkSync(outside, link, 'junction');
  try {
    for (const action of [() => sync.readFileSync(viaLink), () => sync.writeFileSync(viaLink, 'bad'),
      () => sync.unlinkSync(viaLink), () => sync.rmSync(viaLink), () => sync.mkdirSync(path.join(link, 'new')),
      () => sync.renameSync(local, viaLink), () => sync.renameSync(viaLink, local)]) {
      assert.throws(action, /outside.*sandbox/);
    }
    for (const action of [() => asyncFs.readFile(viaLink), () => asyncFs.writeFile(viaLink, 'bad'),
      () => asyncFs.unlink(viaLink), () => asyncFs.rm(viaLink), () => asyncFs.mkdir(path.join(link, 'new')),
      () => asyncFs.rename(local, viaLink), () => asyncFs.rename(viaLink, local)]) {
      await assert.rejects(async () => action(), /outside.*sandbox/);
    }
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserved');
    assert.equal(fs.readFileSync(local, 'utf8'), 'local');
    assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
  } finally { fs.unlinkSync(link); fs.rmSync(outside, { recursive: true }); }
}));
test('fixed production paths and malformed production configuration fail closed', () => {
  for (const target of ['D:/diary/data', 'D:/diary/steam_img', 'D:/markdown_editor', 'D:/github/leetcode2020']) {
    assert.throws(() => resolve({ EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: target }, root), /production/);
  }
  for (const extra of ['{}', '["relative"]', 'not-json']) {
    assert.throws(() => resolve({ EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: root, EDITOR_PRODUCTION_PATHS: extra }, root));
  }
});
