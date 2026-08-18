'use client';

import React from 'react';
import { Loader2, Target } from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import { InterviewDayDoc } from '@/types/interview';
import { dayProgress } from '@/lib/interviewProgress';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-CN', { weekday: 'short' });
}

function relativeLabel(dateStr: string, today: string): string | null {
  if (dateStr === today) return '今天';
  const a = new Date(dateStr + 'T00:00:00').getTime();
  const b = new Date(today + 'T00:00:00').getTime();
  const days = Math.round((a - b) / (1000 * 60 * 60 * 24));
  if (days === -1) return '昨天';
  if (days === 1) return '明天';
  if (days < 0) return `${-days} 天前`;
  return `${days} 天后`;
}

export function InterviewList() {
  const { days, isLoading } = useInterview();
  const today = getTodayDate();

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center text-stone-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading days...
      </div>
    );
  }

  const handleJump = (dateStr: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-day-card="${dateStr}"]`,
    );
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const totalDone = days.reduce((s, d) => s + dayProgress(d).done, 0);
  const totalAll = days.reduce((s, d) => s + dayProgress(d).total, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-stone-200 bg-indigo-50/50 space-y-2">
        <button
          onClick={() => handleJump(today)}
          className="w-full text-sm font-medium px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          跳到今天
        </button>
        {totalAll > 0 && (
          <p className="text-xs text-stone-500 text-center">
            累计 <span className="font-mono font-semibold">{totalDone}</span> /{' '}
            {totalAll} 项
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {days.length === 0 ? (
          <div className="p-4 text-center text-stone-500">
            <Target className="w-10 h-10 mx-auto mb-2 text-stone-400" />
            <p className="text-sm">还没有求职准备记录</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200">
            {days.map((day) => (
              <DayRow
                key={day.dateStr}
                day={day}
                today={today}
                onJump={handleJump}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DayRow({
  day,
  today,
  onJump,
}: {
  day: InterviewDayDoc;
  today: string;
  onJump: (dateStr: string) => void;
}) {
  const { done, total } = dayProgress(day);
  const isToday = day.dateStr === today;
  const rel = relativeLabel(day.dateStr, today);
  return (
    <li>
      <button
        onClick={() => onJump(day.dateStr)}
        className={`w-full text-left px-4 py-3 transition-colors ${
          isToday
            ? 'bg-indigo-50 border-l-4 border-indigo-600'
            : 'hover:bg-stone-50 border-l-4 border-transparent'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`text-sm font-medium ${
              isToday ? 'text-stone-900' : 'text-stone-700'
            }`}
          >
            {formatDate(day.dateStr)} · {dayOfWeek(day.dateStr)}
          </span>
          {rel && <span className="text-xs text-stone-500 shrink-0">{rel}</span>}
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <span className="text-xs text-stone-400 font-mono">{day.dateStr}</span>
          {total > 0 && (
            <span
              className={`text-xs font-mono shrink-0 ${
                done === total
                  ? 'text-emerald-600 font-semibold'
                  : 'text-stone-500'
              }`}
            >
              {done}/{total}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
