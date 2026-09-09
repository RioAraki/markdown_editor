'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import {
  BlockLite,
  BlocksResponse,
  ItemChoiceLite,
  PlanDayLite,
  PlanTaskLite,
  SuggestedItem,
  SuggestedProblem,
  SuggestedQuestion,
  SuggestedStoryQuestion,
  TodayPlanResponse,
} from '@/types/interview';

/**
 * 「今天还想加个时段」 — the picker, reduced to what a started day still needs.
 *
 * Composing a day used to be one irreversible shot: the picker vanished the
 * moment the file existed, so a day opened in the evening with one block
 * could never gain the rest in the morning. Everything already in the day is
 * left out of the list, so this can only add.
 */
function TopUp({
  missing,
  chosen,
  setChosen,
  onAdd,
  busy,
  error,
  ready,
}: {
  missing: BlockLite[];
  chosen: string[];
  setChosen: (f: (cur: string[]) => string[]) => void;
  onAdd: () => void;
  busy: boolean;
  error: string | null;
  ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          今天再加个时段
          <span className="text-stone-400">还有 {missing.length} 个没排</span>
        </button>
      ) : (
        <div className="bg-white rounded-lg border border-stone-200 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[12px] font-medium text-stone-700">
              加到今天
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-stone-400 hover:text-stone-600"
            >
              收起
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {missing.map((b) => {
              const on = chosen.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    setChosen((cur) =>
                      cur.includes(b.id)
                        ? cur.filter((x) => x !== b.id)
                        : [...cur, b.id],
                    )
                  }
                  title={b.desc}
                  className={`text-[11.5px] px-2 py-1 rounded border transition-colors ${
                    on
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-stone-600 border-stone-300 hover:border-indigo-400'
                  }`}
                >
                  {b.name}
                  <span className={on ? 'ml-1 text-indigo-200' : 'ml-1 text-stone-400'}>
                    {b.minutes}min
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAdd}
              disabled={busy || chosen.length === 0 || !ready}
              className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              加进来
            </button>
            {chosen.length > 0 && !ready && (
              <span className="text-[11px] text-stone-400">正在排题…</span>
            )}
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

export function TodayPicker() {
  const { days, refresh } = useInterview();
  const today = getTodayDate();
  const todayExists = days.some((d) => d.dateStr === today);

  const [data, setData] = useState<TodayPlanResponse | null>(null);
  const [menu, setMenu] = useState<BlocksResponse | null>(null);
  /** Block ids that make up tonight. Required ones start checked. */
  const [chosenBlocks, setChosenBlocks] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  /** Task name → chosen item id. Starts from the server's suggestions. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [swapping, setSwapping] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/interview/blocks')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: BlocksResponse) => {
        if (cancelled) return;
        setMenu(d);
        // Topping up starts from an empty selection: the required blocks may
        // already be in the day, and pre-checking them would offer to add
        // what is there.
        setChosenBlocks((cur) =>
          cur.length
            ? cur
            : todayExists
              ? []
              : d.blocks.filter((b) => b.required).map((b) => b.id),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todayExists]);

  // Re-plan whenever the composition changes: which problems and questions get
  // picked depends on which blocks are in the day.
  useEffect(() => {
    if (todayExists && chosenBlocks.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    const qs = chosenBlocks.length ? `?blocks=${chosenBlocks.join(',')}` : '';
    fetch(`/api/interview/today${qs}`)
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
  }, [todayExists, chosenBlocks]);

  const chosen: PlanDayLite | undefined = data?.suggestion;

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

  // Blocks the day already has — offering them again would duplicate work.
  const already = new Set(
    (days.find((d) => d.dateStr === today)?.blocks ?? [])
      .map((b) => ('label' in b ? b.label : ''))
      .map((l: string) => (l.split('·')[0] ?? '').trim())
      .filter(Boolean),
  );

  // Both the initial picker and TopUp need this handler before either returns.
  const create = async (append = false) => {
    if (!data) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${today}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          append,
          blocks: chosenBlocks,
          title: presetLabel(menu, chosenBlocks),
          items: picked,
          problems: Object.fromEntries(
            Object.entries(data.suggestedProblems ?? {}).map(([task, ps]) => [
              task,
              ps.map((p) => p.id),
            ]),
          ),
          challenges: Object.fromEntries(
            Object.entries(data.suggestedStories ?? {}).map(([task, cs]) => [
              task,
              cs.map((c) => c.id),
            ]),
          ),
          questions: Object.fromEntries(
            Object.entries(data.suggestedQuestions ?? {}).map(([task, qs]) => [
              task,
              qs.map((q) => q.id),
            ]),
          ),
        }),
      });
      if (!res.ok) throw new Error();
      setChosenBlocks([]);
      await refresh();
    } catch {
      setError(append ? '添加失败，稍后重试' : '创建失败，稍后重试');
    } finally {
      setCreating(false);
    }
  };

  if (todayExists) {
    const missing = (menu?.blocks ?? []).filter((b) => !already.has(b.name));
    if (missing.length === 0) return null;
    return (
      <TopUp
        missing={missing}
        chosen={chosenBlocks}
        setChosen={setChosenBlocks}
        onAdd={() => void create(true)}
        busy={creating}
        error={error}
        ready={!!data}
      />
    );
  }

  if (!data) return null;

  if (!chosen && (menu?.blocks.length ?? 0) === 0) {
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
        {menu && missingRequired(menu, chosenBlocks).length > 0 && (
          <p className="text-[11px] text-amber-700 mt-1">
            没排{' '}
            {missingRequired(menu, chosenBlocks)
              .map((b) => b.name)
              .join('、')}
            —— 这项基本上是每天都该有的
          </p>
        )}
      </header>

      <div className="p-4 space-y-3">
        {chosen?.tasks && chosen.tasks.length > 0 ? (
          <>
            <p className="text-xs text-stone-500">
              下面每项的具体内容都是自动挑的，也都能换。
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
                  questions={data.suggestedQuestions?.[task.name] ?? []}
                  challenges={data.suggestedStories?.[task.name] ?? []}
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
            今天还什么都没选。展开下面的清单挑几项，或者点一个快捷组合。
          </p>
        )}

        {menu && (
          <>
            <button
              type="button"
              onClick={() => setShowMenu((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showMenu ? 'rotate-180' : ''}`}
              />
              {showMenu ? '收起' : `改今天的组成（已选 ${chosenBlocks.length} 项）`}
            </button>

            {showMenu && (
              <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-stone-400 mr-0.5">快捷组合</span>
                  {menu.presets.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      title={pr.note}
                      onClick={() => setChosenBlocks(withRequired(menu, pr.blocks))}
                      className="text-[11px] px-2 py-1 rounded border border-stone-300 bg-white hover:border-indigo-400 hover:text-indigo-700"
                    >
                      {pr.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setChosenBlocks(withRequired(menu, []))}
                    className="text-[11px] px-2 py-1 rounded border border-stone-300 bg-white hover:border-stone-500 text-stone-500"
                  >
                    清空
                  </button>
                </div>

                {groupByTrack(menu.blocks).map(([track, blocks]) => (
                  <div key={track}>
                    <div className="text-[10px] uppercase tracking-wider text-stone-400 font-medium mb-1">
                      {menu.trackTypes[track]?.emoji ?? '·'}{' '}
                      {menu.trackTypes[track]?.label ?? track}
                    </div>
                    <div className="grid lg:grid-cols-2 gap-1.5">
                      {blocks.map((b) => (
                        <BlockOption
                          key={b.id}
                          block={b}
                          checked={chosenBlocks.includes(b.id)}
                          onToggle={() =>
                            setChosenBlocks((cur) =>
                              cur.includes(b.id)
                                ? cur.filter((x) => x !== b.id)
                                : [...cur, b.id],
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => void create()}
            disabled={chosenBlocks.length === 0 || creating}
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
  questions,
  challenges,
}: {
  task: PlanTaskLite;
  emoji: string;
  trackLabel: string;
  pickedId?: string;
  choice?: ItemChoiceLite;
  suggested?: SuggestedItem;
  isSwapping: boolean;
  onToggleSwap: () => void;
  onPick: (id: string) => void;
  candidates: ItemChoiceLite[];
  /** For 刷题 slots: the concrete problems picked for each checkbox. */
  problems: SuggestedProblem[];
  /** For 题库 slots: the concrete questions picked for each checkbox. */
  questions: SuggestedQuestion[];
  /** For 简历深挖 slots: tonight's challenges. */
  challenges: SuggestedStoryQuestion[];
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
            ) : questions.length > 0 ? (
              <p className="text-xs text-stone-700 mt-0.5">
                → {title}
                {suggested?.resumedFrom && (
                  <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-700">
                    接着 {suggested.resumedFrom.slice(5)} 没做完的
                  </span>
                )}
              </p>
            ) : title ? (
              <p className="text-xs text-stone-700 mt-0.5">
                → {title}
                {suggested?.resumedFrom && (
                  <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-700">
                    接着 {suggested.resumedFrom.slice(5)} 没做完的
                  </span>
                )}
                {touches > 0 && !suggested?.resumedFrom && (
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
          {problems.length === 0 && questions.length === 0 && challenges.length === 0 && (
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

        {challenges.length > 0 && (
          <ul className="mt-2 ml-6 space-y-1.5">
            {challenges.map((c) => (
              <li key={c.id} className="text-[11px] leading-relaxed">
                <span
                  className={`inline-block px-1 rounded mr-1 ${
                    c.lens === '后果'
                      ? 'bg-rose-100 text-rose-800 font-medium'
                      : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {c.lens}
                </span>
                <span className="text-stone-700">{c.q}</span>
                <span className="block text-stone-400 ml-6">{c.reason}</span>
              </li>
            ))}
          </ul>
        )}

        {questions.length > 0 && (
          <ul className="mt-2 ml-6 space-y-1">
            {questions.map((q) => (
              <li key={q.id} className="text-[11px] leading-relaxed">
                <span
                  className={`inline-block px-1 rounded mr-1 ${
                    q.kind === 'redo'
                      ? 'bg-rose-100 text-rose-800 font-medium'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {q.kind === 'redo' ? '待重做' : '新题'}
                </span>
                <a
                  href={q.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-stone-700 hover:text-indigo-700 underline decoration-stone-300 decoration-dotted underline-offset-2"
                >
                  {q.question}
                </a>
                <span className="block text-stone-400 ml-6">{q.reason}</span>
              </li>
            ))}
          </ul>
        )}

        {problems.length > 0 && (
          <ul className="mt-2 ml-6 space-y-1">
            {problems.map((p) => (
              <li key={p.id} className="text-[11px] leading-relaxed">
                <span
                  className={`inline-block px-1 rounded mr-1 ${
                    p.flagged
                      ? 'bg-rose-100 text-rose-800 font-medium'
                      : p.kind === 'review'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {p.flagged ? '待重做' : p.kind === 'review' ? '重做' : '新题'}
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

/** Required blocks are never really optional — always fold them back in. */
function withRequired(menu: BlocksResponse, ids: string[]): string[] {
  const required = menu.blocks.filter((b) => b.required).map((b) => b.id);
  return [...new Set([...required, ...ids])];
}

function missingRequired(menu: BlocksResponse, ids: string[]): BlockLite[] {
  return menu.blocks.filter((b) => b.required && !ids.includes(b.id));
}

function presetLabel(menu: BlocksResponse | null, ids: string[]): string {
  const hit = menu?.presets.find(
    (p) =>
      p.blocks.length === ids.length && p.blocks.every((b) => ids.includes(b)),
  );
  return hit ? `自选 · ${hit.label}` : '自选';
}

function groupByTrack(blocks: BlockLite[]): [string, BlockLite[]][] {
  const out: [string, BlockLite[]][] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last[0] === b.track) last[1].push(b);
    else out.push([b.track, [b]]);
  }
  return out;
}

/** "20 天前" / "还没做过" — the number that should drive tonight's pick. */
function staleLabel(b: BlockLite): { text: string; tone: string } {
  if (b.daysSince === undefined) {
    return { text: '还没做过', tone: 'text-stone-400' };
  }
  if (b.daysSince === 0) return { text: '今天做过', tone: 'text-emerald-600' };
  const text = `${b.daysSince} 天没做`;
  if (b.daysSince >= 14) return { text, tone: 'text-rose-600 font-medium' };
  if (b.daysSince >= 7) return { text, tone: 'text-amber-600' };
  return { text, tone: 'text-stone-400' };
}

function BlockOption({
  block,
  checked,
  onToggle,
}: {
  block: BlockLite;
  checked: boolean;
  onToggle: () => void;
}) {
  const stale = staleLabel(block);
  return (
    <label
      className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
        checked
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-stone-200 bg-white hover:border-stone-400'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 accent-indigo-600"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium text-stone-800">{block.name}</span>
          {block.required && (
            <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 shrink-0">
              必选
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] mt-0.5 flex-wrap">
          <span className="text-stone-400 font-mono shrink-0">
            {block.units}×{block.target ?? ''} · {block.minutes}min
          </span>
          <span className={`${stale.tone} inline-flex items-center gap-0.5 shrink-0`}>
            <Clock className="w-2.5 h-2.5" />
            {stale.text}
          </span>
        </span>
        {block.desc && (
          <span className="block text-[11px] text-stone-500 leading-snug mt-1">
            {block.desc}
          </span>
        )}
        {block.covers && block.covers.length > 0 && (
          <span className="block text-[10px] text-stone-400 mt-1 leading-snug">
            对应总览：{block.covers.join(' · ')}
          </span>
        )}
      </span>
    </label>
  );
}
