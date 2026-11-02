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
import { DEPTH_MODULES } from '@/lib/depthQuestions';
import { InterviewAnswerReview } from './InterviewAnswerReview';
import type { Resume } from '@shared/interview/resume';

interface Bundle {
  resume?: Resume;
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
  /** Mount the full plan only once asked for — it is the expensive half. */
  const [showFullPlan, setShowFullPlan] = useState(false);
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
    const clusters = new Map(bundle.stories?.bank.stories.flatMap(s => s.clusters.map(c => [c.id, c] as const)) ?? []);
    const plan: InterviewPlan = { ...bundle.plan, logs, inventory: { ...bundle.plan.inventory,
      domains: bundle.plan.inventory.domains.map(d => ({ ...d, modules: d.modules.map(m => ({ ...m,
        items: m.items.map(item => {
          const cluster = clusters.get(item.id);
          return cluster?.questions.some(q => q.custom) ? { ...item, title: `${cluster.title}（${cluster.questions.length} 问·P0 ${cluster.questions.filter(q => q.p === 0).length}）` } : item;
        }),
      })) })),
    } };

    const statuses = weekStatuses(plan, today);
    const currentWeek = weekOf(plan, today);
    // Agent-bank items name the category they draw from — that mapping is what
    // gives `qb-rag` its 47-question denominator.
    const itemsByCategory: Record<string, string> = {};
    for (const d of plan.inventory.domains) {
      for (const m of d.modules) {
        for (const it of m.items) {
          if (it.category) itemsByCategory[it.category] = it.id;
          if (DEPTH_MODULES.includes(m.id)) itemsByCategory[it.id] = it.id;
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

  // 刷题 is the only line still running daily, so it gets the pane. The rest of
  // the 12-week plan is still computed and still rendered by the very same
  // component — one disclosure down, where it no longer competes for attention.
  const leetcodeCoverage = model.coverage.filter(c => c.domain.track === 'leetcode');

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="sticky top-0 z-10 px-4 py-2 bg-white/95 backdrop-blur border-b border-stone-200 flex items-center justify-between gap-2">
        <div className="text-xs text-stone-500">刷题进度</div>
        <button
          onClick={load}
          title="重新读取磁盘上的计划"
          className="p-1 rounded hover:bg-stone-100 text-stone-500"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Figure label="待重做" value={model.debt.flagged} tone={model.debt.flagged > 0 ? 'text-rose-600' : 'text-stone-600'} hint="你亲手标的" />
          <Figure label="待复习" value={model.debt.due} tone={model.debt.due > 0 ? 'text-amber-600' : 'text-stone-600'} hint="已到间隔" />
          <Figure label="未做" value={model.debt.newCount} tone="text-stone-600" hint="题库里剩下的" />
        </div>

        {leetcodeCoverage.map(domain => (
          <div key={domain.domain.id} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-stone-800">
                {domain.domain.emoji} {domain.domain.label}
              </span>
              <span className="font-mono text-[11px] text-stone-400">
                {domain.started}/{domain.total} 专题
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {domain.items.filter(item => item.metric && item.metric.total > 0).map(item => {
                const m = item.metric!;
                return (
                  <div key={item.item.id}>
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span className="text-stone-600 truncate">{item.item.title}</span>
                      <span className="font-mono text-stone-400 shrink-0">
                        {m.done}/{m.total} {m.unit}
                        {!!m.redo && <span className="ml-1 text-rose-600">待重做 {m.redo}</span>}
                        {!m.redo && !!m.due && <span className="ml-1 text-amber-600">待复习 {m.due}</span>}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded bg-stone-200 overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${(m.done / m.total) * 100}%` }} />
                      <div className="h-full bg-amber-300" style={{ width: `${(m.partial / m.total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <details
          className="rounded-lg border border-stone-200 bg-white"
          onToggle={e => setShowFullPlan(e.currentTarget.open)}
        >
          <summary className="cursor-pointer px-3 py-2.5 text-[12px] text-stone-600 hover:text-indigo-700">
            完整 12 周总览
            <span className="ml-2 text-[11px] text-stone-400">
              覆盖面 · 阶段 · 节奏 · 目标公司
            </span>
          </summary>
          {showFullPlan && (
            <div className="border-t border-stone-200">
              <div className="px-3 py-2 flex items-center flex-wrap gap-x-3 gap-y-1 border-b border-stone-100">
                <span className="text-[11px] text-stone-500">
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
                <span className="text-[11px] text-stone-500 border-l border-stone-200 pl-3">
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
                  ? <InterviewAnswerReview itemId={item.item.id} stories={bundle?.stories} resume={bundle?.resume} days={days} /> : null}
              />
            </div>
          )}
        </details>
      </div>
    </div>
  );
}

function Figure({ label, value, tone, hint }: { label: string; value: number; tone: string; hint: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <div className="text-[11px] text-stone-500">{label}</div>
      <div className={`font-mono text-xl font-semibold leading-tight ${tone}`}>{value}</div>
      <div className="text-[10px] text-stone-400 leading-snug">{hint}</div>
    </div>
  );
}
