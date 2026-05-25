import {
  NoteEntry,
  OVERALL_NOTE_NAME,
  SetStatus,
  TrainingBlock,
  TrainingDayDoc,
  TrainingSet,
  parseNoteEntryLine,
} from '@/types/training';

const H1_RE = /^#\s+(.+)$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})\b/;
const CHECKBOX_RE = /^(\s*)- \[([ xX/\-])\](.*)$/;
const PLAIN_BULLET_RE = /^(\s*)- (?!\[[ xX/\-]\])(.+)$/;
const NOTES_FIRST_LINE_RE = /^(>\s*笔记[::]\s*)(.*)$/;
const BLOCKQUOTE_CONT_RE = /^>\s?(.*)$/;

function statusFromMark(mark: string): SetStatus {
  if (mark === 'x' || mark === 'X') return 'done';
  if (mark === '/' || mark === '-') return 'compromise';
  return 'pending';
}

function markFromStatus(status: SetStatus): string {
  if (status === 'done') return 'x';
  if (status === 'compromise') return '/';
  return ' ';
}

export function parseTrainingDayDoc(
  content: string,
  filename: string,
): TrainingDayDoc {
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

  const blocks: TrainingBlock[] = [];
  let notesAdded = false;
  let i = blockStart;
  while (i < lines.length) {
    const line = lines[i];

    // 1) Plain bullet header — may have indented set checkboxes below it
    const plainMatch = PLAIN_BULLET_RE.exec(line);
    if (plainMatch && plainMatch[1].length === 0) {
      const indent = plainMatch[1];
      const label = plainMatch[2];
      const sets: TrainingSet[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const setMatch = CHECKBOX_RE.exec(lines[j]);
        if (!setMatch) break;
        const setIndent = setMatch[1];
        if (setIndent.length === 0) break;
        sets.push({
          status: statusFromMark(setMatch[2]),
          indent: setIndent,
          trailing: setMatch[3] ?? '',
        });
        j++;
      }
      if (sets.length > 0) {
        blocks.push({ kind: 'exercise-sets', indent, label, sets });
        i = j;
        continue;
      }
      blocks.push({ kind: 'other', raw: line });
      i++;
      continue;
    }

    // 2) Top-level single-checkbox exercise (legacy)
    const exerciseMatch = CHECKBOX_RE.exec(line);
    if (exerciseMatch && exerciseMatch[1].length === 0) {
      const [, indent, mark, rest] = exerciseMatch;
      const label = rest.replace(/^\s/, '');
      blocks.push({
        kind: 'exercise',
        indent,
        status: statusFromMark(mark),
        trailing: '',
        label,
      });
      i++;
      continue;
    }

    // 3) Orphaned indented checkbox
    if (exerciseMatch && exerciseMatch[1].length > 0) {
      blocks.push({ kind: 'other', raw: line });
      i++;
      continue;
    }

    // 4) Notes block (first only)
    const notesFirstMatch = NOTES_FIRST_LINE_RE.exec(line);
    if (notesFirstMatch && !notesAdded) {
      // Capture the prefix (without trailing first-line text — we model entries instead)
      // Recover the prefix from the original line by stripping anything after "笔记:"
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
      const entries = parseNotesBody(firstLineRest, continuationLines);
      blocks.push({ kind: 'notes', prefix, entries });
      notesAdded = true;
      continue;
    }

    // 5) Anything else preserved verbatim
    blocks.push({ kind: 'other', raw: line });
    i++;
  }

  return { dateStr, filename, heading, preamble, blocks, trailing: '' };
}

/**
 * Parse the body of a notes blockquote into entries.
 * - If sub-bullets matching `- name: note` are found, return them as entries.
 * - Otherwise treat all content as one free-form "overall" note.
 */
function parseNotesBody(
  firstLineRest: string,
  continuationLines: string[],
): NoteEntry[] {
  // Combine all candidate lines (first line + continuations) and look for sub-bullets
  const allLines: string[] = [];
  if (firstLineRest.length > 0) allLines.push(firstLineRest);
  allLines.push(...continuationLines);

  // Trim trailing blank lines
  while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') {
    allLines.pop();
  }

  if (allLines.length === 0) return [];

  // Detect list format: every non-blank line is a `- name: note` bullet
  const candidates = allLines.filter((l) => l.trim() !== '');
  const parsed = candidates.map((l) => parseNoteEntryLine(l));
  const allMatch = parsed.length > 0 && parsed.every((p) => p !== null);
  if (allMatch) {
    return parsed as NoteEntry[];
  }

  // Fallback: legacy single-text note → single overall entry
  return [{ name: OVERALL_NOTE_NAME, note: allLines.join('\n') }];
}

