import fs from 'fs/promises';
import path from 'path';
import { PlanDayLite, PlanTaskLite } from '@/types/interview';

/**
 * Server-side access to the diary app's interview plan.
 *
 * The plan (phases, weeks, day templates, phase × weekday schedule) lives in
 * the diary repo so the read-only renderer owns it; this editor only reads it
 * to scaffold a day's log file and to tell the user what today is supposed to
 * look like.
 */

const INTERVIEW_LOG_PATH =
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log';
const PLAN_PATH =
  process.env.INTERVIEW_PLAN_PATH ||
  path.join(path.dirname(INTERVIEW_LOG_PATH), 'plan.json');

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface RawWeek {
  n: number;
  start: string;
  end: string;
  phase: string;
  theme: string;
  goals?: string[];
  milestone?: string;
}

interface RawPlan {
  meta?: { startDate?: string; endDate?: string; weeks?: number };
  trackTypes?: Record<string, { emoji: string; label: string }>;
  weeks?: RawWeek[];
  templates?: (PlanDayLite & { id: string })[];
  schedule?: Record<string, Record<string, string>>;
  dayOverrides?: Record<string, PlanDayLite>;
}

export async function loadPlan(): Promise<RawPlan> {
  try {
    const raw = await fs.readFile(PLAN_PATH, 'utf-8');
    return JSON.parse(raw) as RawPlan;
  } catch {
    return {};
  }
}

export function weekOf(plan: RawPlan, date: string): RawWeek | undefined {
  return (plan.weeks ?? []).find((w) => date >= w.start && date <= w.end);
}

/**
 * The prescription for a date: an explicit day override wins, otherwise
 * phase × weekday → template.
 */
export function resolveDayPlan(
  plan: RawPlan,
  date: string,
): PlanDayLite | undefined {
  const override = plan.dayOverrides?.[date];
  if (override) return override;

  const week = weekOf(plan, date);
  if (!week) return undefined;
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const templateId = plan.schedule?.[week.phase]?.[String(weekday)];
  if (!templateId) return undefined;
  return (plan.templates ?? []).find((t) => t.id === templateId);
}

/** Task name → inventory item id, for the day's `<!-- items: … -->` marker. */
export type ItemBinding = Record<string, { id: string; title: string }>;

/**
 * Build the markdown scaffold for a day.
 *
 * When `binding` is given, each task label carries the concrete inventory item
 * ("刷题 · 数组/双指针 · 2 题 · 45min") and a single marker line records the
 * task→item mapping so coverage can be computed later.
 */
export function buildDayMarkdown(
  day: PlanDayLite,
  dateStr: string,
  binding: ItemBinding = {},
  /**
   * Task name → per-unit text. Used by 刷题 slots so each checkbox names the
   * concrete problem (`- [ ] #121 买卖股票的最佳时机`) instead of being blank.
   */
  unitTexts: Record<string, string[]> = {},
): string {
  const weekday = WEEKDAYS_CN[new Date(`${dateStr}T00:00:00`).getDay()];
  const lines: string[] = [];
  lines.push(`# ${dateStr} ${weekday} · ${day.title}`);
  if (day.id) lines.push(`<!-- session: ${day.id} -->`);

  const bound = Object.entries(binding).filter(([, v]) => v?.id);
  if (bound.length > 0) {
    lines.push(
      `<!-- items: ${bound.map(([task, v]) => `${task}=${v.id}`).join('; ')} -->`,
    );
  }

  lines.push('');
  for (const task of day.tasks ?? []) {
    // 刷题 slots deliberately omit the topic from the visible label: naming the
    // algorithm before you have solved the problem is a hint. It gets revealed
    // once an outcome is recorded.
    const showItem = task.track !== 'leetcode';
    lines.push(
      `- ${taskLabel(task, showItem ? binding[task.name]?.title : undefined)}`,
    );
    const texts = unitTexts[task.name] ?? [];
    const n = Math.max(1, task.units);
    for (let i = 0; i < n; i++) {
      lines.push(texts[i] ? `  - [ ] ${texts[i]}` : '  - [ ] ');
    }
  }
  lines.push('');
  lines.push('> 笔记:');
  lines.push('');
  return lines.join('\n');
}

/**
 * The log line for a task: `任务名 · 具体条目 · 目标 · 时长`.
 *
 * The task name stays first because the diary renderer matches plan tasks to
 * log items by prefix — inserting the item title after it keeps that working.
 */
export function taskLabel(task: PlanTaskLite, itemTitle?: string): string {
  const parts = [task.name];
  if (itemTitle) parts.push(itemTitle);
  if (task.target) parts.push(task.target);
  if (task.minutes) parts.push(`${task.minutes}min`);
  return parts.join(' · ');
}
