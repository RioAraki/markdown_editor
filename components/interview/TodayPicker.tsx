'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import {
  ItemChoiceLite,
  PlanDayLite,
  PlanTaskLite,
  SuggestedProblem,
  TodayPlanResponse,
} from '@/types/interview';

export function TodayPicker() {
  const { days, refresh } = useInterview();
  const today = getTodayDate();
  const todayExists = days.some((d) => d.dateStr === today);

  const [data, setData] = useState<TodayPlanResponse | null>(null);
  const [overrideTemplate, setOverrideTemplate] = useState<string | undefined>();
  const [showTemplates, setShowTemplates] = useState(false);
  /** Task name → chosen item id. Starts from the server's suggestions. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [swapping, setSwapping] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (todayExists) return;
    let cancelled = false;
    fetch('/api/interview/today')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: TodayPlanResponse) => {
        if (cancelled) return;
        setData(d);
        const init: Record<string, string> = {};
        for (const [task, item] of Object.entries(d.suggestedItems ?? {})) {
          init[task] = item.id;
        }
        setPicked(init);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todayExists]);

  const chosen: PlanDayLite | undefined = overrideTemplate
    ? data?.templates.find((t) => t.id === overrideTemplate)
    : data?.suggestion;

  // Look up any item by id, including ones swapped in manually.
  const choiceById = useMemo(() => {
    const m = new Map<string, ItemChoiceLite>();
    for (const c of data?.choices ?? []) m.set(c.id, c);
    return m;
  }, [data]);

  const domainByTrack = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of data?.domains ?? []) {
      const arr = m.get(d.track) ?? [];
      arr.push(d.id);
      m.set(d.track, arr);
    }
    return m;
  }, [data]);

  if (todayExists || !data) return null;

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${today}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(overrideTemplate ? { templateId: overrideTemplate } : {}),
          items: picked,
          problems: Object.fromEntries(
            Object.entries(data.suggestedProblems ?? {}).map(([task, ps]) => [
              task,
              ps.map((p) => p.id),
            ]),
          ),
        }),
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
          {chosen && ` · ${chosen.title}`}
        </p>
      </header>

      <div className="p-4 space-y-3">
        {chosen?.tasks && chosen.tasks.length > 0 ? (
          <>
            <p className="text-xs text-stone-500">
              已按清单自动排好，每项都能换。
            </p>
            <div className="space-y-2">
              {chosen.tasks.map((task) => (
                <SlotRow
                  key={task.name}
                  task={task}
                  emoji={data.trackTypes[task.track]?.emoji ?? '·'}
                  trackLabel={data.trackTypes[task.track]?.label ?? task.track}
                  pickedId={picked[task.name]}
                  choice={
                    picked[task.name]
                      ? choiceById.get(picked[task.name])
                      : undefined
                  }
                  suggested={data.suggestedItems?.[task.name]}
                  isSwapping={swapping === task.name}
                  onToggleSwap={() =>
                    setSwapping(swapping === task.name ? null : task.name)
                  }
                  onPick={(id) => {
                    setPicked((p) => ({ ...p, [task.name]: id }));
                    setSwapping(null);
                  }}
                  problems={data.suggestedProblems?.[task.name] ?? []}
                  candidates={(data.choices ?? []).filter(
                    (c) =>
                      (domainByTrack.get(task.track) ?? []).includes(
                        c.domainId,
                      ) &&
                      // Respect the slot's module pool so 「Agent 题库」 doesn't
                      // offer 「LLM 机制」 items. No pool → whole domain.
                      (!task.pool || task.pool.includes(c.moduleId)),
                  )}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-500">
            今天不在 12 周计划期内，手动选一个模板。
          </p>
        )}

        {data.templates.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showTemplates ? 'rotate-180' : ''}`}
              />
              {showTemplates ? '收起' : '换一个日模板'}
            </button>

            {showTemplates && (
              <div className="space-y-1.5">
                {data.templates.map((t) => {
                  const isSel = overrideTemplate
                    ? t.id === overrideTemplate
                    : t.id === data.suggestion?.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setOverrideTemplate(t.id);
                        setShowTemplates(false);
                      }}
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

        <div className="flex items-center gap-3 pt-1">
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

function SlotRow({
  task,
  emoji,
  trackLabel,
  pickedId,
  choice,
  suggested,
  isSwapping,
  onToggleSwap,
  onPick,
  candidates,
  problems,
}: {
  task: PlanTaskLite;
  emoji: string;
  trackLabel: string;
  pickedId?: string;
  choice?: ItemChoiceLite;
  suggested?: { id: string; title: string; how?: string; touches: number };
  isSwapping: boolean;
  onToggleSwap: () => void;
  onPick: (id: string) => void;
  candidates: ItemChoiceLite[];
  /** For 刷题 slots: the concrete problems picked for each checkbox. */
  problems: SuggestedProblem[];
}) {
  const [q, setQ] = useState('');
  const title =
    choice?.title ?? (pickedId === suggested?.id ? suggested?.title : undefined);
  const touches = choice?.touches ?? suggested?.touches ?? 0;

  const filtered = useMemo(() => {
    const pool = candidates.filter((c) => !c.mastered);
    if (!q.trim()) return pool.slice(0, 40);
    const k = q.trim().toLowerCase();
    return pool.filter((c) => c.title.toLowerCase().includes(k)).slice(0, 40);
  }, [candidates, q]);

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60">
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-base leading-none mt-0.5 shrink-0">{emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium text-stone-800">
                {task.name}
              </span>
              <span className="text-[11px] text-stone-400">
                {trackLabel}
                {task.target && ` · ${task.target}`}
                {task.minutes ? ` · ${task.minutes}min` : ''}
              </span>
            </div>
            {problems.length > 0 ? (
              <p className="text-xs text-stone-400 mt-0.5 italic">
                → 考察什么做完再揭晓
              </p>
            ) : title ? (
              <p className="text-xs text-stone-700 mt-0.5">
                → {title}
                {touches > 0 && (
                  <span className="ml-1.5 text-[10px] text-amber-600">
                    做过 {touches} 次
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-stone-400 mt-0.5 italic">
                这个领域的条目都掌握了，或清单里没有对应内容
              </p>
            )}
          </div>
          {problems.length === 0 && (
            <button
              type="button"
              onClick={onToggleSwap}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-indigo-700 px-1.5 py-1 rounded hover:bg-white transition-colors"
              title="换一个条目"
            >
              <RefreshCw className="w-3 h-3" />
              换
            </button>
          )}
        </div>

        {problems.length > 0 && (
          <ul className="mt-2 ml-6 space-y-1">
            {problems.map((p) => (
              <li key={p.id} className="text-[11px] leading-relaxed">
                <span
                  className={`inline-block px-1 rounded mr-1 ${
                    p.kind === 'review'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {p.kind === 'review' ? '复习' : '新题'}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-stone-700 hover:text-indigo-700 underline decoration-stone-300 decoration-dotted underline-offset-2"
                >
                  #{p.id} {p.title}
                </a>
                <span className="text-stone-400"> · {p.difficulty}</span>
                <span className="block text-stone-400 ml-6">{p.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isSwapping && (
        <div className="px-3 pb-3 border-t border-stone-200 pt-2">
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              placeholder="搜索这个领域的条目…"
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-xs text-stone-400 py-2 text-center">没有匹配的条目</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  c.id === pickedId
                    ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-300'
                    : 'hover:bg-white text-stone-700'
                }`}
              >
                <span className="block truncate">{c.title}</span>
                <span className="block text-[10px] text-stone-400">
                  {c.moduleLabel}
                  {c.touches > 0 && ` · 做过 ${c.touches} 次`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
