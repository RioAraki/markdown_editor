'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import NoteBody from '@shared/interview/ui/NoteBody';
import type { StoryAnswers, StoryBank } from '@shared/interview/stories';
import type { TopicNotes } from '@shared/interview/topicNotes';
import type { Resume } from '@shared/interview/resume';
import type { InterviewDayDoc } from '@/types/interview';
import { ReviewWorkspace } from './ReviewWorkspace';
import { InterviewAnswerReview } from './InterviewAnswerReview';

/**
 * 「📚 往日材料」 — one place to read back everything prep used to produce.
 *
 * The preparation lines these came from are no longer scheduled, so their
 * entry points are gone from the daily flow. The writing is not: question-bank
 * answers, resume deep-dive answers with their follow-ups and recordings,
 * spoken behavioural attempts, papers and 要领 notes all still live on disk and
 * all still have a path to them — this one, plus the day they were written on,
 * which the calendar still opens and still renders in full.
 *
 * Nothing here is new machinery. Each section mounts the component that
 * already knew how to read that material; this is only a shelf to put them on.
 * Everything loads lazily, so a collapsed shelf costs nothing.
 */

const SECTION =
  'rounded-lg border border-stone-200 bg-white';
const SUMMARY =
  'cursor-pointer px-3 py-2.5 text-[13px] font-medium text-stone-800 hover:text-indigo-700';

export function ArchivedMaterials({
  days,
  paperIds,
  onOpenPaper,
}: {
  days: InterviewDayDoc[];
  paperIds: string[];
  onOpenPaper: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[14px] font-medium text-indigo-800">
            <Archive className="w-4 h-4 shrink-0" />
            往日材料
          </span>
          <span className="block mt-0.5 text-[11px] text-stone-500 leading-snug">
            自主复习 · 简历问题与录音 · 行为故事历次回答 · 论文 · 知识点笔记
          </span>
        </span>
        <span className="text-[12px] text-indigo-700 shrink-0">
          {open ? '收起 ▴' : '展开 ▾'}
        </span>
      </button>

      {open && (
        <div className="border-t border-indigo-200 p-3 space-y-2.5">
          <p className="text-[11px] text-stone-500 leading-relaxed">
            这些准备线不再排进每天的计划，但写下的东西都在。
            左栏月历点任意一天，那天的题面、回答、追问和录音也照旧完整展示。
          </p>

          <ReviewWorkspace />
          <ResumeMaterials days={days} />
          <BehaviouralMaterials days={days} />
          <PaperMaterials paperIds={paperIds} onOpenPaper={onOpenPaper} />
          <TopicMaterials />
        </div>
      )}
    </section>
  );
}

/** Fetch once, on first expand, and remember the failure so it can be retried. */
function useLazy<T>(url: string, open: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!open || (data && attempt === 0)) return;
    let cancelled = false;
    setError('');
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((value: T) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setError('加载失败');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, open, attempt]);

  return { data, error, retry };
}

function Status({ error, retry, empty }: { error: string; retry: () => void; empty?: string }) {
  if (error) {
    return (
      <p role="alert" className="text-xs text-rose-700">
        {error}{' '}
        <button type="button" onClick={retry} className="text-indigo-700 underline">
          重试
        </button>
      </p>
    );
  }
  if (empty) return <p className="text-xs text-stone-500">{empty}</p>;
  return (
    <p role="status" className="inline-flex items-center gap-1.5 text-xs text-stone-500">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      加载中…
    </p>
  );
}

type StoriesPayload = { bank: StoryBank; answers: StoryAnswers; resume?: Resume };

/**
 * Resume deep-dive: every cluster, each opening the same per-question review
 * the overview's coverage map opens — answers, status, revisions, follow-ups
 * and recordings, all editable exactly as before.
 */
function ResumeMaterials({ days }: { days: InterviewDayDoc[] }) {
  const [open, setOpen] = useState(false);
  const { data, error, retry } = useLazy<StoriesPayload>('/api/interview/stories', open);
  const clusters = (data?.bank.stories ?? []).flatMap((s) =>
    s.clusters.map((c) => ({ storyTitle: s.title, cluster: c })),
  );

  return (
    <details className={SECTION} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={SUMMARY}>
        简历问题与录音
        <span className="ml-2 text-[11px] font-normal text-stone-500">
          逐题回看答案、追问与本地录音
        </span>
      </summary>
      <div className="border-t border-stone-200 p-3 space-y-2">
        {!data ? (
          <Status error={error} retry={retry} />
        ) : clusters.length === 0 ? (
          <p className="text-xs text-stone-500">还没有简历问题。</p>
        ) : (
          clusters.map(({ storyTitle, cluster }) => (
            <details key={cluster.id} className="rounded border border-stone-200 bg-stone-50/50">
              <summary className="cursor-pointer px-2.5 py-2 text-[12px] text-stone-800">
                {storyTitle} · {cluster.title}
                <span className="ml-2 text-[11px] text-stone-500">
                  {cluster.questions.length} 问
                </span>
              </summary>
              <div className="border-t border-stone-200 p-2.5">
                <InterviewAnswerReview
                  itemId={cluster.id}
                  stories={{ bank: data.bank, answers: data.answers }}
                  resume={data.resume}
                  days={days}
                />
              </div>
            </details>
          ))
        )}
      </div>
    </details>
  );
}

