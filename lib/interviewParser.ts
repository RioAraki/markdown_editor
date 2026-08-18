import {
  InterviewBlock,
  InterviewDayDoc,
  NoteEntry,
  OVERALL_NOTE_NAME,
  TaskUnit,
  UnitStatus,
  parseNoteEntryLine,
} from '@/types/interview';

const H1_RE = /^#\s+(.+)$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})\b/;
const CHECKBOX_RE = /^(\s*)- \[([ xX/\-])\](.*)$/;
const PLAIN_BULLET_RE = /^(\s*)- (?!\[[ xX/\-]\])(.+)$/;
const NOTES_FIRST_LINE_RE = /^(>\s*笔记[::]\s*)(.*)$/;
const BLOCKQUOTE_CONT_RE = /^>\s?(.*)$/;

function statusFromMark(mark: string): UnitStatus {
  if (mark === 'x' || mark === 'X') return 'done';
  if (mark === '/' || mark === '-') return 'partial';
  return 'pending';
}

function markFromStatus(status: UnitStatus): string {
  if (status === 'done') return 'x';
  if (status === 'partial') return '/';
  return ' ';
}

export function parseInterviewDayDoc(
  content: string,
  filename: string,
): InterviewDayDoc {
  const lines = content.split('\n');

  let headingIdx = -1;
  let heading = filename.replace(/\.md$/, '');
  let dateStr = filename.replace(/\.md$/, '');
  for (let i = 0; i < lines.length; i++) {
    const m = H1_RE.exec(lines[i]);
    if (m) {
      headingIdx = i;
      heading = m[1];
      const dateMatch = DATE_PREFIX_RE.exec(heading);
      if (dateMatch) dateStr = dateMatch[1];
      break;
    }
  }

  let blockStart = headingIdx >= 0 ? headingIdx + 1 : 0;
  while (blockStart < lines.length && lines[blockStart].trim() === '') {
    blockStart++;
  }
  const preamble = lines.slice(0, blockStart).join('\n');

  const blocks: InterviewBlock[] = [];
  let notesAdded = false;
  let i = blockStart;
  while (i < lines.length) {
    const line = lines[i];

    // 1) Plain bullet header with indented unit checkboxes below it
    const plainMatch = PLAIN_BULLET_RE.exec(line);
    if (plainMatch && plainMatch[1].length === 0) {
      const indent = plainMatch[1];
      const label = plainMatch[2];
      const units: TaskUnit[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const unitMatch = CHECKBOX_RE.exec(lines[j]);
        if (!unitMatch) break;
        if (unitMatch[1].length === 0) break;
        units.push({
          status: statusFromMark(unitMatch[2]),
          indent: unitMatch[1],
          trailing: unitMatch[3] ?? '',
        });
        j++;
      }
      if (units.length > 0) {
        blocks.push({ kind: 'task-units', indent, label, units });
        i = j;
        continue;
      }
      blocks.push({ kind: 'other', raw: line });
      i++;
      continue;
    }

    // 2) Top-level single-checkbox task
    const taskMatch = CHECKBOX_RE.exec(line);
    if (taskMatch && taskMatch[1].length === 0) {
      const [, indent, mark, rest] = taskMatch;
      blocks.push({
        kind: 'task',
        indent,
        status: statusFromMark(mark),
        trailing: '',
        label: rest.replace(/^\s/, ''),
      });
      i++;
      continue;
    }

    // 3) Orphaned indented checkbox
    if (taskMatch && taskMatch[1].length > 0) {
      blocks.push({ kind: 'other', raw: line });
      i++;
      continue;
    }

    // 4) Notes block (first only)
    const notesFirstMatch = NOTES_FIRST_LINE_RE.exec(line);
    if (notesFirstMatch && !notesAdded) {
      const prefixOnlyMatch = /^(>\s*笔记[::])/.exec(line);
      const prefix = prefixOnlyMatch ? prefixOnlyMatch[1] : '> 笔记:';
      const firstLineRest = notesFirstMatch[2];
      const continuationLines: string[] = [];
      i++;
      while (i < lines.length) {
        const cont = BLOCKQUOTE_CONT_RE.exec(lines[i]);
        if (!cont) break;
        continuationLines.push(cont[1]);
        i++;
      }
      blocks.push({
        kind: 'notes',
        prefix,
        entries: parseNotesBody(firstLineRest, continuationLines),
      });
      notesAdded = true;
      continue;
    }

    // 5) Anything else preserved verbatim
    blocks.push({ kind: 'other', raw: line });
    i++;
  }

  return {
    dateStr,
    filename,
    heading,
    preamble,
    blocks,
    trailing: '',
    itemsByTask: parseItemBinding(content),
  };
}

const BIND_RE = /<!--\s*items:\s*([^>]*?)\s*-->/i;

/** Read the `<!-- items: 任务名=item-id; … -->` marker. */
export function parseItemBinding(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = BIND_RE.exec(content);
  if (!m) return out;
  for (const pair of m[1].split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const task = pair.slice(0, eq).trim();
    const id = pair.slice(eq + 1).trim();
    if (task && id) out[task] = id;
  }
  return out;
}

