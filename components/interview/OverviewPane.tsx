'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import OverviewPanel from '@shared/interview/ui/OverviewPanel';
import {
  datesBetween,
  inventoryCoverage,
  overallCoverage,
  parseDayLog,
  phaseOf,
  programProgress,
  resolveDayPlan,
  rhythmCount,
  trackRollup,
  weekOf,
  weekStatuses,
} from '@shared/interview/core';
import { reviewDebt } from '@shared/interview/leetcode';
import type { InterviewPlan, TrackKey } from '@shared/interview/types';
import type { LeetCodeLog, ProblemBank } from '@shared/interview/leetcode';
import { useInterview } from '@/contexts/InterviewContext';
import { serializeInterviewDayDoc } from '@/lib/interviewParser';
import { getTodayDate } from '@/lib/dateUtils';

interface Bundle {
  plan: InterviewPlan;
  leetcode: { bank: ProblemBank; log: LeetCodeLog };
}

/**
 * The same overview the diary renders, inside the editor — and kept live.
 *
 * The server bundle is fetched once, then the day logs the user is editing in
 * this session are re-parsed from the in-memory documents and overlaid on top.
 * That is what makes ticking one more problem move the coverage bar right away,
 * without waiting for the autosave round-trip.
 */
export function OverviewPane() {
  const { days, mastery } = useInterview();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const today = getTodayDate();

  const load = async () => {
    try {
      setReloading(true);
      setError(null);
      const res = await fetch('/api/interview/overview');
      if (!res.ok) throw new Error();
      setBundle(await res.json());
    } catch {
      setError('总览加载失败');
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => {
    if (!bundle) return null;

    // Overlay unsaved edits: whatever the editor holds wins over the server copy.
    const logs = { ...bundle.plan.logs };
    for (const doc of days) {
      logs[doc.dateStr] = parseDayLog(serializeInterviewDayDoc(doc));
    }
    const plan: InterviewPlan = { ...bundle.plan, logs, mastery };

    const statuses = weekStatuses(plan, today);
    const currentWeek = weekOf(plan, today);
    const coverage = inventoryCoverage(plan);
    const elapsed = plan.meta.startDate
      ? datesBetween(plan.meta.startDate, today)
      : [];

    return {
      plan,
      statuses,
      currentWeek,
      currentPhase: phaseOf(plan, currentWeek),
      todayPlan: resolveDayPlan(plan, today),
      hasTodayLog: !!plan.logs[today],
      progress: programProgress(plan, today),
      rhythm: rhythmCount(plan, today),
      tracks: trackRollup(plan, elapsed),
      coverage,
      overall: overallCoverage(coverage),
      weekTracks: currentWeek
        ? ([
            ...new Set(
              datesBetween(currentWeek.start, currentWeek.end)
                .flatMap((d) => resolveDayPlan(plan, d)?.tasks ?? [])
                .map((t) => t.track),
            ),
          ] as TrackKey[])
        : [],
      debt: reviewDebt(bundle.leetcode.bank, bundle.leetcode.log, today),
    };
  }, [bundle, days, mastery, today]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-stone-500">
        {error}
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-md border border-stone-300 hover:bg-stone-50"
        >
          重试
        </button>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="h-full flex items-center justify-center text-stone-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        加载总览…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="sticky top-0 z-10 px-4 py-2 bg-white/95 backdrop-blur border-b border-stone-200 flex items-center justify-between gap-2">
        <div className="text-xs text-stone-500">
          整体计划
          <span className="ml-2 text-stone-400">
            与 diary 同一份数据与同一个组件
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-stone-500">
            刷题待复习{' '}
            <span
              className={`font-mono font-semibold ${
                model.debt.due > 0 ? 'text-amber-600' : 'text-stone-600'
              }`}
            >
              {model.debt.due}
            </span>{' '}
            · 未做 {model.debt.newCount}
          </span>
          <button
            onClick={load}
            title="重新读取磁盘上的计划"
            className="p-1 rounded hover:bg-stone-100 text-stone-500"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <OverviewPanel
        plan={model.plan}
        today={today}
        statuses={model.statuses}
        currentWeek={model.currentWeek}
        currentPhase={model.currentPhase}
        todayPlan={model.todayPlan}
        hasTodayLog={model.hasTodayLog}
        progress={model.progress}
        rhythm={model.rhythm}
        tracks={model.tracks}
        coverage={model.coverage}
        overall={model.overall}
        weekTracks={model.weekTracks}
      />
    </div>
  );
}
