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
import { reviewDebt, topicMetrics } from '@shared/interview/leetcode';
import { categoryMetrics, qbankDebt } from '@shared/interview/qbank';
import { clusterProgress, storyDebt } from '@shared/interview/stories';
import type { StoryAnswers, StoryBank } from '@shared/interview/stories';
import type { QBankLog, QuestionBank } from '@shared/interview/qbank';
import type { InterviewPlan, TrackKey } from '@shared/interview/types';
import type { LeetCodeLog, ProblemBank } from '@shared/interview/leetcode';
import { useInterview } from '@/contexts/InterviewContext';
import { serializeInterviewDayDoc } from '@/lib/interviewParser';
import { getTodayDate } from '@/lib/dateUtils';
import { InterviewAnswerReview } from './InterviewAnswerReview';

interface Bundle {
  plan: InterviewPlan;
  notes?: Record<string, { body: string; updated?: string }>;
  qbank: { bank: QuestionBank; log: QBankLog };
  stories?: { bank: StoryBank; answers: StoryAnswers };
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
  const { days } = useInterview();
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
    // Attempt outcomes live in leetcode-log.json rather than the day markdown,
    // so the in-memory overlay can't see them — re-read on the broadcast.
    const onUpdated = () => void load();
    window.addEventListener('interview:leetcode-updated', onUpdated);
    window.addEventListener('interview:qbank-updated', onUpdated);
    window.addEventListener('interview:topic-updated', onUpdated);
    window.addEventListener('interview:stories-updated', onUpdated);
    return () => {
      window.removeEventListener('interview:leetcode-updated', onUpdated);
      window.removeEventListener('interview:qbank-updated', onUpdated);
      window.removeEventListener('interview:topic-updated', onUpdated);
      window.removeEventListener('interview:stories-updated', onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => {
    if (!bundle) return null;

    // Overlay unsaved edits: whatever the editor holds wins over the server copy.
    const logs = { ...bundle.plan.logs };
    for (const doc of days) {
      logs[doc.dateStr] = parseDayLog(serializeInterviewDayDoc(doc));
    }
    const plan: InterviewPlan = { ...bundle.plan, logs };

    const statuses = weekStatuses(plan, today);
    const currentWeek = weekOf(plan, today);
    // Agent-bank items name the category they draw from — that mapping is what
    // gives `qb-rag` its 47-question denominator.
    const itemsByCategory: Record<string, string> = {};
    for (const d of plan.inventory.domains) {
      for (const m of d.modules) {
        for (const it of m.items) {
          if (it.category) itemsByCategory[it.category] = it.id;
        }
      }
    }
    const metrics = Object.fromEntries([
      ...Object.entries(
        topicMetrics(bundle.leetcode.bank, bundle.leetcode.log, today),
      ).map(([id, m]) => [id, { ...m, unit: '题' }]),
      ...Object.entries(
        categoryMetrics(
          bundle.qbank?.bank ?? { questions: [] },
          bundle.qbank?.log ?? {},
          today,
          itemsByCategory,
        ),
      ).map(([id, m]) => [id, { ...m, unit: '题' }]),
      ...clusterProgress(
        bundle.stories?.bank ?? { stories: [] },
        bundle.stories?.answers ?? {},
      ).map((c) => [
        c.cluster.id,
        {
          done: c.done,
          partial: Math.max(0, c.touched - c.done),
          total: Math.max(0, c.total - c.dropped),
          due: c.flagged,
          unit: '问',
          entries: [],
        },
      ]),
    ]);
    const coverage = inventoryCoverage(plan, metrics);
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
      sdebt: storyDebt(
        bundle.stories?.bank ?? { stories: [] },
        bundle.stories?.answers ?? {},
      ),
      qdebt: qbankDebt(
        bundle.qbank?.bank ?? { questions: [] },
        bundle.qbank?.log ?? {},
        today,
      ),
    };
  }, [bundle, days, today]);

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
            {model.debt.flagged > 0 && (
              <>
                待重做{' '}
                <span className="font-mono font-semibold text-rose-600">
                  {model.debt.flagged}
                </span>{' '}
                ·{' '}
              </>
            )}
            待复习{' '}
            <span
              className={`font-mono font-semibold ${
                model.debt.due > 0 ? 'text-amber-600' : 'text-stone-600'
              }`}
            >
              {model.debt.due}
            </span>{' '}
            · 未做 {model.debt.newCount}
          </span>
          <span className="text-[11px] text-stone-500 border-l border-stone-200 pl-2">
            简历 说得出{' '}
            <span className="font-mono font-semibold text-stone-600">
              {model.sdebt.spoken}
            </span>
            /{model.sdebt.total}
            {model.sdebt.flagged > 0 && (
              <>
                {' '}
                · 待改{' '}
                <span className="font-mono font-semibold text-amber-600">
                  {model.sdebt.flagged}
                </span>
              </>
            )}
          </span>
          <span className="text-[11px] text-stone-500 border-l border-stone-200 pl-2">
            题库 已答{' '}
            <span className="font-mono font-semibold text-stone-600">
              {model.qdebt.answered}
            </span>
            {model.qdebt.redoDue > 0 && (
              <>
                {' '}
                · 待重做{' '}
                <span className="font-mono font-semibold text-rose-600">
                  {model.qdebt.redoDue}
                </span>
              </>
            )}
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
        notes={bundle?.notes}
        renderItemDetail={item => (item.item.id.startsWith('bh-') || bundle?.stories?.bank.stories.some(story => story.clusters.some(cluster => cluster.id === item.item.id)))
          ? <InterviewAnswerReview itemId={item.item.id} stories={bundle?.stories} days={days} /> : null}
      />
    </div>
  );
}
