'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  OUTCOME_LABEL,
  OUTCOME_ORDER,
  Outcome,
  nextInterval,
  parseProblemUnit,
} from '@shared/interview/leetcode';
import { UnitStatus } from '@/types/interview';

/**
 * One checkbox of a task — and the record of what actually happened on it.
 *
 * This is the deliberate difference from the training log. There, tapping a set
 * means "did it" and that is the whole story. Here a slot is an hour of open-
 * ended work, so tapping opens a box asking what you did and how it went; the
 * status is a by-product of that answer, not the point of the interaction.
 */

const GENERIC: { status: UnitStatus; label: string; tone: string; active: string }[] =
  [
    {
      status: 'done',
      label: '做完了',
      tone: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
      active: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      status: 'partial',
      label: '打了折',
      tone: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
      active: 'bg-amber-500 text-white border-amber-500',
    },
    {
      status: 'pending',
      label: '没做',
      tone: 'bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200',
      active: 'bg-stone-600 text-white border-stone-600',
    },
  ];

const OUTCOME_TONE: Record<Outcome, string> = {
  failed: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
  'used-solution':
    'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200',
  struggled: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
  clean:
    'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
  unknown: '',
};
const OUTCOME_ACTIVE: Record<Outcome, string> = {
  failed: 'bg-red-600 text-white border-red-600',
  'used-solution': 'bg-orange-500 text-white border-orange-500',
  struggled: 'bg-amber-500 text-white border-amber-500',
  clean: 'bg-emerald-600 text-white border-emerald-600',
  unknown: '',
};

/** Split `#27 移除元素 · 磕磕绊绊 · 二分边界写错了` into its three parts. */
function decompose(trailing: string): {
  problemId?: number;
  head: string;
  outcome?: Outcome;
  note: string;
} {
  const raw = trailing.trim();
  const parsed = parseProblemUnit(raw);
  if (!parsed) return { head: '', note: raw };

  const parts = raw.split('·').map((p) => p.trim());
  const head = parts[0] ?? '';
  let outcome: Outcome | undefined;
  const rest: string[] = [];
  for (const p of parts.slice(1)) {
    const hit = OUTCOME_ORDER.find((o) => OUTCOME_LABEL[o] === p);
    if (hit && !outcome) outcome = hit;
    else rest.push(p);
  }
  return { problemId: parsed.id, head, outcome, note: rest.join(' · ') };
}

function compose(
  head: string,
  outcome: Outcome | undefined,
  note: string,
): string {
  // A checkbox is exactly one markdown line. A newline in the note would end
  // the list item and orphan every later unit, so fold them into separators.
  const flat = note.replace(/\s*[\r\n]+\s*/g, ' / ').trim();
  const parts = [head, outcome ? OUTCOME_LABEL[outcome] : '', flat]
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? ` ${parts.join(' · ')}` : ' ';
}