export function serializeTrainingDayDoc(doc: TrainingDayDoc): string {
  const out: string[] = [];
  if (doc.preamble.length > 0) out.push(doc.preamble);
  for (const block of doc.blocks) {
    if (block.kind === 'exercise') {
      const mark = markFromStatus(block.status);
      // Preserve label with space; trailing is appended only when non-empty (compromise detail).
      out.push(
        `${block.indent}- [${mark}] ${block.label}${block.trailing ? ' ' + block.trailing.trimStart() : ''}`,
      );
    } else if (block.kind === 'exercise-sets') {
      out.push(`${block.indent}- ${block.label}`);
      for (const set of block.sets) {
        const mark = markFromStatus(set.status);
        out.push(`${set.indent}- [${mark}]${set.trailing}`);
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
  // Filter out empty entries
  const filled = entries.filter((e) => e.note.trim().length > 0);
  if (filled.length === 0) {
    // Preserve the prefix line as-is (matches existing minimal "> 笔记:" output)
    return [prefix];
  }
  // Single overall note in legacy form: keep on first line for clean output
  if (
    filled.length === 1 &&
    filled[0].name === OVERALL_NOTE_NAME &&
    !filled[0].note.includes('\n')
  ) {
    return [`${prefix.replace(/[::]$/, '')}: ${filled[0].note}`];
  }
  // List form
  const lines: string[] = [prefix];
  for (const e of filled) {
    const noteLines = e.note.split('\n');
    lines.push(`> - ${e.name}: ${noteLines[0]}`);
    for (let k = 1; k < noteLines.length; k++) {
      // Continuation lines of a multi-line note are indented to align with the bullet
      lines.push(`>   ${noteLines[k]}`);
    }
  }
  return lines;
}

/** Ensures the doc has exactly one notes block (immutable). */
export function ensureNotesBlock(doc: TrainingDayDoc): TrainingDayDoc {
  if (doc.blocks.some((b) => b.kind === 'notes')) return doc;
  const blocks = [...doc.blocks];
  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (last.kind === 'other' && last.raw.trim() === '') {
      blocks.pop();
    } else {
      break;
    }
  }
  blocks.push({ kind: 'other', raw: '' });
  blocks.push({ kind: 'notes', prefix: '> 笔记:', entries: [] });
  blocks.push({ kind: 'other', raw: '' });
  return { ...doc, blocks };
}

export function setExerciseStatus(
  doc: TrainingDayDoc,
  blockIdx: number,
  status: SetStatus,
  trailing?: string,
): TrainingDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx) return block;
    if (block.kind !== 'exercise') return block;
    return {
      ...block,
      status,
      trailing: status === 'compromise' ? (trailing ?? block.trailing) : '',
    };
  });
  return { ...doc, blocks };
}

export function setSetStatus(
  doc: TrainingDayDoc,
  blockIdx: number,
  setIdx: number,
  status: SetStatus,
  trailing?: string,
): TrainingDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx) return block;
    if (block.kind !== 'exercise-sets') return block;
    const sets = block.sets.map((s, si) => {
      if (si !== setIdx) return s;
      // For non-compromise statuses, clear trailing detail back to default
      const baseTrailing = ' '; // matches the user's source files which had "- [ ] "
      const next: TrainingSet = {
        ...s,
        status,
        trailing:
          status === 'compromise'
            ? trailing !== undefined
              ? trailing
              : s.trailing
            : baseTrailing,
      };
      return next;
    });
    return { ...block, sets };
  });
  return { ...doc, blocks };
}

/**
 * Set or remove a per-exercise (or overall) note entry. Removing happens when
 * `note` is the empty string — the entry is dropped.
 */
export function setNoteEntry(
  doc: TrainingDayDoc,
  blockIdx: number,
  name: string,
  note: string,
): TrainingDayDoc {
  const blocks = doc.blocks.map((block, bi) => {
    if (bi !== blockIdx) return block;
    if (block.kind !== 'notes') return block;
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

/** Parsed compromise detail extracted from a set's `trailing` text. */
export interface CompromiseDetail {
  reps?: string;       // e.g. "8"
  weight?: string;     // e.g. "10kg"
  note?: string;       // free-form remainder
}

export function parseCompromiseDetail(trailing: string): CompromiseDetail {
  const text = trailing.trim();
  if (!text) return {};
  const detail: CompromiseDetail = {};
  // reps: "<n>" or "<n>次" or "<n> 次"
  const repsMatch = /(?:^|\s|·|-)(\d+)\s*(?:次|reps?)?\b/.exec(text);
  if (repsMatch) detail.reps = repsMatch[1];
  // weight: "@<weight>" or "@ <weight>"
  const weightMatch = /@\s*([\w.]+)/.exec(text);
  if (weightMatch) detail.weight = weightMatch[1];
  // note: text after "·" if any
  const noteMatch = /·\s*(.+)$/.exec(text);
  if (noteMatch) detail.note = noteMatch[1].trim();
  return detail;
}

/** Planned numbers parsed from an exercise label like "哑铃卧推 · 12kg 对 · 4×10-12". */
export interface PlannedSet {
  weightKg?: number;  // numeric, e.g. 12
  weightUnit: string; // "kg" — preserved for serialization
  minReps?: number;
  maxReps?: number;
}

export function parsePlannedSet(label: string): PlannedSet {
  const out: PlannedSet = { weightUnit: 'kg' };
  // weight: first <number>kg occurrence
  const weightMatch = /(\d+(?:\.\d+)?)\s*(kg|KG)/.exec(label);
  if (weightMatch) {
    out.weightKg = parseFloat(weightMatch[1]);
    out.weightUnit = weightMatch[2].toLowerCase();
  }
  // reps: "N×M" or "N×M-K" pattern (full-width × is U+00D7, also accept ASCII x)
  const repsMatch = /[×x]\s*(\d+)(?:\s*-\s*(\d+))?/i.exec(label);
  if (repsMatch) {
    out.minReps = parseInt(repsMatch[1], 10);
    out.maxReps = repsMatch[2] ? parseInt(repsMatch[2], 10) : out.minReps;
  }
  return out;
}

export function buildCompromiseTrailing(detail: CompromiseDetail): string {
  const parts: string[] = [];
  if (detail.reps && detail.reps.trim()) parts.push(`${detail.reps.trim()} 次`);
  if (detail.weight && detail.weight.trim()) parts.push(`@ ${detail.weight.trim()}`);
  const head = parts.join(' ');
  const note = detail.note && detail.note.trim();
  const full = note ? (head ? `${head} · ${note}` : note) : head;
  return full ? ` ${full}` : ' ';
}
