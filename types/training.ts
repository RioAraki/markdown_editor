export interface TrainingDayMeta {
  dateStr: string;   // YYYY-MM-DD (from filename)
  filename: string;
}

export interface TrainingDayListItem extends TrainingDayMeta {
  content: string;
}

export interface TrainingDayListResponse {
  days: TrainingDayListItem[];
}

export interface TrainingDayContentResponse {
  dateStr: string;
  filename: string;
  content: string;
}

export interface SaveTrainingRequest {
  content: string;
}

export type SetStatus = 'pending' | 'done' | 'compromise';

export interface TrainingSet {
  status: SetStatus;       // mutable
  indent: string;          // leading whitespace on the set line, preserved
  trailing: string;        // text after "- [x]" on the line; for compromise, holds the detail string
}

/** Sentinel name used for the overall day-level note. */
export const OVERALL_NOTE_NAME = '总体';

export interface NoteEntry {
  /** Exercise name (matches the leading segment of an exercise label) or OVERALL_NOTE_NAME. */
  name: string;
  note: string;            // mutable; may contain \n
}

export type TrainingBlock =
  | {
      kind: 'exercise';
      indent: string;
      status: SetStatus;   // mutable (legacy single-checkbox exercise)
      trailing: string;    // text after "- [x]" on the line; preserved (or compromise detail)
      label: string;
    }
  | {
      kind: 'exercise-sets';
      indent: string;
      label: string;
      sets: TrainingSet[];
    }
  | {
      kind: 'notes';
      prefix: string;          // e.g. "> 笔记:" or "> 笔记: " — first-line prefix
      entries: NoteEntry[];    // includes overall note (name = OVERALL_NOTE_NAME) and any per-exercise notes
    }
  | {
      kind: 'other';
      raw: string;
    };

export interface TrainingDayDoc {
  dateStr: string;       // YYYY-MM-DD (canonical; matches filename)
  filename: string;      // e.g. "2026-05-25.md"
  heading: string;       // text after "# " on the H1 line, for UI display
  preamble: string;      // raw content before the first block (includes heading line + any blanks)
  blocks: TrainingBlock[];
  trailing: string;      // raw content after the last block
}

/** Parse "- name: note" sub-bullet. Returns null if not matching. */
export function parseNoteEntryLine(line: string): NoteEntry | null {
  // Match `- name: note` (allow leading whitespace, full-width or half-width colon)
  const m = /^\s*-\s+([^:：]+?)\s*[:：]\s*(.*)$/.exec(line);
  if (!m) return null;
  return { name: m[1].trim(), note: m[2] };
}

/**
 * Extract the canonical "name" from an exercise label.
 * Exercise labels look like "哑铃卧推 · 12kg 对 · 4×10-12" — name is the first segment.
 */
export function exerciseName(label: string): string {
  return label.split(/[·•]/, 1)[0].trim();
}
