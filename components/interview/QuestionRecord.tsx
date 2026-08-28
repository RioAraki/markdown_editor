'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Loader2, RotateCcw } from 'lucide-react';
import { REDO_LABEL } from '@shared/interview/leetcode';
import {
  QBANK_REDO_DAYS,
  parseQuestionUnit,
} from '@shared/interview/qbank';
import { UnitStatus } from '@/types/interview';
import { AttemptHistory, AttemptEntry } from './AttemptHistory';

/**
 * One Agent-bank question inside a day card.
 *
 * Deliberately not the LeetCode unit. There the interaction is grading how a
 * solve went; here it is capturing what you actually wrote, because the answer
 * is the artifact you will re-read and argue with a model about. So the box is
 * the answer itself, the reference answer sits underneath for comparison, and
 * the only judgement on offer is one flag: do this again.
 */

export interface QuestionMeta {
  question: string;
  category: string;
  answer: string;
  url: string;
}

export function QuestionRecord({
  index,
  status,
  trailing,
  dateStr,
  meta,
  savedAnswer,
  history,
  onChange,
}: {
  index: number;
  status: UnitStatus;
  trailing: string;
  dateStr: string;
  /** questionId → 题面/参考答案/链接, from the mirrored bank. */
  meta?: Record<string, QuestionMeta>;
  /** questionId → what the archive file already holds for this date. */
  savedAnswer?: Record<string, string>;
  /** questionId → 以前每一次的作答，最早在前。 */
  history?: Record<string, AttemptEntry[]>;
  onChange: (status: UnitStatus, trailing: string) => void;
}) {
  const parsed = parseQuestionUnit(trailing);
  const q = parsed ? meta?.[parsed.id] : undefined;

  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [reason, setReason] = useState(parsed?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const stored = parsed ? (savedAnswer?.[parsed.id] ?? '') : '';
  useEffect(() => {
    if (!open) setAnswer(stored);
  }, [stored, open]);
  useEffect(() => {
    if (!open) setReason(parseQuestionUnit(trailing)?.note ?? '');
  }, [trailing, open]);
  useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);

  if (!parsed) return null;
  const hasAnswer = answer.trim().length > 0 || stored.length > 0;

  const write = async (patch: {
    answer?: string;
    redo?: boolean;
    redoReason?: string;
  }) => {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch('/api/interview/qbank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parsed.id, date: dateStr, ...patch }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      window.dispatchEvent(new CustomEvent('interview:qbank-updated'));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  /** The day-file line: head, optional 待重做, optional reason. */
  const compose = (redo: boolean, note: string) => {
    const flat = note.replace(/\s*[\r\n]+\s*/g, ' / ').replace(/·/g, '・').trim();
    const parts = [parsed.head, redo ? REDO_LABEL : '', flat]
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? ` ${parts.join(' · ')}` : ' ';
  };

  const commitAnswer = async () => {
    const text = answer.trim();
    // Answered is answered; the flag is what says it needs another look.
    onChange(text ? (parsed.redo ? 'partial' : 'done') : 'pending', compose(parsed.redo, reason));
    await write({ answer: text });
  };

  const toggleRedo = async () => {
    const next = !parsed.redo;
    onChange(
      hasAnswer ? (next ? 'partial' : 'done') : 'pending',
      compose(next, next ? reason : ''),
    );
    await write({ redo: next, redoReason: next ? reason.trim() : '' });
  };

  const commitReason = async () => {
    if (!parsed.redo) return;
    onChange(status, compose(true, reason));
    await write({ redoReason: reason.trim() });
  };

  const chipColor = parsed.redo
    ? 'bg-rose-500 text-white border-rose-500'
    : status === 'done'
      ? 'bg-indigo-600 text-white border-indigo-600'
      : 'bg-white text-stone-500 border-stone-300 hover:border-stone-500';

  const chars = (answer || stored).trim().length;

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
              status === 'done' && !parsed.redo ? 'text-stone-400' : 'text-stone-800'
            }`}
          >
            {q?.question ?? parsed.head}
          </span>
          <span className="block text-[11px] text-stone-500 mt-0.5 truncate">
            {parsed.redo && (
              <span className="mr-1 px-1 rounded bg-rose-100 text-rose-700 font-medium">
                待重做
              </span>
            )}
            {parsed.note ||
              (chars > 0 ? `已作答 ${chars} 字` : '还没作答')}
          </span>
        </span>
        <span className="text-stone-400 text-xs shrink-0 mt-1">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-stone-200 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleRedo}
              disabled={saving}
              title={
                parsed.redo
                  ? `已标记待重做，约 ${QBANK_REDO_DAYS} 天后会再出现。再点一下取消`
                  : '答得不满意就标上，之后会自动排回来'
              }
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                parsed.redo
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-stone-500 border-stone-300 hover:border-rose-400 hover:text-rose-600'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              {parsed.redo ? '待重做' : '标记重做'}
            </button>
            {saving && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
            {saved && <span className="text-[11px] text-emerald-600">已保存</span>}
            {q?.url && (
              <a
                href={q.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-indigo-600"
              >
                <ExternalLink className="w-3 h-3" />
                去答题
              </a>
            )}
            <span className="inline-flex items-center gap-0.5 text-[11px] text-stone-400">
              <FileText className="w-3 h-3" />
              qbank/{parsed.id}.md
            </span>
            {q?.category && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                {q.category}
              </span>
            )}
          </div>

          <AttemptHistory
            entries={(history?.[parsed.id] ?? []).filter((e) => e.date !== dateStr)}
            label="以前答过什么"
          />

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">
              我的作答 · 从站上答完粘过来
            </label>
            <textarea
              ref={boxRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onBlur={commitAnswer}
              rows={5}
              placeholder="Ctrl+A / Ctrl+C 从答题页复制，粘在这里。失焦就存进 qbank 档案。"
              className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y leading-relaxed"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>存进 qbank/{parsed.id}.md，重答不覆盖旧的，按日期追加</span>
              <span>{answer.trim().length} 字</span>
            </div>
          </div>

          {parsed.redo && (
            <div>
              <label className="block text-[11px] text-rose-500 mb-1">
                为什么要重做 —— 这句话会在它排回来时原样提示你
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={commitReason}
                placeholder="例：没讲清和普通 LLM 调用的边界"
                className="w-full px-2 py-1.5 text-xs border border-rose-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          )}

          {/* Same rule as hiding the algorithm topic: seeing the model answer
              before you write is most of the answer. */}
          {q?.answer &&
            (hasAnswer || showRef ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium mb-1">
                  参考答案
                </div>
                <p className="text-[12px] text-emerald-900 leading-relaxed whitespace-pre-wrap">
                  {q.answer}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowRef(true)}
                className="w-full text-[11px] text-stone-400 hover:text-stone-600 border border-dashed border-stone-300 rounded py-1.5"
              >
                先自己答，写完自动显示参考答案 · 直接点开
              </button>
            ))}

          {error && (
            <p className="text-[11px] text-red-600">保存失败，档案没写进去</p>
          )}
        </div>
      )}
    </div>
  );
}