export function UnitRecord({
  index,
  status,
  trailing,
  dateStr,
  problemTopic,
  problemUrl,
  onChange,
}: {
  index: number;
  status: UnitStatus;
  trailing: string;
  /** The day this record belongs to — LeetCode attempts are keyed by it. */
  dateStr: string;
  /**
   * problemId → 中文专题名. Revealed only once an outcome is recorded: telling
   * you it's a sliding-window problem before you solve it is half the answer.
   */
  problemTopic?: Record<number, string>;
  /** problemId → 真实题目页地址（题库带的），比搜索页直达。 */
  problemUrl?: Record<number, string>;
  onChange: (status: UnitStatus, trailing: string) => void;
}) {
  const parts = decompose(trailing);
  const isProblem = parts.problemId !== undefined;

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(parts.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Opening is the point of the interaction — put the cursor in the box.
  useEffect(() => {
    if (open) noteRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setNote(decompose(trailing).note);
  }, [trailing, open]);

  const recordAttempt = async (outcome: Outcome | null) => {
    if (!isProblem) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch('/api/interview/leetcode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: parts.problemId,
          outcome,
          date: dateStr,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      // The overview computes topic progress from leetcode-log.json, which the
      // server just rewrote — tell it to re-read so the bars move now.
      window.dispatchEvent(new CustomEvent('interview:leetcode-updated'));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const pickOutcome = async (o: Outcome) => {
    const next = parts.outcome === o ? undefined : o;
    onChange(
      next ? (next === 'clean' ? 'done' : 'partial') : 'pending',
      compose(parts.head, next, note),
    );
    await recordAttempt(next ?? null);
  };

  const pickStatus = (s: UnitStatus) => {
    onChange(s, compose(parts.head, parts.outcome, note));
  };

  const commitNote = () => {
    onChange(status, compose(parts.head, parts.outcome, note));
  };

  const chipColor =
    status === 'done'
      ? 'bg-indigo-600 text-white border-indigo-600'
      : status === 'partial'
        ? 'bg-amber-400 text-stone-900 border-amber-500'
        : 'bg-white text-stone-500 border-stone-300 hover:border-stone-500';

  const summary = parts.note || (parts.outcome ? OUTCOME_LABEL[parts.outcome] : '');

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-white/70 rounded-lg transition-colors"
      >
        <span
          className={`w-7 h-7 shrink-0 rounded-md border font-mono text-xs font-semibold flex items-center justify-center ${chipColor}`}
        >
          {index}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={`block text-sm leading-snug ${
              status === 'done' ? 'text-stone-400' : 'text-stone-800'
            }`}
          >
            {parts.head || (
              <span className="text-stone-400 italic">点开记录做了什么</span>
            )}
          </span>
          {summary && (
            <span className="block text-[11px] text-stone-500 mt-0.5 truncate">
              {summary}
            </span>
          )}
        </span>
        <span className="text-stone-400 text-xs shrink-0 mt-1">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-stone-200 space-y-2">
          {isProblem ? (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-stone-400">做得怎么样</span>
                {OUTCOME_ORDER.map((o) => {
                  const active = parts.outcome === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => pickOutcome(o)}
                      disabled={saving}
                      title={`记录后约 ${nextInterval(undefined, o)} 天再安排复习`}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                        active ? OUTCOME_ACTIVE[o] : OUTCOME_TONE[o]
                      }`}
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  );
                })}
                {saving && (
                  <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                )}
                <a
                  href={
                    (parts.problemId !== undefined &&
                      problemUrl?.[parts.problemId]) ||
                    `https://leetcode.cn/problems/?q=${parts.problemId}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-indigo-600"
                >
                  <ExternalLink className="w-3 h-3" />
                  题目
                </a>
              </div>
              {parts.outcome ? (
                <div className="mt-1.5 space-y-1">
                  {parts.problemId !== undefined &&
                    problemTopic?.[parts.problemId] && (
                      <p className="text-[11px]">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                          考察：{problemTopic[parts.problemId]}
                        </span>
                      </p>
                    )}
                  <p className="text-[10px] text-stone-400">
                    {parts.outcome === 'clean'
                      ? '连续两次完美且间隔超过 90 天才退出轮转'
                      : `约 ${nextInterval(undefined, parts.outcome)} 天后会再出现在推荐里`}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-stone-400 mt-1">
                  先做，做完记录结果后才会揭晓这题考察什么
                </p>
              )}
              {error && (
                <p className="text-[11px] text-red-600 mt-1">刷题记录保存失败</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-stone-400">结果</span>
              {GENERIC.map((g) => (
                <button
                  key={g.status}
                  type="button"
                  onClick={() => pickStatus(g.status)}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                    status === g.status ? g.active : g.tone
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">
              具体做了什么 · 结果如何
            </label>
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value.replace(/·/g, '・'))}
              onBlur={commitNote}
              rows={2}
              placeholder={
                isProblem
                  ? '例：一次过，但边界条件想了很久'
                  : '例：改完 AI 段落 3 条，70% 那条还没想好怎么说'
              }
              className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
}
