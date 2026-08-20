'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Target } from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import { dayProgress } from '@/lib/interviewProgress';

/**
 * Month calendar of prep days.
 *
 * A list told you which days exist; a calendar tells you the shape of a month
 * — which is the question you actually ask when reviewing ("did I skip all of
 * last week?"). Each day is shaded by how much of it got done, so a glance
 * distinguishes a full day from one where you opened the file and stopped.
 */

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function monthOf(dateKey: string): Date {
  const [y, m] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Monday-first column index, so weeks read the way the plan does. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function InterviewList() {
  const { days, isLoading } = useInterview();
  const today = getTodayDate();
  const [month, setMonth] = useState(() => monthOf(today));

  const byDate = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const d of days) m.set(d.dateStr, dayProgress(d));
    return m;
  }, [days]);

  // Jump to the month holding the newest record when the set first arrives.
  useEffect(() => {
    if (days.length === 0) return;
    const newest = days.reduce((a, b) => (a.dateStr > b.dateStr ? a : b)).dateStr;
    setMonth((prev) => {
      const t = monthOf(newest > today ? today : newest);
      return prev.getFullYear() === t.getFullYear() && prev.getMonth() === t.getMonth()
        ? prev
        : t;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center text-stone-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        加载中…
      </div>
    );
  }

  const jump = (dateStr: string) => {
    const el = document.querySelector<HTMLElement>(`[data-day-card="${dateStr}"]`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const year = month.getFullYear();
  const mon = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const lead = mondayIndex(new Date(year, mon, 1));

  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthKeys = Array.from({ length: daysInMonth }, (_, i) => keyOf(year, mon, i + 1));
  const monthDays = monthKeys.filter((k) => byDate.has(k));
  const monthDone = monthDays.reduce((s, k) => s + (byDate.get(k)?.done ?? 0), 0);
  const monthTotal = monthDays.reduce((s, k) => s + (byDate.get(k)?.total ?? 0), 0);

  const totalDone = days.reduce((s, d) => s + dayProgress(d).done, 0);
  const totalAll = days.reduce((s, d) => s + dayProgress(d).total, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-stone-200 bg-indigo-50/50">
        <button
          onClick={() => jump(today)}
          className="w-full text-sm font-medium px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          跳到今天
        </button>
      </div>

      <div className="px-3 py-2 flex items-center justify-between border-b border-stone-200">
        <button
          onClick={() => setMonth(new Date(year, mon - 1, 1))}
          className="p-1 rounded hover:bg-stone-100 text-stone-500"
          aria-label="上个月"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-800">
            {year} 年 {mon + 1} 月
          </div>
          <div className="text-[10px] text-stone-400 font-mono">
            {monthDays.length} 天 · {monthDone}/{monthTotal} 项
          </div>
        </div>
        <button
          onClick={() => setMonth(new Date(year, mon + 1, 1))}
          className="p-1 rounded hover:bg-stone-100 text-stone-500"
          aria-label="下个月"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2.5">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] text-stone-400 py-0.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} className="aspect-square" />;
            const key = keyOf(year, mon, day);
            const p = byDate.get(key);
            const isToday = key === today;
            const isFuture = key > today;

            let tone = 'text-stone-300';
            if (p) {
              const pct = p.total > 0 ? p.done / p.total : 0;
              tone =
                pct >= 1
                  ? 'bg-emerald-500 text-white font-semibold'
                  : pct >= 0.5
                    ? 'bg-emerald-200 text-emerald-900 font-medium'
                    : pct > 0
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-stone-200 text-stone-600';
            } else if (!isFuture) {
              tone = 'text-stone-400';
            }

            return (
              <button
                key={key}
                onClick={() => p && jump(key)}
                disabled={!p}
                title={
                  p ? `${key} · 完成 ${p.done}/${p.total}` : `${key} · 没有记录`
                }
                className={`aspect-square flex items-center justify-center text-xs rounded-md transition-all ${tone} ${
                  p ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300' : 'cursor-default'
                } ${isToday ? 'ring-2 ring-indigo-600' : ''}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pb-2 flex items-center gap-2.5 text-[10px] text-stone-400 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500" />全做完
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-200" />过半
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-amber-200" />少量
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-stone-200" />开了没做
        </span>
      </div>

      <div className="mt-auto border-t border-stone-200 p-3">
        {days.length === 0 ? (
          <div className="text-center text-stone-500">
            <Target className="w-8 h-8 mx-auto mb-1.5 text-stone-400" />
            <p className="text-xs">还没有求职准备记录</p>
          </div>
        ) : (
          <p className="text-xs text-stone-500 text-center">
            累计 <span className="font-mono font-semibold">{totalDone}</span> /{' '}
            {totalAll} 项 · {days.length} 天
          </p>
        )}
      </div>
    </div>
  );
}
