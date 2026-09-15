import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dataSources, runtimeRoot, writeJson, loadProfile, isWithin } from './config.mjs';

const excluded = new Set(['.git', 'node_modules', '.next', '.venv', '__pycache__', '.lavish']);
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function copyVerified(source, destination) {
  if (await fs.lstat(destination).catch(() => null)) throw new Error(`Refusing overwrite: destination exists ${destination}`);
  const results = [];
  async function copy(from, to) {
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) throw new Error(`Refusing linked data source: ${from}`);
    if (stat.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
      for (const entry of await fs.readdir(from)) {
        if (!excluded.has(entry)) await copy(path.join(from, entry), path.join(to, entry));
      }
    } else if (stat.isFile()) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      const before = await hashFile(from);
      await fs.copyFile(from, to, 1);
      const after = await hashFile(to);
      if (before !== after) throw new Error(`Source changed during backup: ${from}`);
      results.push({ path: path.relative(destination, to), sha256: after, bytes: stat.size });
    }
  }
  await copy(source, destination);
  return results;
}
function copyGroups(sources) {
  const groups = [];
  const bindings = {};
  const add = (source, relative) => { if (source) groups.push({ source, relative }); };
  add(sources.DIARY_DATA_PATH, 'diary/data/diary');
  if (sources.DIARY_DATA_PATH) bindings.DIARY_DATA_PATH = 'diary/data/diary';
  if (sources.TRAINING_LOG_PATH) add(path.dirname(sources.TRAINING_LOG_PATH), 'diary/data/training');
  if (sources.INTERVIEW_LOG_PATH) add(path.dirname(sources.INTERVIEW_LOG_PATH), 'diary/data/interview');
  if (sources.TRAINING_LOG_PATH) bindings.TRAINING_LOG_PATH = path.join('diary/data/training', path.basename(sources.TRAINING_LOG_PATH));
  if (sources.INTERVIEW_LOG_PATH) bindings.INTERVIEW_LOG_PATH = path.join('diary/data/interview', path.basename(sources.INTERVIEW_LOG_PATH));
  const singles = {
    TRAINING_PLAN_PATH: 'diary/data/training/plan.json', INTERVIEW_PLAN_PATH: 'diary/data/interview/plan.json',
    INTERVIEW_INVENTORY_PATH: 'diary/data/interview/inventory.json', INTERVIEW_MASTERY_PATH: 'diary/data/interview/mastery.json',
    INTERVIEW_RECORDINGS_PATH: 'editor/recordings', LABELS_CONFIG_PATH: 'editor/labels.json', ARCHIVE_PATH: 'diary/data/archive',
    SHARE_TOKENS_PATH: 'diary/data/share-tokens.json', STEAM_EXPORT_PATH: 'diary/data/steam_export', STEAM_IMG_PATH: 'diary/steam_img', LEETCODE_REPO: 'leetcode',
  };
  for (const [key, relative] of Object.entries(singles)) {
    const source = sources[key];
    if (!source) continue;
    const parent = groups.find(g => isWithin(g.source, source));
    if (parent) {
      bindings[key] = path.join(parent.relative, path.relative(parent.source, source));
    } else {
      const overlaps = groups.some(g => isWithin(g.relative, relative) || isWithin(relative, g.relative));
      bindings[key] = overlaps ? path.join('overrides', key, path.basename(source)) : relative;
      add(source, bindings[key]);
    }
  }
  return { groups, bindings };
}
export async function backupData(root = runtimeRoot(), sources = dataSources(loadProfile('production', root))) {
  const destination = path.join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(destination, { recursive: true });
  const entries = [];
  for (const { source, relative } of copyGroups(sources).groups) {
    const exists = await fs.lstat(source).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    entries.push(exists ? { source, relative, files: await copyVerified(source, path.join(destination, relative)) } : { source, relative, missing: true });
  }
  // Draining our server prevents its writes. Recheck all sources as well so a
  // separate editor changing files during this copy aborts the deployment.
  for (const entry of entries) {
    if (entry.missing) {
      if (await fs.stat(entry.source).catch(() => null)) throw new Error(`Source appeared during backup: ${entry.source}`);
      continue;
    }
    const latest = [];
    async function inspect(file) {
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw new Error(`Source became a link during backup: ${file}`);
      if (stat.isDirectory()) {
        for (const name of await fs.readdir(file)) if (!excluded.has(name)) await inspect(path.join(file, name));
      } else latest.push({ path: path.relative(entry.source, file), sha256: await hashFile(file), bytes: stat.size });
    }
    await inspect(entry.source);
    const canonical = files => JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path)));
    if (canonical(latest) !== canonical(entry.files)) throw new Error(`Source changed during backup: ${entry.source}`);
  }
  await writeJson(path.join(destination, 'manifest.json'), { createdAt: new Date().toISOString(), entries });
  return destination;
}
export async function initializeSandbox(profile, root = runtimeRoot(), sources = dataSources(loadProfile('production', root))) {
  if (!['development', 'candidate'].includes(profile)) throw new Error('Sandbox profile required');
  const target = path.join(root, profile === 'development' ? 'dev-data' : 'candidate-data');
  await fs.mkdir(target); // deliberately fail if a user already edited a previous copy
  const manifest = [];
  const { groups, bindings } = copyGroups(sources);
  for (const { source, relative } of groups) {
    if (await fs.stat(source).catch(e => { if (e.code === 'ENOENT') return null; throw e; })) {
      manifest.push({ source, relative, files: await copyVerified(source, path.join(target, relative)) });
    }
  }
  for (const dir of ['diary/data/diary', 'diary/data/training/log', 'diary/data/interview/log', 'diary/data/archive', 'diary/data/steam_export', 'diary/steam_img', 'editor/recordings', 'leetcode']) await fs.mkdir(path.join(target, dir), { recursive: true });
  const env = {
    ...dataSources({
      DIARY_DATA_PATH: path.join(target, 'diary/data/diary'), TRAINING_LOG_PATH: path.join(target, 'diary/data/training/log'),
      INTERVIEW_LOG_PATH: path.join(target, 'diary/data/interview/log'), INTERVIEW_RECORDINGS_PATH: path.join(target, 'editor/recordings'),
      LABELS_CONFIG_PATH: path.join(target, 'editor/labels.json'), ARCHIVE_PATH: path.join(target, 'diary/data/archive'),
      SHARE_TOKENS_PATH: path.join(target, 'diary/data/share-tokens.json'), STEAM_EXPORT_PATH: path.join(target, 'diary/data/steam_export'),
      STEAM_IMG_PATH: path.join(target, 'diary/steam_img'), LEETCODE_REPO: path.join(target, 'leetcode'),
    }),
    EDITOR_PROFILE: profile, EDITOR_DATA_ROOT: target, EDITOR_ALLOW_EXTERNAL_WRITES: 'false', NEXT_TELEMETRY_DISABLED: '1',
  };
  for (const [key, relative] of Object.entries(bindings)) env[key] = path.join(target, relative);
  await writeJson(path.join(target, 'copy-manifest.json'), manifest);
  await writeJson(path.join(root, 'config', `${profile}.env`), env);
  return env;
}
