'use client';

import { useMemo, useState } from 'react';
import { Loader2, Repeat2 } from 'lucide-react';

export interface SwapCandidate {
  id: string;
  title: string;
  moduleLabel?: string;
  touches?: number;
  mastered?: boolean;
}

/**
 * Re-point a slot at a different inventory item, on a day that already exists.
 *
 * The picker in TodayPicker only runs while a day is being assembled; once the
 * file was written the binding was effectively frozen, since the only ways to
 * change it were hand-editing the `items:` marker or deleting the day. That is
 * what made 行为故事 feel like it chose for you.
 *
 * Deliberately not a dropdown: the list doubles as the module's table of
 * contents, and the "做过 N 次" counts are what tell you which ones have never
 * come up — the whole reason to reach for this.
 */
export function ItemSwap({
  task,
  currentId,
  onSwap,
}: {
  task: string;
  currentId?: string;
  onSwap: (itemId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);

  // Fetched on first open, not on mount: this sits on every bound slot, and
  // loading a list nobody asked to see would cost a request per slot per day.
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
    const pool = (candidates ?? []).filter((c) => !c.mastered);
    const k = q.trim().toLowerCase();
    return (k ? pool.filter((c) => c.title.toLowerCase().includes(k)) : pool).slice(0, 40);
  }, [candidates, q]);

  const pick = async (id: string) => {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    setBusy(id);
    setError(null);
    try {
      await onSwap(id);
      setOpen(false);
      setQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '换题失败，请重试');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={reveal}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-indigo-700 px-1.5 py-1 rounded hover:bg-stone-100 transition-colors"
        title={`换一道${task}`}
      >
        <Repeat2 className="w-3.5 h-3.5" />
        换一道
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
              <Loader2 className="w-3 h-3 animate-spin" />正在取可选的题目…
            </p>
          )}
          <ul className="max-h-64 overflow-auto -mx-1">
            {list.map((c) => {
              const isCurrent = c.id === currentId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => pick(c.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-baseline gap-2 transition-colors disabled:opacity-50 ${
                      isCurrent
                        ? 'bg-indigo-50 text-indigo-800'
                        : 'hover:bg-stone-100 text-stone-700'
                    }`}
                  >
                    <span className="flex-1 min-w-0">{c.title}</span>
                    {busy === c.id && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                    {isCurrent ? (
                      <span className="text-[10px] text-indigo-500 shrink-0">现在这道</span>
                    ) : c.touches ? (
                      <span className="text-[10px] text-amber-600 shrink-0">
                        排过 {c.touches} 次
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-600 shrink-0">没排过</span>
                    )}
                  </button>
                </li>
              );
            })}
            {candidates !== null && list.length === 0 && (
              <li className="px-2 py-2 text-xs text-stone-400">没有匹配的题目</li>
            )}
          </ul>
          {error && <p className="mt-1 px-2 text-[11px] text-red-600">{error}</p>}
          <p className="mt-1 px-2 text-[10px] text-stone-400">
            换题会把这个时段的打卡重置为未完成——旧题的记录对新题不作数（「再来一个主题」追加的不受影响）。
          </p>
        </div>
      )}
    </div>
  );
}
