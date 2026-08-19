'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  OUTCOME_LABEL,
  OUTCOME_ORDER,
  Outcome,
  nextInterval,
} from '@shared/interview/leetcode';

/**
 * The four-way outcome recorder for one LeetCode checkbox.
 *
 * Recording is what drives the spaced repetition schedule, so it shows the
 * consequence inline ("→ 3 天后再来") — otherwise it is not obvious why being
 * honest about a bad attempt is worth it.
 */

const TONE: Record<Outcome, string> = {
  failed: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
  'used-solution':
    'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200',
  struggled: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
  clean: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
  unknown: '',
};

const ACTIVE: Record<Outcome, string> = {
  failed: 'bg-red-600 text-white border-red-600',
  'used-solution': 'bg-orange-500 text-white border-orange-500',
  struggled: 'bg-amber-500 text-white border-amber-500',
  clean: 'bg-emerald-600 text-white border-emerald-600',
  unknown: '',
};

export function ProblemOutcome({
  problemId,
  title,
  url,
  current,
  date,
  onRecorded,
}: {
  problemId: number;
  title?: string;
  url?: string;
  current?: Outcome;
  /** The day being recorded against — the log entry is keyed by it. */
  date: string;
  onRecorded: (outcome: Outcome | null) => void;
}) {
  const [saving, setSaving] = useState<Outcome | null>(null);
  const [error, setError] = useState(false);

  const record = async (outcome: Outcome) => {
    const next = current === outcome ? null : outcome;
    setSaving(outcome);
    setError(false);
    try {
      const res = await fetch('/api/interview/leetcode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, outcome: next, date }),
      });
      if (!res.ok) throw new Error();
      onRecorded(next);
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-stone-400">这题做得怎么样</span>
        {OUTCOME_ORDER.map((o) => {
          const active = current === o;
          const days = nextInterval(undefined, o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => record(o)}
              disabled={saving !== null}
              title={
                active
                  ? '再点一次取消记录'
                  : `记录后约 ${days} 天再安排复习`
              }
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                active ? ACTIVE[o] : TONE[o]
              }`}
            >
              {saving === o && <Loader2 className="w-3 h-3 animate-spin" />}
              {OUTCOME_LABEL[o]}
            </button>
          );
        })}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-indigo-600"
            title={title ? `打开 #${problemId} ${title}` : `打开 #${problemId}`}
          >
            <ExternalLink className="w-3 h-3" />
            题目
          </a>
        )}
        {error && <span className="text-[11px] text-red-600">保存失败</span>}
      </div>
      {current && (
        <p className="text-[10px] text-stone-400 mt-1">
          已记录「{OUTCOME_LABEL[current]}」·{' '}
          {current === 'clean'
            ? '这类会被推得越来越远，连续两次完美且间隔超过 90 天就不再安排'
            : `约 ${nextInterval(undefined, current)} 天后会再出现在推荐里`}
        </p>
      )}
    </div>
  );
}
