'use client';

import { useEffect, useState } from 'react';
import { CalendarPlus, ChevronDown, Loader2 } from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import { PlanDayLite, TodayPlanResponse } from '@/types/interview';

export function TodayPicker() {
  const { days, refresh } = useInterview();
  const today = getTodayDate();
  const todayExists = days.some((d) => d.dateStr === today);

  const [data, setData] = useState<TodayPlanResponse | null>(null);
  const [overrideId, setOverrideId] = useState<string | undefined>();
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (todayExists) return;
    let cancelled = false;
    fetch('/api/interview/today')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: TodayPlanResponse) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todayExists]);

  if (todayExists || !data) return null;

  const chosen: PlanDayLite | undefined = overrideId
    ? data.templates.find((t) => t.id === overrideId)
    : data.suggestion;

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${today}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrideId ? { templateId: overrideId } : {}),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      setError('创建失败,稍后重试');
    } finally {
      setCreating(false);
    }
  };

  if (!chosen && data.templates.length === 0) {
    return (
      <section className="bg-white rounded-lg border border-stone-200 p-4 text-sm text-stone-500">
        还没有求职准备计划。请先创建{' '}
        <code className="bg-stone-100 px-1.5 py-0.5 rounded">
          D:\diary\data\interview\plan.json
        </code>
        。
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg border-2 border-indigo-300 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-stone-200 bg-indigo-50/50">
        <h3 className="text-[15px] font-semibold text-stone-800">今天做什么?</h3>
        <p className="text-xs text-stone-500 mt-0.5">
          {today} 还没有记录
          {data.week && ` · W${data.week.n} ${data.week.theme}`}
        </p>
      </header>

      <div className="p-4">
        {chosen ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-stone-800">
                {chosen.title}
              </span>
              {!overrideId && (
                <span className="text-[11px] text-indigo-600 font-medium shrink-0">
                  计划安排
                </span>
              )}
            </div>
            {chosen.focus && (
              <p className="text-xs text-stone-500 mt-0.5">{chosen.focus}</p>
            )}
            {chosen.tasks && chosen.tasks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chosen.tasks.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-stone-200 bg-white text-stone-600"
                  >
                    <span>{data.trackTypes[t.track]?.emoji ?? '·'}</span>
                    {t.name}
                    {t.target && (
                      <span className="text-stone-400">· {t.target}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            今天不在 12 周计划期内，手动选一个模板。
          </p>
        )}

        {data.templates.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`}
              />
              {showAll ? '收起' : '换一个模板'}
            </button>

            {showAll && (
              <div className="mt-2 space-y-1.5">
                {data.templates.map((t) => {
                  const isSel = overrideId
                    ? t.id === overrideId
                    : t.id === data.suggestion?.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setOverrideId(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        isSel
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      <span className="block text-sm text-stone-800 truncate">
                        {t.title}
                      </span>
                      {t.tasks && (
                        <span className="block text-xs text-stone-500 truncate">
                          {t.tasks.map((x) => x.name).join(' · ')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={create}
            disabled={!chosen || creating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
      </div>
    </section>
  );
}
