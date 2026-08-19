import fs from 'fs/promises';
import path from 'path';

/**
 * Server-side access to the preparation inventory (what there is to prepare)
 * and the mastery store (what has been confirmed learned).
 *
 * The inventory lives in the diary repo next to plan.json; mastery.json lives
 * beside it and is the one file this editor owns and writes.
 */

const INTERVIEW_LOG_PATH =
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log';
const DATA_DIR = path.dirname(INTERVIEW_LOG_PATH);
const INVENTORY_PATH =
  process.env.INTERVIEW_INVENTORY_PATH || path.join(DATA_DIR, 'inventory.json');
const MASTERY_PATH =
  process.env.INTERVIEW_MASTERY_PATH || path.join(DATA_DIR, 'mastery.json');

export interface InvItem {
  id: string;
  title: string;
  how?: string;
  test?: string;
}
export interface InvModule {
  id: string;
  label: string;
  items: InvItem[];
}
export interface InvDomain {
  id: string;
  emoji: string;
  label: string;
  track: string;
  why?: string;
  rolling?: boolean;
  modules: InvModule[];
}
export interface Inventory {
  domains: InvDomain[];
}

export interface MasteryEntry {
  status: 'mastered';
  at: string;
  note?: string;
}
export type MasteryStore = Record<string, MasteryEntry>;

export async function loadInventory(): Promise<Inventory> {
  try {
    return JSON.parse(await fs.readFile(INVENTORY_PATH, 'utf-8')) as Inventory;
  } catch {
    return { domains: [] };
  }
}

export async function loadMastery(): Promise<MasteryStore> {
  try {
    return JSON.parse(await fs.readFile(MASTERY_PATH, 'utf-8')) as MasteryStore;
  } catch {
    return {};
  }
}

export async function saveMastery(store: MasteryStore): Promise<void> {
  await fs.mkdir(path.dirname(MASTERY_PATH), { recursive: true });
  await fs.writeFile(
    MASTERY_PATH,
    JSON.stringify(store, null, 2) + '\n',
    'utf-8',
  );
}

const DAY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const BIND_RE = /<!--\s*items:\s*([^>]*?)\s*-->/i;

/**
 * How many times each inventory item has been worked on, derived from the
 * `<!-- items: 任务名=item-id -->` markers across all day logs.
 */
export async function computeTouchCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let files: string[] = [];
  try {
    files = await fs.readdir(INTERVIEW_LOG_PATH);
  } catch {
    return counts;
  }
  for (const f of files) {
    if (!DAY_FILENAME_RE.test(f)) continue;
    let content = '';
    try {
      content = await fs.readFile(path.join(INTERVIEW_LOG_PATH, f), 'utf-8');
    } catch {
      continue;
    }
    const m = BIND_RE.exec(content);
    if (!m) continue;
    for (const pair of m[1].split(';')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const id = pair.slice(eq + 1).trim();
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

export interface ItemChoice extends InvItem {
  domainId: string;
  domainLabel: string;
  moduleId: string;
  moduleLabel: string;
  touches: number;
  mastered: boolean;
}

/** Flatten the inventory into pickable choices, annotated with progress. */
export function flattenInventory(
  inventory: Inventory,
  touches: Record<string, number>,
  mastery: MasteryStore,
): ItemChoice[] {
  const out: ItemChoice[] = [];
  for (const d of inventory.domains) {
    for (const m of d.modules) {
      for (const it of m.items) {
        out.push({
          ...it,
          domainId: d.id,
          domainLabel: d.label,
          moduleId: m.id,
          moduleLabel: m.label,
          touches: touches[it.id] ?? 0,
          mastered: !!mastery[it.id],
        });
      }
    }
  }
  return out;
}

/**
 * Suggest the next item to work on for a task slot.
 *
 * `pool` narrows the candidates to specific inventory modules — without it a
 * day with two slots on the same track (e.g. 「Agent 题库」and「Agent 框架」)
 * would draw both from the same undifferentiated domain. An empty `pool` means
 * the slot deliberately has no inventory item (mocks, reviews, market work).
 *
 * Order: never-touched first (in inventory order), then least-touched.
 * Mastered items are never suggested. `exclude` keeps one day from suggesting
 * the same item twice.
 */
export function suggestForTrack(
  choices: ItemChoice[],
  inventory: Inventory,
  track: string,
  exclude: Set<string>,
  pool?: string[],
): ItemChoice | undefined {
  if (pool && pool.length === 0) return undefined;

  const domainIds = new Set(
    inventory.domains.filter((d) => d.track === track).map((d) => d.id),
  );
  const modules = pool ? new Set(pool) : undefined;

  const candidates = choices.filter(
    (c) =>
      domainIds.has(c.domainId) &&
      (!modules || modules.has(c.moduleId)) &&
      !c.mastered &&
      !exclude.has(c.id),
  );
  if (candidates.length === 0) return undefined;
  const untouched = candidates.find((c) => c.touches === 0);
  if (untouched) return untouched;
  return [...candidates].sort((a, b) => a.touches - b.touches)[0];
}
