'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { parseProblemUnit } from '@shared/interview/leetcode';
import { TaskUnit } from '@/types/interview';
import { useInterview } from '@/contexts/InterviewContext';

/**
 * "今天还有时间，再来一题".
 *
 * The day's plan sets a target, not a ceiling. The server decides *which*
 * problem: new material follows the course, while a flagged redo comes due on
 * its own clock and may well be from a topic you finished weeks ago. Because
 * those two doors look identical once the problem is on the card, the reason
 * the server gave is shown here — otherwise a DP problem appearing during
 * 二分 week reads as a bug rather than as the redo it is.
 */
export function AddProblem({
  units,
  dateStr,
  onAdd,
}: {
  units: TaskUnit[];
  dateStr: string;
  onAdd: (trailing: string) => void;
}) {
  const { days } = useInterview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const pick = async () => {
    setBusy(true);
    setError(null);
    setWhy(null);
    try {
      const day = days.find((d) => d.dateStr === dateStr);
      const allUnits = day
        ? day.blocks.flatMap((b) => b.kind === 'task-units' ? b.units : [])
        : units;
      const ids = allUnits
        .map((u) => parseProblemUnit(u.trailing)?.id)
        .filter((n): n is number => typeof n === 'number');
      const res = await fetch('/api/interview/leetcode/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, exclude: ids, count: 1 }),
      });
      if (!res.ok) throw new Error();
      const d: {
        problems: { unitText: string; title: string; reason: string }[];
      } = await res.json();
      if (!d.problems.length) {
        setError('暂时没有符合两新一旧规则的题目可追加');
        return;
      }
      const p = d.problems[0];
      setWhy(`${p.title} · ${p.reason}`);
      onAdd(' ' + p.unitText);
    } catch {
      setError('取题失败,稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        title="接着今天的两新一旧顺序加题；老题只选已标记待重做的题"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        再来一题
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      {why && !error && (
        <span className="text-[11px] text-stone-500">{why}</span>
      )}
    </div>
  );
}
