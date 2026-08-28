'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Trash2 } from 'lucide-react';
import {
  GRADE_HINT,
  Grade,
  STATUS_LABEL,
  StoryAnswer,
  StoryQuestion,
} from '@shared/interview/stories';
import { UnitStatus } from '@/types/interview';
import type { Resume } from '@shared/interview/resume';
import { AttemptHistory } from './AttemptHistory';
import { ResumeAnchor } from './ResumeLine';

/**
 * One resume challenge in a day's log.
 *
 * Not the generic 做完了/打了折 box and not the LeetCode outcome scale: the
 * artifact here is the answer itself, so the box is the answer, and status is
 * derived from what the file holds rather than asked for. The one judgement
 * you make by hand is the last rung — 说得出来 — because only you know whether
 * you actually said it out loud without the script.
 */

export interface ChallengeMeta extends StoryQuestion {
  storyId: string;
  storyTitle: string;
  clusterTitle: string;
  /** The resume line this cluster interrogates. */
  resumeAnchor?: string;
}

const GRADE_TONE: Record<Grade, string> = {
  A: 'bg-emerald-600 text-white',
  B: 'bg-lime-600 text-white',
  C: 'bg-amber-500 text-white',
  F: 'bg-rose-600 text-white',
};

const LENS_TONE: Record<string, string> = {
  后果: 'bg-rose-100 text-rose-700',
  归属: 'bg-violet-100 text-violet-700',
  成本: 'bg-amber-100 text-amber-700',
};

const AUTOSAVE_MS = 1500;

export function ChallengeRecord({
  index,
  status,
  trailing,
  meta,
  saved,
  resume,
  onChange,
}: {
  index: number;
  status: UnitStatus;
  trailing: string;
  /** The resume itself, so a challenge can show what it is challenging. */
  resume?: Resume;
  /** questionId → what the bank says about it. */
  meta?: Record<string, ChallengeMeta>;
  /** questionId → what the story file already holds. */
  saved?: Record<string, StoryAnswer>;
  onChange: (status: UnitStatus, trailing: string) => void;
}) {
  const id = /^\[([a-z]{2}-[a-z]+-\d+)\]/.exec(trailing.trim())?.[1];
  const q = id ? meta?.[id] : undefined;
  const rec = id ? saved?.[id] : undefined;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setText(rec?.answer ?? '');
  }, [rec?.answer]);

  const write = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!q) return;
      setSaving(true);
      try {
        const res = await fetch('/api/interview/stories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: q.storyId, questionId: q.id, ...patch }),
        });
        if (!res.ok) throw new Error();
        dirty.current = false;
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        window.dispatchEvent(new CustomEvent('interview:stories-updated'));
      } catch {
        /* leave the text on screen; the next keystroke retries */
      } finally {
        setSaving(false);
      }
    },
    [q],
  );

  // Losing a paragraph of a considered answer would be the one unforgivable
  // bug here, so it saves while you type rather than on blur.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void write({ answer: text }), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [text, write]);

  // The checkbox mirrors the file: written → [/], 说得出来 → [x].
  const st = rec?.status ?? (text.trim() ? 'draft' : 'todo');
  const want: UnitStatus =
    st === 'spoken' ? 'done' : st === 'todo' ? 'pending' : 'partial';
  useEffect(() => {
    if (status !== want) onChange(want, trailing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  if (!id) return null;

  const chip =
    st === 'spoken'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : st === 'flagged'
        ? 'bg-amber-500 text-white border-amber-500'
        : st === 'draft'
          ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
          : 'bg-white text-stone-500 border-stone-300';

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-white/70 rounded-lg transition-colors"
      >
        <span
          className={`w-7 h-7 shrink-0 rounded-md border font-mono text-xs font-semibold flex items-center justify-center ${chip}`}
        >
          {index}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] leading-snug text-stone-800">
            {q?.q ?? trailing.trim()}
          </span>
          <span className="block text-[11px] text-stone-500 mt-1">
            {q && (
              <span
                className={`px-1 rounded mr-1 ${LENS_TONE[q.lens] ?? 'bg-stone-200 text-stone-600'}`}
              >
                {q.lens}
              </span>
            )}
            {rec?.grade && (
              <span className={`px-1 rounded mr-1 font-bold ${GRADE_TONE[rec.grade]}`}>
                {rec.grade}
              </span>
            )}
            {q?.clusterTitle && (
              <span className="text-stone-400 mr-1">{q.clusterTitle} ·</span>
            )}
            <span className="text-stone-400">{STATUS_LABEL[st]}</span>
            {rec?.gaps?.[0] && (
              <span className="text-amber-700"> · {rec.gaps[0]}</span>
            )}
          </span>
        </span>
        <span className="text-stone-400 text-xs shrink-0 mt-1">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && q && (
        <div className="px-3 pb-3 pt-1 border-t border-stone-200 space-y-2.5">
          <ResumeAnchor resume={resume} anchor={q.resumeAnchor} />

          <div className="text-[11px] text-stone-500">
            <span className="text-stone-400">测的是：</span>
            {q.tests}
            <span className="mx-1.5 text-stone-300">|</span>
            <span className="text-stone-400">
              {q.storyTitle} · {q.clusterTitle} · P{q.p}
            </span>
          </div>

          {rec?.gaps?.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2.5">
              <div className="flex items-baseline gap-2 mb-1">
                {rec.grade && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${GRADE_TONE[rec.grade]}`}
                  >
                    {rec.grade}
                  </span>
                )}
                <span className="text-[11px] font-medium text-amber-900">
                  缺口{rec.grade ? ` · ${GRADE_HINT[rec.grade]}` : ''}
                </span>
              </div>
              <ul className="text-[11px] text-amber-900/80 space-y-0.5 list-disc list-inside">
                {rec.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <AttemptHistory
            entries={(rec?.revisions ?? []).map((r) => ({
              date: r.date,
              verdict: r.grade,
              tone: r.grade ? GRADE_TONE[r.grade] : undefined,
              text: r.text,
              gaps: r.gaps,
            }))}
            label="以前的版本"
          />

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-[11px] text-stone-400">我的答案</label>
              <span className="text-[10px] text-stone-400">
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : savedAt ? (
                  `已存 ${savedAt}`
                ) : (
                  `${text.trim().length} 字 · 自动保存`
                )}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                dirty.current = true;
                setText(e.target.value);
              }}
              rows={9}
              placeholder={
                '照着真实情况写，不确定的数字不要编。\n' +
                '「我们当时没量，如果重做我会先定这个指标」是一个好答案；编一个数字是面试里最危险的事。'
              }
              className="w-full px-3 py-2 text-[13px] leading-relaxed border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void write({ status: st === 'spoken' ? 'draft' : 'spoken' })}
              title="不看稿口述过一遍才点——写过不等于会讲"
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                st === 'spoken'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-stone-600 border-stone-300 hover:border-emerald-500 hover:text-emerald-700'
              }`}
            >
              <Mic className="w-3 h-3" />
              {st === 'spoken' ? '已能脱口而出' : '录音口述过了'}
            </button>
            <button
              type="button"
              onClick={() => void write({ dropped: !rec?.dropped })}
              title="这个问题问得没意义，从轮转里去掉"
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-stone-300 bg-white text-stone-500 hover:border-rose-400 hover:text-rose-600"
            >
              <Trash2 className="w-3 h-3" />
              {rec?.dropped ? '已弃用 · 恢复' : '这题没意义'}
            </button>
            <span className="text-[10px] text-stone-400">
              攒几条后跟 Claude 说「批一下简历深挖」
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
