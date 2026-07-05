'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { useTraining } from '@/contexts/TrainingContext';
import { getTodayDate } from '@/lib/dateUtils';

interface RotationSessionLite {
  id: string;
  type: string;
  title: string;
  exercises?: { name: string }[];
}

interface RotationResponse {
  sessions: RotationSessionLite[];
  suggestionId?: string;
  lastDoneById: Record<string, string>;
  today: string;
}

const EMOJI: Record<string, string> = {
  push: '🏋',
  pull: '🚣',
  legs: '🦵',
  full: '🔥',
  cardio: '🏃',
  mobility: '🧘',
  rest: '😌',
};

function daysAgoLabel(lastDone: string | undefined, today: string): string {
  if (!lastDone) return '从未';
  const d = Math.round(
    (Date.parse(`${today}T00:00:00`) - Date.parse(`${lastDone}T00:00:00`)) /
      86_400_000,
  );
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  return `${d} 天前`;
}

export function TodayPicker() {
  const { days, refresh } = useTraining();
  const today = getTodayDate();
  const todayExists = days.some((d) => d.dateStr === today);

  const [data, setData] = useState<RotationResponse | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (todayExists) return;
    let cancelled = false;
    fetch('/api/training/rotation')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: RotationResponse) => {
        if (cancelled) return;
        setData(d);
        setSelected(d.suggestionId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todayExists]);

  if (todayExists || !data || data.sessions.length === 0) return null;

  const create = async () => {
    if (!selected) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/training/${today}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selected }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      setError('创建失败,稍后重试');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="bg-white rounded-lg border-2 border-emerald-300 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-stone-200 bg-emerald-50/50">
        <h3 className="text-[15px] font-semibold text-stone-800">
          今天练什么?
        </h3>
        <p className="text-xs text-stone-500 mt-0.5">
          {today} 还没有记录 · 选一个 session 创建
        </p>
      </header>

      <div className="p-3 space-y-1.5">
        {data.sessions.map((s) => {
          const isSel = s.id === selected;
          const isSuggested = s.id === data.suggestionId;
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                isSel
                  ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              <span className="text-lg shrink-0">{EMOJI[s.type] ?? '·'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-stone-800 truncate">
                  {s.title}
                </span>
                {s.exercises && (
                  <span className="block text-xs text-stone-500 truncate">
                    {s.exercises.map((e) => e.name).join(' · ')}
                  </span>
                )}
              </span>
              <span className="text-xs text-stone-400 shrink-0 text-right">
                {daysAgoLabel(data.lastDoneById[s.id], data.today)}
                {isSuggested && (
                  <span className="block text-[11px] text-emerald-600 font-medium">
                    建议
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-3 flex items-center gap-3">
        <button
          onClick={create}
          disabled={!selected || creating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CalendarPlus className="w-4 h-4" />
          )}
          创建今天的记录
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </section>
  );
}
