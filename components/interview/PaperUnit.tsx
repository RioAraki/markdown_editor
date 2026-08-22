'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { PAPER_STAGES, PaperDoc } from '@shared/interview/paperDoc';
import { UnitStatus } from '@/types/interview';

/**
 * The 论文精读 slot in a day's log.
 *
 * Replaces the generic 做完了/打了折/没做 box, which never fit: a paper is read
 * over several sittings, so "done today" and "done with the paper" are two
 * different facts. This row shows where the paper stands and hands off to its
 * workbench; the day's checkbox is derived rather than asked for —
 * `[/]` once you have put a session in, `[x]` when you call the paper finished.
 */
export function PaperUnit({
  paperId,
  dateStr,
  status,
  onChange,
  onOpen,
}: {
  paperId: string;
  dateStr: string;
  status: UnitStatus;
  onChange: (status: UnitStatus, trailing: string) => void;
  onOpen: () => void;
}) {
  const [doc, setDoc] = useState<PaperDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/interview/papers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { papers: PaperDoc[] }) => {
        setDoc(d.papers.find((p) => p.id === paperId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId]);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('interview:paper-updated', h);
    return () => window.removeEventListener('interview:paper-updated', h);
  }, [load]);

  // Keep the day's checkbox in step with what the paper file actually says.
  const todaySession = doc?.sessions.find((s) => s.date === dateStr);
  const want: UnitStatus = doc?.finished
    ? 'done'
    : todaySession
      ? 'partial'
      : 'pending';
  const label = doc
    ? [
        doc.title,
        doc.finished ? '读完了' : todaySession ? '今天读过' : '',
        `${doc.stages.length}/4 层`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  useEffect(() => {
    if (!doc) return;
    if (status !== want) onChange(want, ` ${label}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, label, doc]);

  const cleared = doc?.stages.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border-2 border-violet-200 bg-violet-50/40 hover:bg-violet-50 hover:border-violet-300 transition-colors px-3 py-2.5 flex items-start gap-3"
    >
      <BookOpen className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-stone-800 leading-snug">
          {loading ? '读取中…' : doc?.title}
        </span>
        <span className="block text-[11px] text-stone-500 mt-1">
          {doc?.bookmark
            ? `上次读到：${doc.bookmark}`
            : doc?.sessions.length
              ? '上次没记读到哪'
              : '还没开始'}
        </span>
        <span className="flex items-center gap-1.5 mt-1.5">
          {PAPER_STAGES.map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                doc?.stages.includes(s) ? 'bg-violet-500' : 'bg-stone-200'
              }`}
            />
          ))}
          <span
            className={`text-[10px] font-mono shrink-0 ${
              cleared === 4 ? 'text-emerald-600' : 'text-stone-400'
            }`}
          >
            {cleared}/4
          </span>
        </span>
      </span>
      <span className="text-[11px] text-violet-700 shrink-0 mt-0.5 flex items-center gap-1">
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
        {doc?.sessions.length ? '继续读 →' : '开始读 →'}
      </span>
    </button>
  );
}
