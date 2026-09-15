import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runtimeRoot, releaseDirectory, writeJson, readJson, loadProfile, assertReleaseId } from './config.mjs';

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}
export async function runCommand(file, args, { cwd, env = process.env, logFile } = {}) {
  const log = logFile ? await fs.open(logFile, 'a') : null;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: log ? ['ignore', log.fd, log.fd] : 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited ${code ?? signal}; ${logFile || 'see output'}`)));
    });
  } finally { await log?.close(); }
}
export async function snapshotRepository(repo, destination, subdirectory, selectedCommit) {
  const selection = subdirectory ? ['--', subdirectory] : [];
  if (git(repo, ['status', '--porcelain', '--untracked-files=all', ...selection])) throw new Error(`Uncommitted source / 未提交源码: ${repo}${subdirectory ? '/' + subdirectory : ''}`);
  const commit = git(repo, ['rev-parse', selectedCommit || 'HEAD']);
  // Export only git-tracked files. Never copy .env, .local, dependencies or build output.
  const files = execFileSync('git', ['-C', repo, 'ls-tree', '-rz', '--name-only', commit, ...selection], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  await fs.mkdir(destination, { recursive: false });
  for (const relative of files) {
    if (relative.split('/').some(p => ['.git', '.local', 'node_modules', '.next'].includes(p)) || /(^|\/)\.env($|\.)/.test(relative)) continue;
    const outRelative = subdirectory ? relative.slice(subdirectory.length + 1) : relative;
    if (!outRelative || outRelative.startsWith('../')) continue;
    const target = path.join(destination, outRelative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const bytes = execFileSync('git', ['-C', repo, 'show', `${commit}:${relative}`], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    await fs.writeFile(target, bytes);
  }
  return commit;
}
export async function buildSnapshot(releaseDir, env, { commands } = {}) {
  const cwd = path.join(releaseDir, 'editor');
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const jobs = commands || [
    [process.execPath, [npm, 'ci', '--no-audit', '--no-fund']],
    [process.execPath, [npm, 'run', 'test:interview']],
    [process.execPath, [npm, 'run', 'test:runtime']],
    [process.execPath, [npm, 'run', 'build']],
  ];
  for (const [file, args] of jobs) {
    await fs.appendFile(path.join(releaseDir, 'build.log'), `\n${new Date().toISOString()} ${path.basename(file)} ${args.join(' ')}\n`);
    const commandEnv = { ...process.env, ...env };
    if (args.some(arg => String(arg).startsWith('test:'))) {
      for (const key of Object.keys(commandEnv)) {
        if (key.startsWith('EDITOR_') || /^(DIARY_DATA_PATH|TRAINING_.*PATH|INTERVIEW_.*PATH|LABELS_CONFIG_PATH|ARCHIVE_PATH|SHARE_TOKENS_PATH|STEAM_.*PATH|LEETCODE_REPO)$/.test(key)) delete commandEnv[key];
      }
    }
    await runCommand(file, args, { cwd, env: commandEnv, logFile: path.join(releaseDir, 'build.log') });
    if (args.includes('ci')) {
      // Shared components must resolve React/types from this release, never the
      // mutable development installation at D:/diary/node_modules.
      await fs.symlink(path.join(cwd, 'node_modules'), path.join(releaseDir, 'diary/node_modules'), 'junction');
    }
  }
  return readJson(path.join(releaseDir, 'manifest.json'));
}
export async function prepareRelease({ editorRepo, sharedRepo = 'D:/diary', root = runtimeRoot(), releaseId } = {}) {
  const editorCommit = git(editorRepo, ['rev-parse', 'HEAD']);
  const sharedCommit = git(sharedRepo, ['rev-parse', 'HEAD']);
  releaseId ||= `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${editorCommit.slice(0, 8)}-${sharedCommit.slice(0, 8)}`;
  assertReleaseId(releaseId);
  const releaseDir = releaseDirectory(releaseId, root);
  await fs.mkdir(path.join(root, 'releases'), { recursive: true });
  await fs.mkdir(releaseDir); // refuse to replace a previous attempt or live release
  await snapshotRepository(editorRepo, path.join(releaseDir, 'editor'), undefined, editorCommit);
  await fs.mkdir(path.join(releaseDir, 'diary'));
  await snapshotRepository(sharedRepo, path.join(releaseDir, 'diary/shared'), 'shared', sharedCommit);
  if (git(editorRepo, ['rev-parse', 'HEAD']) !== editorCommit || git(sharedRepo, ['rev-parse', 'HEAD']) !== sharedCommit ||
      git(editorRepo, ['status', '--porcelain', '--untracked-files=all']) || git(sharedRepo, ['status', '--porcelain', '--untracked-files=all', '--', 'shared'])) {
    throw new Error('Source changed during export; retry after changes are committed');
  }
  const lock = await fs.readFile(path.join(releaseDir, 'editor/package-lock.json'));
  const manifest = { releaseId, editorCommit, sharedCommit, nodeVersion: process.version, nextVersion: JSON.parse(lock).packages['node_modules/next'].version, lockHash: createHash('sha256').update(lock).digest('hex'), createdAt: new Date().toISOString(), verified: false };
  await writeJson(path.join(releaseDir, 'manifest.json'), manifest);
  const env = { ...loadProfile('candidate', root), EDITOR_RELEASE_ID: releaseId, NEXT_TELEMETRY_DISABLED: '1' };
  await buildSnapshot(releaseDir, env);
  return { releaseDir, manifest };
}

export async function pruneReleases(root = runtimeRoot()) {
  const state = await readJson(path.join(root, 'state.json'));
  if (!state?.current || state.phase === 'switching') return [];
  const candidates = [];
  for (const id of await fs.readdir(path.join(root, 'releases'))) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id)) continue;
    const directory = releaseDirectory(id, root);
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) continue;
    const manifest = await readJson(path.join(directory, 'manifest.json'));
    if (manifest?.verified === true && manifest.releaseId === id) candidates.push({ id, directory, at: manifest.verifiedAt || '' });
  }
  candidates.sort((a,b) => b.at.localeCompare(a.at));
  const keep = new Set([state.current, state.previous, ...candidates.slice(0,3).map(c => c.id)]);
  const removed = [];
  for (const candidate of candidates) {
    if (keep.has(candidate.id)) continue;
    // Only remove a validated, non-linked direct child of releases. Re-read
    // ownership before every delete in case a local control command changed it.
    const latest = await readJson(path.join(root, 'state.json'));
    if (latest.phase === 'switching' || [latest.current,latest.previous].includes(candidate.id)) continue;
    await fs.rm(candidate.directory, { recursive: true });
    removed.push(candidate.id);
  }
  return removed;
}
