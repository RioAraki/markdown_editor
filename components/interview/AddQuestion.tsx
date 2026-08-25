'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { parseQuestionUnit } from '@shared/interview/qbank';
import { TaskUnit } from '@/types/interview';

/**
 * "今天还有时间，再答一题".
 *
 * Mirrors the LeetCode 再来一题 button: the day's plan sets a target, not a
 * ceiling. A pending redo gets cleared before new ground, since you flagged it
 * yourself.
 */
export function AddQuestion({
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
      const parsed = units
        .map((u) => parseQuestionUnit(u.trailing))
        .filter((p): p is NonNullable<typeof p> => !!p);
      // Two banks share one endpoint, so the slot must say which one it is.
      // Without this a Python slot happily served an Agent question — the ids
      // carry the bank (`py01-…` vs `01-…`), so read it off what is already
      // on the card rather than threading another prop down.
      const bankId = parsed.some((p) => p.id.startsWith('py')) ? 'python' : 'agent';
      const res = await fetch('/api/interview/qbank/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exclude: parsed.map((p) => p.id),
          bankId,
          count: 1,
        }),
      });
      if (!res.ok) throw new Error();
      const d: { questions: { unitText: string }[] } = await res.json();
      if (!d.questions.length) {
        setError('题库里没有更多可推荐的题了');
        return;
      }
      onAdd(' ' + d.questions[0].unitText);
    } catch {
      setError('取题失败，稍后重试');
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
        title="再加一题，待重做的会优先排上来"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Plus className="w-3 h-3" />
        )}
        再答一题
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
