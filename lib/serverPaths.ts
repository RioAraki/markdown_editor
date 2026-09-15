import fs from 'fs';
import path from 'path';

type Environment = Record<string, string | undefined>;

// Resolve through the nearest existing ancestor, including junctions, even when
// a new file's parent directories have not been created yet.
function physicalPath(target: string): string {
  try { return fs.realpathSync(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // realpath fails for dangling links: still resolve their actual destination.
    try {
      if (fs.lstatSync(target).isSymbolicLink()) {
        return physicalPath(path.resolve(path.dirname(target), fs.readlinkSync(target)));
      }
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
    }
    const parent = path.dirname(target);
    if (parent === target) return target;
    return path.join(physicalPath(parent), path.basename(target));
  }
}

const productionDefaults = ['D:/diary/data', 'D:/markdown_editor/.local/interview-recordings',
  'D:/markdown_editor/config/labels.json', 'D:/diary/steam_img', 'D:/github/leetcode2020'];

function sandboxRoot(env: Environment): { absolute: string; physical: string } | undefined {
  const profile = env.EDITOR_PROFILE;
  if (profile && !['production', 'development', 'candidate'].includes(profile)) throw new Error('Unknown EDITOR_PROFILE');
  if (profile !== 'development' && profile !== 'candidate') return undefined;
  if (!env.EDITOR_DATA_ROOT || !path.isAbsolute(env.EDITOR_DATA_ROOT)) {
    throw new Error('EDITOR_DATA_ROOT must be an absolute sandbox path');
  }
  const root = { absolute: path.resolve(env.EDITOR_DATA_ROOT), physical: physicalPath(path.resolve(env.EDITOR_DATA_ROOT)) };
  const extra: unknown = env.EDITOR_PRODUCTION_PATHS ? JSON.parse(env.EDITOR_PRODUCTION_PATHS) : [];
  if (!Array.isArray(extra) || extra.some(p => typeof p !== 'string' || !path.isAbsolute(p))) {
    throw new Error('EDITOR_PRODUCTION_PATHS must be a JSON array of absolute paths');
  }
  for (const source of [...productionDefaults, ...extra as string[]]) {
    const production = physicalPath(path.resolve(source));
    if (contains(production, root.physical) || contains(root.physical, production)) {
      throw new Error('EDITOR_DATA_ROOT overlaps a production path');
    }
  }
  return root;
}

export function assertSandboxPath(target: string, env: Environment = process.env): void {
  const root = sandboxRoot(env);
  if (!root) return;
  const absolute = path.resolve(target);
  if (!contains(root.absolute, absolute) || !contains(root.physical, physicalPath(absolute))) {
    throw new Error('Target is outside EDITOR_DATA_ROOT sandbox');
  }
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function resolveServerPaths(env: Environment = process.env, cwd = process.cwd()) {
  const profile = env.EDITOR_PROFILE;
  if (profile && !['production', 'development', 'candidate'].includes(profile)) {
    throw new Error(`Unknown EDITOR_PROFILE: ${profile}`);
  }
  const isolated = profile === 'development' || profile === 'candidate';
  const root = env.EDITOR_DATA_ROOT;
  if (isolated && (!root || !path.isAbsolute(root))) {
    throw new Error('EDITOR_DATA_ROOT must be an absolute sandbox path');
  }
  const base = isolated ? root! : 'D:/diary/data';
  const get = (key: string, fallback: string) => path.resolve(cwd, env[key] || fallback);
  const interviewLog = get('INTERVIEW_LOG_PATH', path.join(base, 'interview/log'));
  const trainingLog = get('TRAINING_LOG_PATH', path.join(base, 'training/log'));
  const interviewData = path.dirname(interviewLog);
  const paths = {
    diary: get('DIARY_DATA_PATH', path.join(base, 'diary')),
    trainingLog,
    trainingPlan: get('TRAINING_PLAN_PATH', path.join(path.dirname(trainingLog), 'plan.json')),
    interviewLog,
    interviewData,
    interviewPlan: get('INTERVIEW_PLAN_PATH', path.join(interviewData, 'plan.json')),
    inventory: get('INTERVIEW_INVENTORY_PATH', path.join(interviewData, 'inventory.json')),
    mastery: get('INTERVIEW_MASTERY_PATH', path.join(interviewData, 'mastery.json')),
    recordings: get('INTERVIEW_RECORDINGS_PATH', isolated ? path.join(base, 'interview-recordings')
      : profile === 'production' ? 'D:/markdown_editor/.local/interview-recordings' : path.join(cwd, '.local/interview-recordings')),
    labels: get('LABELS_CONFIG_PATH', isolated ? path.join(base, 'config/labels.json')
      : profile === 'production' ? 'D:/markdown_editor/config/labels.json' : path.join(cwd, 'config/labels.json')),
    steamExport: get('STEAM_EXPORT_PATH', path.join(base, 'steam_export')),
    steamImages: get('STEAM_IMG_PATH', isolated ? path.join(base, 'steam_img') : 'D:/diary/steam_img'),
    archive: get('ARCHIVE_PATH', path.join(base, 'archive')),
    shareTokens: get('SHARE_TOKENS_PATH', path.join(base, 'share-tokens.json')),
    leetcodeRepo: get('LEETCODE_REPO', isolated ? path.join(base, 'leetcode2020') : 'D:/github/leetcode2020'),
  };
  if (isolated) {
    const checkedRoot = sandboxRoot(env)!;
    for (const [name, target] of Object.entries(paths)) {
      if (!contains(checkedRoot.absolute, target) || !contains(checkedRoot.physical, physicalPath(target))) {
        throw new Error(`${name} is outside EDITOR_DATA_ROOT sandbox`);
      }
    }
  }
  return paths;
}

export function allowExternalWrites(env: Environment = process.env): boolean {
  if (env.EDITOR_ALLOW_EXTERNAL_WRITES === 'false') return false;
  if (env.EDITOR_PROFILE === 'development' || env.EDITOR_PROFILE === 'candidate') {
    return env.EDITOR_ALLOW_EXTERNAL_WRITES === 'true';
  }
  return true;
}
