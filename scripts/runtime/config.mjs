import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

export const runtimeRoot = () => path.resolve(process.env.EDITOR_RUNTIME_ROOT || 'D:/markdown_editor_runtime');
export function assertReleaseId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id)) throw new Error('Invalid release id');
  return id;
}
export const releaseDirectory = (id, root = runtimeRoot()) => path.resolve(root, 'releases', assertReleaseId(id));
function physicalPath(file) {
  try { return fs.realpathSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    return parent === file ? file : path.join(physicalPath(parent), path.basename(file));
  }
}
function readProfile(profile, root) {
  const text = fs.readFileSync(path.join(root, 'config', `${profile}.env`), 'utf8').replace(/^\uFEFF/, '');
  return text.trimStart().startsWith('{') ? JSON.parse(text) : parseEnv(text);
}
export function loadProfile(profile, root = runtimeRoot()) {
  if (!['production', 'development', 'candidate'].includes(profile)) throw new Error('Unknown profile');
  const values = readProfile(profile, root);
  if (values.EDITOR_PROFILE !== profile) throw new Error('Profile identity mismatch');
  if (profile !== 'production' && !values.EDITOR_DATA_ROOT) throw new Error('Sandbox profile missing data root');
  if (profile !== 'production') {
    const production = { ...process.env, ...readProfile('production', root) };
    const resolved = dataSources(production);
    const sources = [...Object.values(resolved), path.dirname(resolved.TRAINING_LOG_PATH), path.dirname(resolved.INTERVIEW_LOG_PATH)];
    if (!path.isAbsolute(values.EDITOR_DATA_ROOT)) throw new Error('Sandbox root must be absolute');
    const sandbox = physicalPath(path.resolve(values.EDITOR_DATA_ROOT));
    for (const source of sources) {
      const realSource = physicalPath(path.resolve(source));
      if (isWithin(sandbox, realSource) || isWithin(realSource, sandbox)) throw new Error('Sandbox overlaps production data');
    }
    values.EDITOR_PRODUCTION_PATHS = JSON.stringify(sources);
  }
  return { ...process.env, ...values, EDITOR_RUNTIME_ROOT: root };
}
export async function readJson(file, fallback = null) {
  try { return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await fsp.rename(temp, file);
  } finally { await fsp.rm(temp, { force: true }); }
}
export function isWithin(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

// A shared manifest of data sources drives backup and sandbox initialization.
export function dataSources(env = {}) {
  const diary = env.DIARY_DATA_PATH || 'D:/diary/data/diary';
  const training = env.TRAINING_LOG_PATH || 'D:/diary/data/training/log';
  const interview = env.INTERVIEW_LOG_PATH || 'D:/diary/data/interview/log';
  return {
    DIARY_DATA_PATH: diary,
    TRAINING_LOG_PATH: training,
    TRAINING_PLAN_PATH: env.TRAINING_PLAN_PATH || path.join(path.dirname(training), 'plan.json'),
    INTERVIEW_LOG_PATH: interview,
    INTERVIEW_PLAN_PATH: env.INTERVIEW_PLAN_PATH || path.join(path.dirname(interview), 'plan.json'),
    INTERVIEW_INVENTORY_PATH: env.INTERVIEW_INVENTORY_PATH || path.join(path.dirname(interview), 'inventory.json'),
    INTERVIEW_MASTERY_PATH: env.INTERVIEW_MASTERY_PATH || path.join(path.dirname(interview), 'mastery.json'),
    INTERVIEW_RECORDINGS_PATH: env.INTERVIEW_RECORDINGS_PATH || 'D:/markdown_editor/.local/interview-recordings',
    LABELS_CONFIG_PATH: env.LABELS_CONFIG_PATH || 'D:/markdown_editor/config/labels.json',
    ARCHIVE_PATH: env.ARCHIVE_PATH || 'D:/diary/data/archive',
    SHARE_TOKENS_PATH: env.SHARE_TOKENS_PATH || 'D:/diary/data/share-tokens.json',
    STEAM_EXPORT_PATH: env.STEAM_EXPORT_PATH || 'D:/diary/data/steam_export',
    STEAM_IMG_PATH: env.STEAM_IMG_PATH || 'D:/diary/steam_img',
    LEETCODE_REPO: env.LEETCODE_REPO || 'D:/github/leetcode2020',
  };
}
