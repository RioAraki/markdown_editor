'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { parseProblemUnit } from '@shared/interview/leetcode';
import { TaskUnit } from '@/types/interview';

/**
 * "今天还有时间，再来一题".
 *
 * The day's plan sets a target, not a ceiling. The server decides *which*
 * problem: while the course is unfinished it comes from the knowledge point
 * under study, so an extra problem deepens the current pattern rather than
 * scattering. All this sends is what is already on the card.
 */
export function AddProblem({
  units,
  onAdd,
}: {
  units: TaskUnit[];
  onAdd: (trailing: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setBusy(true);
    setError(null);
    try {
      const ids = units
        .map((u) => parseProblemUnit(u.trailing)?.id)
        .filter((n): n is number => typeof n === 'number');
      const res = await fetch('/api/interview/leetcode/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude: ids, count: 1 }),
      });
      if (!res.ok) throw new Error();
      const d: { problems: { unitText: string }[] } = await res.json();
      if (!d.problems.length) {
        setError('题库里没有更多可推荐的题了');
        return;
      }
      onAdd(' ' + d.problems[0].unitText);
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
        title="按课程再加一题 —— 还在攻当前知识点，不会跳到别的专题"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        再来一题
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