/**
 * Behavioural stories: the written attempts are reconstructed from the day
 * logs, so this list is the inventory of questions and the history comes from
 * the same files the calendar shows.
 */
function BehaviouralMaterials({ days }: { days: InterviewDayDoc[] }) {
  const [open, setOpen] = useState(false);
  const { data, error, retry } = useLazy<{ items: { id: string; title: string }[] }>(
    `/api/interview/items?block=${encodeURIComponent('行为故事')}`,
    open,
  );

  return (
    <details className={SECTION} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={SUMMARY}>
        行为故事历次回答
        <span className="ml-2 text-[11px] font-normal text-stone-500">
          含每道题的全部本地录音
        </span>
      </summary>
      <div className="border-t border-stone-200 p-3 space-y-2">
        {!data ? (
          <Status error={error} retry={retry} />
        ) : data.items.length === 0 ? (
          <p className="text-xs text-stone-500">还没有行为面试题。</p>
        ) : (
          data.items.map((item) => (
            <details key={item.id} className="rounded border border-stone-200 bg-stone-50/50">
              <summary className="cursor-pointer px-2.5 py-2 text-[12px] text-stone-800">
                {item.title}
              </summary>
              <div className="border-t border-stone-200 p-2.5">
                <InterviewAnswerReview itemId={item.id} days={days} />
              </div>
            </details>
          ))
        )}
      </div>
    </details>
  );
}

/** Papers: the reading-list ids the editor already loaded, opened in PaperPanel. */
function PaperMaterials({
  paperIds,
  onOpenPaper,
}: {
  paperIds: string[];
  onOpenPaper: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, error, retry } = useLazy<{ papers: { id: string; title: string }[] }>(
    '/api/interview/papers',
    open,
  );
  const papers = (data?.papers ?? []).filter((p) => paperIds.length === 0 || paperIds.includes(p.id));

  return (
    <details className={SECTION} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={SUMMARY}>
        论文精读
        <span className="ml-2 text-[11px] font-normal text-stone-500">
          阅读进度、书签与每次的笔记
        </span>
      </summary>
      <div className="border-t border-stone-200 p-3 space-y-1.5">
        {!data ? (
          <Status error={error} retry={retry} />
        ) : papers.length === 0 ? (
          <p className="text-xs text-stone-500">阅读清单里还没有论文。</p>
        ) : (
          papers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenPaper(p.id)}
              className="block w-full text-left rounded border border-stone-200 bg-stone-50/50 px-2.5 py-2 text-[12px] text-stone-800 hover:border-indigo-400 hover:text-indigo-700"
            >
              {p.title}
              <span className="ml-2 font-mono text-[10px] text-stone-400">{p.id}</span>
            </button>
          ))
        )}
      </div>
    </details>
  );
}

/** 要领 notes, one per knowledge point, rendered with the shared note renderer. */
function TopicMaterials() {
  const [open, setOpen] = useState(false);
  const { data, error, retry } = useLazy<{ notes: TopicNotes }>('/api/interview/topics', open);
  const notes = Object.values(data?.notes ?? {}).sort((a, b) =>
    (b.updated ?? '').localeCompare(a.updated ?? ''),
  );

  return (
    <details className={SECTION} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={SUMMARY}>
        知识点笔记
        <span className="ml-2 text-[11px] font-normal text-stone-500">要领 · 随手记</span>
      </summary>
      <div className="border-t border-stone-200 p-3 space-y-1.5">
        {!data ? (
          <Status error={error} retry={retry} />
        ) : notes.length === 0 ? (
          <p className="text-xs text-stone-500">还没有知识点笔记。</p>
        ) : (
          notes.map((note) => (
            <details key={note.id} className="rounded border border-stone-200 bg-stone-50/50">
              <summary className="cursor-pointer px-2.5 py-2 text-[12px] text-stone-800">
                {note.title ?? note.id}
                {note.updated && (
                  <span className="ml-2 text-[11px] text-stone-400">{note.updated}</span>
                )}
              </summary>
              <div className="border-t border-stone-200 px-2.5 py-2 text-[12px] text-stone-800">
                <NoteBody body={note.body} />
              </div>
            </details>
          ))
        )}
      </div>
    </details>
  );
}
