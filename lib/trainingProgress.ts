import { SetStatus, TrainingDayDoc } from '@/types/training';

function statusCounts(s: SetStatus): { done: number; total: number } {
  // done + compromise both count toward "done"; pending doesn't
  return {
    done: s === 'pending' ? 0 : 1,
    total: 1,
  };
}

export function dayProgress(doc: TrainingDayDoc): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const block of doc.blocks) {
    if (block.kind === 'exercise') {
      const c = statusCounts(block.status);
      done += c.done;
      total += c.total;
    } else if (block.kind === 'exercise-sets') {
      for (const s of block.sets) {
        const c = statusCounts(s.status);
        done += c.done;
        total += c.total;
      }
    }
  }
  return { done, total };
}
