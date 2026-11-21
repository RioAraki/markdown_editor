'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useInterview } from '@/contexts/InterviewContext';
import type { AbilityReport, TopicAbility } from '@shared/interview/ability';
import type { LcProfile } from '@shared/interview/lcSync';
import { PLACEMENT_SD } from '@shared/interview/adaptive';
import type { AbilityComparison, TopicChange } from '@shared/interview/abilityHistory';
import { OUTCOME_LABEL } from '@shared/interview/leetcode';

interface AbilityResponse {
  comparison: AbilityComparison;
  today: string;
  ability: AbilityReport;
  profile: LcProfile | null;
  lastSyncAt: string | null;
  deepSyncedAt: string | null;
  deepAvailable: boolean;
  inbox: { id: number; title: string; date: string; rating?: number; topics: string[] }[];
  counts: { done: number; flagged: number; inbox: number };
}

interface SyncResult {
  added: { id: number; title: string; date: string }[];
  missed: number;
  deepCount?: number;
  changes?: { name: string; delta: number }[];
  error?: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const MIN = 1500;
const MAX = 2300;
const CX = 200;
const CY = 190;
const R = 135;

function ago(iso: string | null): string {
  if (!iso) return '从未同步';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} 小时前`;
  return `${Math.round(mins / 60 / 24)} 天前`;
}

/**
 * Radar of per-topic ability, with a σ band, clickable axes, and the last
 * sync's shape as a dashed outline. A round usually moves a topic by a few
 * points, too little to see, so each axis label also carries its change.
 */
function Radar({
  topics,
  selected,
  onSelect,
  band,
  before,
}: {
  topics: TopicAbility[];
  selected?: string;
  onSelect: (id: string) => void;
  band: boolean;
  before?: Map<string, number>;
}) {
  const n = topics.length;
  const pt = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = R * Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  };
  const poly = (f: (t: TopicAbility) => number) =>
    topics.map((t, i) => pt(i, f(t)).join(',')).join(' ');
  return (
    <svg viewBox="0 0 400 380" className="w-full max-w-[380px] mx-auto block" role="img" aria-label="各考点能力雷达图">
      {[1600, 1800, 2000, 2200].map((lv) => (
        <g key={lv}>
          <polygon points={topics.map((_, i) => pt(i, lv).join(',')).join(' ')} fill="none" stroke="#e7e5e4" />
          <text x={pt(0, lv)[0] + 4} y={pt(0, lv)[1] + 3} fontSize={9} fill="#a8a29e">{lv}</text>
        </g>
      ))}
      {topics.map((t, i) => {
        const [x, y] = pt(i, MAX);
        const [lx, ly] = pt(i, MAX + 120);
        const weak = t.sd > PLACEMENT_SD;
        const delta = before?.has(t.id) ? t.theta - before.get(t.id)! : 0;
        return (
          <g key={t.id} onClick={() => onSelect(t.id)} className="cursor-pointer">
            <line x1={CX} y1={CY} x2={x} y2={y} stroke="#e7e5e4" />
            <text
              x={lx}
              y={ly}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={selected === t.id ? '#4f46e5' : weak ? '#94a3b8' : '#334155'}
              fontWeight={selected === t.id ? 600 : 400}
            >
              {t.name}
              {delta !== 0 && (
                <tspan fill={delta > 0 ? '#047857' : '#be123c'} fontWeight={600}>
                  {` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
      {band && (
        <>
          <polygon points={poly((t) => t.theta + t.sd)} fill="#6366f1" fillOpacity={0.08} stroke="#a5b4fc" strokeDasharray="3 3" />
          <polygon points={poly((t) => t.theta - t.sd)} fill="#ffffff" fillOpacity={0.85} stroke="#a5b4fc" strokeDasharray="3 3" />
        </>
      )}
      {before && (
        <polygon
          points={poly((t) => before.get(t.id) ?? t.theta)}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      <polygon points={poly((t) => t.theta)} fill="#6366f1" fillOpacity={0.18} stroke="#4f46e5" strokeWidth={2} />
      {topics.map((t, i) => {
        const [x, y] = pt(i, t.theta);
        return (
          <circle
            key={t.id}
            cx={x}
            cy={y}
            r={selected === t.id ? 5 : 3.5}
            fill={t.sd > PLACEMENT_SD ? '#ffffff' : '#4f46e5'}
            stroke="#4f46e5"
            onClick={() => onSelect(t.id)}
            className="cursor-pointer"
          >
            <title>{`${t.name} ${t.theta} ± ${t.sd}（${t.n} 题）`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

/** Per-topic change since the last sync, biggest first, each split by problem. */
function ChangeTable({ comparison }: { comparison: AbilityComparison }) {
  const rows = comparison.topics
    .filter((t) => t.delta !== 0 || t.problems.length > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const since = comparison.trigger === 'baseline'
    ? '同步导入前'
    : `上次同步（${comparison.since.slice(5, 10)}）`;
  return (
    <div className="mx-3 mb-3 rounded-md border border-stone-200 p-2.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-stone-700">本轮变化</span>
        <span className="text-[11px] text-stone-400">
          相对{since} · 综合 {comparison.global.before} → {comparison.global.after}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="mt-1.5 text-[11px] text-stone-400">还没有变化</div>
      ) : (
        <div className="mt-1 divide-y divide-stone-100">
          {rows.map((t) => <ChangeRow key={t.id} t={t} attributed={comparison.attributed} />)}
        </div>
      )}
      {!comparison.attributed && (
        <div className="mt-1.5 text-[11px] text-stone-400">
          这轮有 {comparison.changed} 道题的记录变了（多半是首次深度同步），只显示总变化，不逐题拆分
        </div>
      )}
    </div>
  );
}

function ChangeRow({ t, attributed }: { t: TopicChange; attributed: boolean }) {
  // Changes well inside σ are mostly noise; show them faintly.
  const faint = Math.abs(t.delta) < t.sd / 2;
  const tone = t.delta > 0
    ? (faint ? 'text-emerald-500' : 'text-emerald-700')
    : t.delta < 0 ? (faint ? 'text-rose-400' : 'text-rose-700') : 'text-stone-400';
  const detail = attributed && (t.problems.length > 0 || t.other !== 0);
  const head = (
    <span className="flex items-center justify-between gap-2 text-[12px]">
      <span className="truncate text-stone-700">
        {t.name}
        <span className="ml-1.5 font-mono text-[10px] text-stone-400">{t.before} → {t.after} ±{t.sd}</span>
      </span>
      <span className={`shrink-0 font-mono font-semibold ${tone}`}>
        {signed(t.delta)}
        {faint && t.delta !== 0 && <span className="ml-1 text-[10px] font-normal text-stone-400">误差内</span>}
      </span>
    </span>
  );
  if (!detail) return <div className="py-1.5">{head}</div>;
  return (
    <details className="py-1.5">
      <summary className="cursor-pointer list-none">{head}</summary>
      <div className="mt-1 ml-1 pl-2 border-l-2 border-stone-200 space-y-0.5 text-[11px]">
        {t.problems.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-stone-600">
              #{p.id} {p.title}
              <span className="text-stone-400">
                {p.rating ? ` · ${p.rating}${p.estimated ? '（估）' : ''}` : ''}
                {p.outcome ? ` · ${OUTCOME_LABEL[p.outcome]}` : ''}
              </span>
            </span>
            <span className="shrink-0 font-mono">
              {p.pending ? (
                <span className="text-stone-400" title="还没注解，暂不计分；括号里是标「看了答案」和「比较完美」后的变化">
                  待注解 {signed(p.pending.usedSolution)} ~ {signed(p.pending.clean)}
                </span>
              ) : (
                <span className={p.delta > 0 ? 'text-emerald-700' : p.delta < 0 ? 'text-rose-700' : 'text-stone-400'}>
                  {signed(p.delta)}
                </span>
              )}
            </span>
          </div>
        ))}
        {t.other !== 0 && (
          <div className="flex justify-between gap-2 text-stone-400">
            <span>其他（整体联动、时间衰减、竞赛分）</span>
            <span className="font-mono">{signed(t.other)}</span>
          </div>
        )}
      </div>
    </details>
  );
}

function Bar({ label, theta, sd, n }: { label: string; theta: number; sd: number; n: number }) {
  const w = Math.max(2, Math.min(100, ((theta - MIN) / (MAX - MIN)) * 100));
  const weak = sd > PLACEMENT_SD;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 truncate text-stone-600" title={label}>{label}</span>
      <span className="flex-1 h-1.5 rounded bg-stone-100 overflow-hidden">
        <span className={`block h-full ${weak ? 'bg-stone-300' : 'bg-indigo-400'}`} style={{ width: `${w}%` }} />
      </span>
      <span className={`font-mono w-28 text-right shrink-0 ${weak ? 'text-stone-400' : 'text-stone-500'}`}>
        {theta}±{sd} · {n}题
      </span>
    </div>
  );
}

export function AbilityPanel() {
  const { saveNow, refresh, setSelectedDate } = useInterview();
  const [data, setData] = useState<AbilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<'public' | 'deep' | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [band, setBand] = useState(true);
  const [showAllInbox, setShowAllInbox] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/interview/leetcode/ability', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as AbilityResponse;
      setData(d);
      setError(null);
      setSelected((cur) => cur ?? [...d.ability.topics].sort((a, b) => a.theta - b.theta)[0]?.id);
    } catch {
      setError('能力分加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener('interview:leetcode-updated', h);
    return () => window.removeEventListener('interview:leetcode-updated', h);
  }, [load]);

  const sync = async (mode: 'public' | 'deep') => {
    setSyncing(mode);
    setResult(null);
    try {
      // Unsaved edits first: the sync writes day files, and the editor's
      // conflict check would otherwise throw your typing away.
      await saveNow();
      const res = await fetch('/api/interview/leetcode/sync-lc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as SyncResult;
      if (!res.ok) {
        setResult({ added: [], missed: 0, error: body.error ?? '同步失败' });
        return;
      }
      setResult(body);
      if (body.added.length > 0) await refresh();
      window.dispatchEvent(new CustomEvent('interview:leetcode-updated'));
    } catch {
      setResult({ added: [], missed: 0, error: '网络中断，稍后重试' });
    } finally {
      setSyncing(null);
    }
  };

  if (error) {
    return <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-rose-600">{error}</div>;
  }
  if (!data) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-500 flex items-center">
        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> 计算能力分…
      </div>
    );
  }

  const { ability, profile } = data;
  const topic = ability.topics.find((t) => t.id === selected);
  const inbox = showAllInbox ? data.inbox : data.inbox.slice(0, 6);
  const before = new Map(data.comparison.topics.map((t) => [t.id, t.before]));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-start justify-between gap-2 px-3 pt-3">
          <div>
            <div className="text-[13px] font-medium text-stone-800">🧩 算法能力</div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              综合 <b className="text-stone-700">{ability.global.theta}±{ability.global.sd}</b>
              {profile?.contestRating ? ` · 竞赛分 ${profile.contestRating}` : ''}
              {profile ? ` · leetcode.cn ${profile.ac.total} AC` : ''}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void sync('public')}
              disabled={!!syncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              title="拉取 leetcode.cn 最近 15 条 AC，写进对应日期的记录"
            >
              <RefreshCw className={`w-3 h-3 ${syncing === 'public' ? 'animate-spin' : ''}`} />
              同步 leetcode.cn
            </button>
            {data.deepAvailable && (
              <button
                type="button"
                onClick={() => void sync('deep')}
                disabled={!!syncing}
                className="text-[11px] text-stone-500 hover:text-indigo-700 disabled:opacity-50"
                title="用登录 cookie 拉取全部做题记录（含提交次数），补齐公开接口看不到的部分"
              >
                {syncing === 'deep' ? '深度同步中…' : '深度同步'}
              </button>
            )}
          </div>
        </div>
        <div className="px-3 pt-1 text-[11px] text-stone-400">
          上次同步：{ago(data.lastSyncAt)}
          {data.deepSyncedAt ? ` · 深度同步：${ago(data.deepSyncedAt)}` : ''}
        </div>
        {result && (
          <div className={`mx-3 mt-2 rounded px-2 py-1.5 text-[11px] ${result.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {result.error ? result.error : result.added.length > 0
              ? `新增 ${result.added.length} 题：${result.added.map((a) => `#${a.id}`).join(' ')}`
              : '没有新的 AC'}
            {result.deepCount !== undefined && ` · 深度同步读到 ${result.deepCount} 题`}
            {!result.error && result.changes && result.changes.length > 0 && (
              <span className="block mt-0.5">
                {result.changes.filter((c) => Math.abs(c.delta) >= 3).slice(0, 4)
                  .map((c) => `${c.name} ${signed(c.delta)}`).join(' · ') || '各考点变化都小于 3'}
                {result.added.length > 0 && (
                  <span className="text-emerald-700">；新题记得注解，标完分数会再变</span>
                )}
              </span>
            )}
            {!result.error && result.missed > 0 && (
              <span className="block text-amber-700 mt-0.5">
                主页 AC 数比同步到的多 {result.missed} 题（公开接口只给最近 15 条）
                {data.deepAvailable ? '，点「深度同步」补齐' : '；配置 LEETCODE_SESSION 后可深度同步补齐'}
              </span>
            )}
          </div>
        )}

        <div className="px-2 pt-1">
          <Radar topics={ability.topics} selected={selected} onSelect={setSelected} band={band} before={before} />
        </div>
        <div className="px-3 pb-2 flex items-center justify-between gap-2 text-[11px] text-stone-400">
          <span>
            空心点 = 数据少、还在定级（σ &gt; {PLACEMENT_SD}）
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block w-3 border-t-2 border-dashed border-slate-400" />上次同步
            </span>
          </span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={band} onChange={(e) => setBand(e.target.checked)} />
            不确定带
          </label>
        </div>

        <ChangeTable comparison={data.comparison} />

        {topic && (
          <div className="mx-3 mb-3 rounded-md border border-stone-200 p-2.5 space-y-1.5">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium text-stone-700">{topic.name}</span>
              <span className="font-mono text-[11px] text-stone-500">
                {topic.theta}±{topic.sd} · {topic.n} 题
                {topic.lastPracticed ? ` · 上次 ${topic.lastPracticed}` : ''}
              </span>
            </div>
            {topic.sections.map((s) => (
              <Bar key={s.key} label={s.name} theta={s.theta} sd={s.sd} n={s.n} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-stone-800">待注解</span>
          <span className="text-[11px] text-stone-400">
            同步进来的题 · 点开那天记一下做得怎么样（可跳过）
          </span>
        </div>
        {data.inbox.length === 0 ? (
          <div className="mt-2 text-[11px] text-stone-400">没有待注解的题</div>
        ) : (
          <div className="mt-2 space-y-1">
            {inbox.map((it) => (
              <button
                key={`${it.id}@${it.date}`}
                type="button"
                onClick={() => setSelectedDate(it.date)}
                className="w-full flex items-center justify-between gap-2 rounded border border-stone-200 px-2 py-1.5 text-left text-[12px] hover:bg-stone-50"
              >
                <span className="truncate">#{it.id} {it.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-stone-400">
                  {it.date.slice(5)}{it.rating ? ` · ${it.rating}` : ''}
                </span>
              </button>
            ))}
            {data.inbox.length > inbox.length && (
              <button type="button" onClick={() => setShowAllInbox(true)} className="text-[11px] text-indigo-600">
                还有 {data.inbox.length - inbox.length} 题…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
