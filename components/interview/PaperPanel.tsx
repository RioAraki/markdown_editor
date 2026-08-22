'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import {
  PAPER_STAGES,
  PAPER_STAGE_HINT,
  PAPER_STAGE_LABEL,
  PaperDoc,
  PaperStage,
  paperMinutes,
} from '@shared/interview/paperDoc';

/**
 * One paper's workbench.
 *
 * Three things a checkbox could never carry, in the order you need them:
 *
 *  1. **哪一层读懂了** — progress as comprehension, not pages. A paper you
 *     skimmed end to end is less read than one whose method you can draw.
 *  2. **上次读到哪** — the bookmark, so a session starts by resuming rather
 *     than by re-deciding where to start.
 *  3. **一块大的地方写东西** — this session's notes, plus the summary you
 *     maintain by hand. The session log is raw material; the summary is what
 *     you actually re-read before an interview.
 *
 * It opens over the editor rather than navigating away, because you are in the
 * middle of a day's log and will want to tick the slot when you stop.
 */

const AUTOSAVE_MS = 1200;

export function PaperPanel({
  paperId,
  dateStr,
  onClose,
}: {
  paperId: string;
  /** The day this sitting belongs to. */
  dateStr: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<PaperDoc | null>(null);
  const [notes, setNotes] = useState('');
  const [bookmark, setBookmark] = useState('');
  const [summary, setSummary] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/interview/papers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { papers: PaperDoc[] }) => {
        if (cancelled) return;
        const found = d.papers.find((p) => p.id === paperId) ?? null;
        setDoc(found);
        setBookmark(found?.bookmark ?? '');
        setSummary(found?.summary ?? '');
        setNotes(found?.sessions.find((s) => s.date === dateStr)?.notes ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paperId, dateStr]);

  const save = async (patch: Partial<{
    stages: PaperStage[];
    bookmark: string;
    finished: boolean;
    summary: string;
    session: { date: string; notes: string; stoppedAt?: string };
  }>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/interview/papers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: paperId, ...patch }),
      });
      if (!res.ok) throw new Error();
      const d: { paper?: PaperDoc } = await res.json();
      if (d.paper) setDoc(d.paper);
      dirty.current = false;
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      window.dispatchEvent(new CustomEvent('interview:paper-updated'));
    } catch {
      /* keep the text on screen; the next keystroke retries */
    } finally {
      setSaving(false);
    }
  };

  // Autosave the session box — losing a paragraph of reading notes to a stray
  // click would be the one unforgivable bug in this panel.
  useEffect(() => {
    if (!doc || !dirty.current) return;
    const t = setTimeout(() => {
      void save({ session: { date: dateStr, notes, stoppedAt: bookmark }, bookmark });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, bookmark]);

  const toggleStage = (s: PaperStage) => {
    if (!doc) return;
    const next = doc.stages.includes(s)
      ? doc.stages.filter((x) => x !== s)
      : [...doc.stages, s];
    void save({ stages: PAPER_STAGES.filter((x) => next.includes(x)) });
  };

  const past = useMemo(
    () => (doc?.sessions ?? []).filter((s) => s.date !== dateStr).reverse(),
    [doc, dateStr],
  );

  if (!doc) {
    return (
      <div className="absolute inset-0 z-30 bg-white/95 flex items-center justify-center text-stone-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        打开论文…
      </div>
    );
  }

  const cleared = doc.stages.length;

  return (
    <div className="absolute inset-0 z-30 bg-stone-50 flex flex-col">
      <header className="px-4 sm:px-6 py-3 bg-white border-b border-stone-200 flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900 leading-snug">
            {doc.title}
          </h2>
          <p className="text-[11px] text-stone-500 mt-0.5">
            读过 {doc.sessions.length} 次
            {paperMinutes(doc) > 0 && ` · 共 ${paperMinutes(doc)} 分钟`}
            {' · '}
            <span className={cleared === 4 ? 'text-emerald-600 font-medium' : ''}>
              读懂 {cleared}/4 层
            </span>
            {doc.url && (
              <>
                {' · '}
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  原文
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
          ) : (
            savedAt && (
              <span className="text-[11px] text-emerald-600">已存 {savedAt}</span>
            )
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-500"
            title="回到今天的记录"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
          {/* 1 · 读到哪一层 */}
          <section className="bg-white rounded-lg border border-stone-200 p-4">
            <h3 className="text-[13px] font-semibold text-stone-800 mb-0.5">
              读懂到哪一层了
            </h3>
            <p className="text-[11px] text-stone-500 mb-3">
              按理解算进度，不按翻了几页。哪层真讲得出来就勾哪层。
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PAPER_STAGES.map((s) => {
                const on = doc.stages.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStage(s)}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                      on
                        ? 'border-violet-400 bg-violet-50'
                        : 'border-stone-200 bg-white hover:border-stone-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          on
                            ? 'bg-violet-600 border-violet-600 text-white'
                            : 'border-stone-300'
                        }`}
                      >
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      <span className="text-[13px] font-medium text-stone-800">
                        {s} · {PAPER_STAGE_LABEL[s]}
                      </span>
                    </span>
                    <span className="block text-[11px] text-stone-500 mt-1 leading-snug">
                      {PAPER_STAGE_HINT[s]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 · 这次读到哪 + 写什么 */}
          <section className="bg-white rounded-lg border-2 border-violet-200 p-4">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className="text-[13px] font-semibold text-stone-800">
                今天这一次 · {dateStr}
              </h3>
              <span className="text-[11px] text-stone-400">
                {notes.trim().length} 字 · 自动保存
              </span>
            </div>

            <label className="block text-[11px] text-stone-400 mb-1">
              读到哪了 —— 下次从这里接着开始
            </label>
            <input
              value={bookmark}
              onChange={(e) => {
                dirty.current = true;
                setBookmark(e.target.value);
              }}
              placeholder="例：3.2 Multi-Head Attention，还没看实验部分"
              className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 mb-3"
            />

            <label className="block text-[11px] text-stone-400 mb-1">
              这次学到了什么 · 想到了什么
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                dirty.current = true;
                setNotes(e.target.value);
              }}
              rows={14}
              placeholder={
                '想到哪写到哪，不用组织语言 —— 收敛是下面「我的总结」的事。\n\n' +
                '几个能问自己的：\n' +
                '· 这一段在回答什么问题？\n' +
                '· 如果没有它，之前的做法会卡在哪？\n' +
                '· 哪里我其实没看懂，只是划过去了？\n' +
                '· 和我做过的东西有什么对得上的？'
              }
              className="w-full px-3 py-2 text-[13px] leading-relaxed border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y font-sans"
            />
          </section>

          {/* 3 · 手工维护的总结 */}
          <section className="bg-white rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setShowSummary((v) => !v)}
              className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-stone-50 rounded-lg"
            >
              <ChevronDown
                className={`w-4 h-4 text-stone-400 transition-transform ${
                  showSummary ? 'rotate-180' : ''
                }`}
              />
              <span className="text-[13px] font-semibold text-stone-800">
                我的总结
              </span>
              <span className="text-[11px] text-stone-400 flex-1">
                {summary.trim()
                  ? `${summary.trim().length} 字 · 面试前重看这一段`
                  : '还没写 —— 读完一轮再来收敛'}
              </span>
            </button>
            {showSummary && (
              <div className="px-4 pb-4">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  onBlur={() => void save({ summary })}
                  rows={10}
                  placeholder="把散落的笔记收敛成几段。理想状态：照着这段就能讲五分钟。"
                  className="w-full px-3 py-2 text-[13px] leading-relaxed border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                />
              </div>
            )}
          </section>

          {/* 4 · 以前的记录 */}
          {past.length > 0 && (
            <section className="bg-white rounded-lg border border-stone-200 p-4">
              <h3 className="text-[13px] font-semibold text-stone-800 mb-2">
                以前读的时候写了什么
              </h3>
              <ul className="space-y-3">
                {past.map((s) => (
                  <li key={s.date} className="border-l-2 border-stone-200 pl-3">
                    <div className="text-[11px] text-stone-400 font-mono">
                      {s.date}
                      {s.stoppedAt && ` · 读到 ${s.stoppedAt}`}
                    </div>
                    <p className="text-[12px] text-stone-600 leading-relaxed whitespace-pre-wrap mt-0.5">
                      {s.notes}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex items-center gap-3 pb-6">
            <button
              type="button"
              onClick={() => void save({ finished: !doc.finished })}
              className={`text-xs px-3 py-2 rounded-md border transition-colors ${
                doc.finished
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white border-stone-300 text-stone-600 hover:border-emerald-500 hover:text-emerald-700'
              }`}
            >
              {doc.finished ? '已标记读完 · 点此撤销' : '这篇读完了'}
            </button>
            <span className="text-[11px] text-stone-400">
              读完与否你说了算，四层阶梯只是参考
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
