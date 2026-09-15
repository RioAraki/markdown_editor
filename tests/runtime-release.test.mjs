import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const configPath = new URL('../scripts/runtime/config.mjs', import.meta.url);
const releasePath = new URL('../scripts/runtime/release.mjs', import.meta.url);

test('release ids cannot escape or address arbitrary runtime files', async () => {
  const { assertReleaseId, releaseDirectory } = await import(configPath);
  for (const id of ['../config', '..', 'a/b', 'a\\b', 'C:bad', '', '.hidden']) {
    assert.throws(() => assertReleaseId(id));
  }
  assert.equal(releaseDirectory('20260915-abc', '/tmp/runtime'), path.resolve('/tmp/runtime/releases/20260915-abc'));
});

test('missing profiles fail closed and JSON state updates preserve complete documents', async () => {
  const { loadProfile, writeJson, readJson } = await import(configPath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-config-'));
  try {
    assert.throws(() => loadProfile('development', root), /profile|配置|ENOENT/i);
    await writeJson(path.join(root, 'state.json'), { current: 'a', desiredState: 'stopped' });
    await writeJson(path.join(root, 'state.json'), { current: 'b', desiredState: 'running' });
    assert.deepEqual(await readJson(path.join(root, 'state.json')), { current: 'b', desiredState: 'running' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('candidate profiles cannot redefine their sandbox as a production data directory', async () => {
  const { loadProfile, writeJson } = await import(configPath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-profile-overlap-'));
  try {
    const productionData = path.join(root, 'real-data');
    await fs.mkdir(productionData);
    await writeJson(path.join(root, 'config/production.env'), { EDITOR_PROFILE: 'production', DIARY_DATA_PATH: productionData });
    await writeJson(path.join(root, 'config/candidate.env'), { EDITOR_PROFILE: 'candidate', EDITOR_DATA_ROOT: productionData });
    assert.throws(() => loadProfile('candidate', root), /production|overlap/i);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('snapshot refuses uncommitted files, excludes personal runtime data, freezes selected source', async () => {
  const { snapshotRepository } = await import(releasePath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-release-'));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { windowsHide: true });
  try {
    git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    await fs.writeFile(path.join(repo, 'app.txt'), 'version one');
    await fs.writeFile(path.join(repo, '.gitignore'), '.local/\n.env.local\n');
    git('add', '.'); git('commit', '-m', 'fixture');
    await fs.mkdir(path.join(repo, '.local'));
    await fs.writeFile(path.join(repo, '.local', 'secret'), 'personal');
    const out = path.join(root, 'snapshot');
    await snapshotRepository(repo, out);
    assert.equal(await fs.readFile(path.join(out, 'app.txt'), 'utf8'), 'version one');
    assert.equal(await fs.stat(path.join(out, '.local')).catch(() => null), null);
    await fs.writeFile(path.join(repo, 'app.txt'), 'uncommitted');
    await assert.rejects(snapshotRepository(repo, path.join(root, 'other')), /uncommitted|未提交/i);
    assert.equal(await fs.readFile(path.join(out, 'app.txt'), 'utf8'), 'version one');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('failed build keeps the serving version untouched and release unverified', async () => {
  const { buildSnapshot } = await import(releasePath);
  const { writeJson, readJson } = await import(configPath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-build-'));
  const release = path.join(root, 'releases', 'candidate');
  try {
    await fs.mkdir(path.join(release, 'editor'), { recursive: true });
    await writeJson(path.join(root, 'state.json'), { current: 'good', desiredState: 'running' });
    await writeJson(path.join(release, 'manifest.json'), { releaseId: 'candidate', verified: false });
    await assert.rejects(buildSnapshot(release, {}, { commands: [[process.execPath, ['-e', 'process.exit(23)']]] }), /23/);
    assert.equal((await readJson(path.join(root, 'state.json'))).current, 'good');
    assert.equal((await readJson(path.join(release, 'manifest.json'))).verified, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('release retention protects current and previous even when older than the retained versions', async () => {
  const { pruneReleases } = await import(releasePath);
  const { writeJson } = await import(configPath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-retention-'));
  try {
    await writeJson(path.join(root, 'state.json'), { current: 'one', previous: 'two' });
    for (const [i, id] of ['one','two','three','four','five','six'].entries()) await writeJson(path.join(root, 'releases', id, 'manifest.json'), { releaseId: id, verified: true, verifiedAt: `2026-09-${String(i+1).padStart(2,'0')}T00:00:00Z` });
    await pruneReleases(root);
    assert.deepEqual((await fs.readdir(path.join(root, 'releases'))).sort(), ['five','four','one','six','two']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
