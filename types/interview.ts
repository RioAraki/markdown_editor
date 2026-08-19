export interface InterviewDayMeta {
  dateStr: string; // YYYY-MM-DD (from filename)
  filename: string;
}

export interface InterviewDayListItem extends InterviewDayMeta {
  content: string;
}

export interface InterviewDayListResponse {
  days: InterviewDayListItem[];
}

export interface InterviewDayContentResponse {
  dateStr: string;
  filename: string;
  content: string;
}

export interface SaveInterviewRequest {
  content: string;
}

/** pending → done → partial (做了但没达标) → pending */
export type UnitStatus = 'pending' | 'done' | 'partial';

export interface TaskUnit {
  status: UnitStatus;
  indent: string; // leading whitespace on the unit line, preserved
  trailing: string; // text after "- [x]"; for partial, holds the detail string
}

/** Sentinel name used for the overall day-level note. */
export const OVERALL_NOTE_NAME = '总体';

export interface NoteEntry {
  name: string; // task name, or OVERALL_NOTE_NAME
  note: string;
}

export type InterviewBlock =
  | {
      kind: 'task';
      indent: string;
      status: UnitStatus;
      trailing: string;
      label: string;
    }
  | {
      kind: 'task-units';
      indent: string;
      label: string;
      units: TaskUnit[];
    }
  | {
      kind: 'notes';
      prefix: string; // e.g. "> 笔记:"
      entries: NoteEntry[];
    }
  | {
      kind: 'other';
      raw: string;
    };

export interface InterviewDayDoc {
  dateStr: string;
  filename: string;
  heading: string;
  preamble: string;
  blocks: InterviewBlock[];
  trailing: string;
  /**
   * Task name → inventory item id, read from the `<!-- items: … -->` marker in
   * the preamble. Read-only here — the marker line itself round-trips verbatim.
   */
  itemsByTask: Record<string, string>;
}

/** Parse "- name: note" sub-bullet. Returns null if not matching. */
export function parseNoteEntryLine(line: string): NoteEntry | null {
  const m = /^\s*-\s+([^:：]+?)\s*[:：]\s*(.*)$/.exec(line);
  if (!m) return null;
  return { name: m[1].trim(), note: m[2] };
}

/**
 * Extract the canonical name from a task label.
 * Labels look like "刷题 · LeetCode 中等 · 3 题" — name is the first segment.
 */
export function taskName(label: string): string {
  return label.split(/[·•]/, 1)[0].trim();
}

// --- Plan-side shapes used by the "今天做什么" picker -----------------------

export interface PlanTaskLite {
  name: string;
  track: string;
  units: number;
  target?: string;
  minutes?: number;
  note?: string;
  /** Inventory module ids this slot draws from; [] means no item binding. */
  pool?: string[];
  /** Direct link for this slot (题库站 / LeetCode). */
  url?: string;
}

export interface PlanDayLite {
  id?: string;
  type: string;
  title: string;
  focus?: string;
  notes?: string;
  tasks?: PlanTaskLite[];
}

/** An inventory item auto-picked for one of today's task slots. */
export interface SuggestedItem {
  id: string;
  title: string;
  domainLabel: string;
  moduleLabel: string;
  touches: number;
  how?: string;
  test?: string;
}

/** A pickable inventory item, for swapping the suggestion manually. */
export interface ItemChoiceLite {
  id: string;
  title: string;
  domainId: string;
  moduleId: string;
  moduleLabel: string;
  touches: number;
  mastered: boolean;
}

export interface DomainLite {
  id: string;
  emoji: string;
  label: string;
  track: string;
  rolling?: boolean;
}

/** A concrete LeetCode problem picked for one checkbox of a 刷题 slot. */
export interface SuggestedProblem {
  id: number;
  title: string;
  url: string;
  difficulty: string;
  kind: 'review' | 'new';
  /** Why this one, e.g. 「复习 · 6 个月前做过（当时磕磕绊绊）· 已逾期 174 天」. */
  reason: string;
}

export interface TodayPlanResponse {
  today: string;
  /** Task name → the problems recommended for its checkboxes, in order. */
  suggestedProblems: Record<string, SuggestedProblem[]>;
  /** Prescription resolved from phase × weekday (or a date override). */
  suggestion?: PlanDayLite;
  /** All templates, so the user can override the suggestion. */
  templates: PlanDayLite[];
  week?: { n: number; theme: string; phase: string };
  trackTypes: Record<string, { emoji: string; label: string }>;
  /** Task name → auto-picked inventory item. */
  suggestedItems: Record<string, SuggestedItem>;
  domains: DomainLite[];
  /** Everything pickable, so a slot can be swapped without another round-trip. */
  choices: ItemChoiceLite[];
}

/** What the client sends when creating a day with its chosen items. */
export interface CreateDayRequest {
  templateId?: string;
  /** Task name → inventory item id. */
  items?: Record<string, string>;
  /** Task name → ordered LeetCode problem ids, one per checkbox. */
  problems?: Record<string, number[]>;
}

export interface MasteryEntryLite {
  status: 'mastered';
  at: string;
  note?: string;
}
