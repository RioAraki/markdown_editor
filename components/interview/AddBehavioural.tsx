'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { TaskUnit } from '@/types/interview';
import {
  behaviouralUnitText,
  parseBehaviouralUnit,
} from '@shared/interview/behavioural';
import type { SwapCandidate } from './ItemSwap';

/**
 * "今天还有时间，再来一题" for 行为故事.
 *
 * Unlike the question banks' 再答一题, this does not pick for you: the whole
 * point of the slot is rehearsing the answer you feel shaky about today, and
 * the list is short enough to read. It doubles as the module's table of
 * contents — the 没排过 markers are what show which questions have never once
 * come up, which for a long time was all of them but one.
 */
export function AddBehavioural({
  task,
  units,
  onAdd,
}: {
  task: string;
  units: TaskUnit[];
  onAdd: (trailing: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Already on today's card — offering these again would just duplicate a line. */
  const taken = useMemo(
    () =>
      new Set(
        units
          .map((u) => parseBehaviouralUnit(u.trailing)?.id)
          .filter((id): id is string => !!id),
      ),
    [units],
  );

  const reveal = async () => {
    const next = !open;
    setOpen(next);
    if (!next || candidates) return;
    try {
      const res = await fetch(`/api/interview/items?block=${encodeURIComponent(task)}`);
      const d = await res.json();
      setCandidates(res.ok ? (d.items ?? []) : []);
      if (!res.ok) setError(d.error ?? '没能取到可选的题目');
    } catch {
      setCandidates([]);
      setError('没能取到可选的题目');
    }
  };

  const list = useMemo(() => {
    const pool = (candidates ?? []).filter((c) => !c.mastered && !taken.has(c.id));
    const k = q.trim().toLowerCase();
    return (k ? pool.filter((c) => c.title.toLowerCase().includes(k)) : pool).slice(0, 40);
  }, [candidates, q, taken]);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={reveal}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        再来一题
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-stone-200 bg-white p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索题目…"
            className="w-full text-xs px-2 py-1.5 mb-1.5 rounded border border-stone-200 focus:border-indigo-400 focus:outline-none"
          />
          {candidates === null && (
            <p className="px-2 py-2 text-xs text-stone-400 inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              正在取可选的题目…
            </p>
          )}
          <ul className="max-h-64 overflow-auto -mx-1">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(' ' + behaviouralUnitText(c.id, c.title));
                    setOpen(false);
                    setQ('');
                  }}
                  className="w-full text-left px-2 py-1.5 rounded text-xs flex items-baseline gap-2 hover:bg-stone-100 text-stone-700 transition-colors"
                >
                  <span className="flex-1 min-w-0">{c.title}</span>
                  {c.touches ? (
                    <span className="text-[10px] text-amber-600 shrink-0">
                      排过 {c.touches} 次
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 shrink-0">没排过</span>
                  )}
                </button>
              </li>
            ))}
            {candidates !== null && list.length === 0 && (
              <li className="px-2 py-2 text-xs text-stone-400">
                {taken.size ? '其余的今天都已经排上了' : '没有匹配的题目'}
              </li>
            )}
          </ul>
          {error && <p className="mt-1 px-2 text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
