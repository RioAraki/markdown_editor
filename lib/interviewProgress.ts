import { InterviewDayDoc, UnitStatus } from '@/types/interview';

/** partial counts as attempted; pending does not. */
function counts(s: UnitStatus): { done: number; total: number } {
  return { done: s === 'pending' ? 0 : 1, total: 1 };
}

export function dayProgress(doc: InterviewDayDoc): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const block of doc.blocks) {
    if (block.kind === 'task') {
      const c = counts(block.status);
      done += c.done;
      total += c.total;
    } else if (block.kind === 'task-units') {
      for (const u of block.units) {
        const c = counts(u.status);
        done += c.done;
        total += c.total;
      }
    }
  }
  return { done, total };
}