function parseNotesBody(
  firstLineRest: string,
  continuationLines: string[],
): NoteEntry[] {
  const allLines: string[] = [];
  if (firstLineRest.length > 0) allLines.push(firstLineRest);
  allLines.push(...continuationLines);

  while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') {
    allLines.pop();
  }
  if (allLines.length === 0) return [];

  const candidates = allLines.filter((l) => l.trim() !== '');
  const parsed = candidates.map((l) => parseNoteEntryLine(l));
  if (parsed.length > 0 && parsed.every((p) => p !== null)) {
    return parsed as NoteEntry[];
  }
  return [{ name: OVERALL_NOTE_NAME, note: allLines.join('\n') }];
}

export function serializeInterviewDayDoc(doc: InterviewDayDoc): string {
  const out: string[] = [];
  if (doc.preamble.length > 0) out.push(doc.preamble);
  for (const block of doc.blocks) {
    if (block.kind === 'task') {
      const mark = markFromStatus(block.status);
      out.push(
        `${block.indent}- [${mark}] ${block.label}${
          block.trailing ? ' ' + block.trailing.trimStart() : ''
        }`,
      );
    } else if (block.kind === 'task-units') {
      out.push(`${block.indent}- ${block.label}`);
      for (const unit of block.units) {
        out.push(`${unit.indent}- [${markFromStatus(unit.status)}]${unit.trailing}`);
      }
    } else if (block.kind === 'notes') {
      out.push(...serializeNotesBlock(block.prefix, block.entries));
    } else {
      out.push(block.raw);
    }
  }
  if (doc.trailing.length > 0) out.push(doc.trailing);
  return out.join('\n');
}

function serializeNotesBlock(prefix: string, entries: NoteEntry[]): string[] {
  const filled = entries.filter((e) => e.note.trim().length > 0);
  if (filled.length === 0) return [prefix];
  if (
    filled.length === 1 &&
    filled[0].name === OVERALL_NOTE_NAME &&
    !filled[0].note.includes('\n')
  ) {
    return [`${prefix.replace(/[::]$/, '')}: ${filled[0].note}`];
  }
  const lines: string[] = [prefix];
  for (const e of filled) {
    const noteLines = e.note.split('\n');
    lines.push(`> - ${e.name}: ${noteLines[0]}`);
    for (let k = 1; k < noteLines.length; k++) {
      lines.push(`>   ${noteLines[k]}`);
    }
  }
  return lines;
}

/** Ensures the doc has exactly one notes block (immutable). */
export function ensureNotesBlock(doc: InterviewDayDoc): InterviewDayDoc {
  if (doc.blocks.some((b) => b.kind === 'notes')) return doc;
  const blocks = [...doc.blocks];
  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (last.kind === 'other' && last.raw.trim() === '') blocks.pop();
    else break;
  }
  blocks.push({ kind: 'other', raw: '' });
  blocks.push({ kind: 'notes', prefix: '> 笔记:', entries: [] });
  blocks.push({ kind: 'other', raw: '' });
  return { ...doc, blocks };
}

export function setTaskStatus(
  doc: InterviewDayDoc,
  blockIdx: number,
  status: UnitStatus,
  trailing?: string,
): InterviewDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx || block.kind !== 'task') return block;
    return {
      ...block,
      status,
      trailing: status === 'partial' ? (trailing ?? block.trailing) : '',
    };
  });
  return { ...doc, blocks };
}

export function setUnitStatus(
  doc: InterviewDayDoc,
  blockIdx: number,
  unitIdx: number,
  status: UnitStatus,
  trailing?: string,
): InterviewDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx || block.kind !== 'task-units') return block;
    const units = block.units.map((u, ui) => {
      if (ui !== unitIdx) return u;
      return {
        ...u,
        status,
        trailing:
          status === 'partial'
            ? trailing !== undefined
              ? trailing
              : u.trailing
            : ' ',
      };
    });
    return { ...block, units };
  });
  return { ...doc, blocks };
}

export function setNoteEntry(
  doc: InterviewDayDoc,
  blockIdx: number,
  name: string,
  note: string,
): InterviewDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx || block.kind !== 'notes') return block;
    const existingIdx = block.entries.findIndex((e) => e.name === name);
    const nextEntries = [...block.entries];
    if (note.length === 0) {
      if (existingIdx >= 0) nextEntries.splice(existingIdx, 1);
    } else if (existingIdx >= 0) {
      nextEntries[existingIdx] = { name, note };
    } else {
      nextEntries.push({ name, note });
    }
    return { ...block, entries: nextEntries };
  });
  return { ...doc, blocks };
}

/** Detail recorded when a unit is marked "partial" (做了但没达标). */
export interface PartialDetail {
  /** Free-form "actually did" amount, e.g. "2 题" / "30 min". */
  actual?: string;
  note?: string;
}

export function parsePartialDetail(trailing: string): PartialDetail {
  const text = trailing.trim();
  if (!text) return {};
  const noteMatch = /·\s*(.+)$/.exec(text);
  const note = noteMatch ? noteMatch[1].trim() : undefined;
  const actual = noteMatch ? text.slice(0, noteMatch.index).trim() : text;
  return { actual: actual || undefined, note };
}

export function buildPartialTrailing(detail: PartialDetail): string {
  const actual = detail.actual?.trim();
  const note = detail.note?.trim();
  const full = note ? (actual ? `${actual} · ${note}` : note) : (actual ?? '');
  return full ? ` ${full}` : ' ';
}

/** Planned target parsed from a task label like "刷题 · LeetCode · 3 题". */
export function parsePlannedTarget(label: string): string | undefined {
  const parts = label.split(/[·•]/).map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] : undefined;
}
