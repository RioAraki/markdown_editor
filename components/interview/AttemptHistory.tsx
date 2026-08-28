'use client';

import { useState } from 'react';
import { History } from 'lucide-react';

/**
 * Past attempts at one thing, above the box where you record the next one.
 *
 * Every place in this system that takes a comment can be revisited — a problem
 * you flagged, a question you re-answer, an answer sent back for a rewrite. The
 * records were being kept, but nothing showed them, so a redo felt like it had
 * overwritten the last one. Seeing "上次磕磕绊绊，卡在边界条件" while writing
 * this attempt is most of what makes the repetition worth anything.
 *
 * Collapsed by default: the point is to write the new one first, then compare.
 */

export interface AttemptEntry {
  date: string;
  /** 磕磕绊绊 / C / 读到 3.2 节 — whatever grades this attempt. */
  verdict?: string;
  /** Tailwind classes for the verdict chip. */
  tone?: string;
  text?: string;
  /** Review notes attached to this attempt, if any. */
  gaps?: string[];
}

export function AttemptHistory({
  entries,
  label = '以前写过什么',
}: {
  entries: AttemptEntry[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="rounded border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-left hover:bg-stone-50 rounded"
      >
        <History className="w-3 h-3 text-stone-400 shrink-0" />
        <span className="text-[11px] text-stone-500 flex-1">
          {label} · {entries.length} 次
          {!open && entries[entries.length - 1] && (
            <span className="ml-1.5 text-stone-400">
              最近 {entries[entries.length - 1].date}
              {entries[entries.length - 1].verdict &&
                ` · ${entries[entries.length - 1].verdict}`}
            </span>
          )}
        </span>
        <span className="text-stone-400 text-[10px] shrink-0">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <ul className="px-2.5 pb-2.5 space-y-2">
          {/* Newest first — the last attempt is the one you are answering. */}
          {[...entries].reverse().map((e, i) => (
            <li key={`${e.date}-${i}`} className="border-l-2 border-stone-200 pl-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] text-stone-400 font-mono">{e.date}</span>
                {e.verdict && (
                  <span
                    className={`text-[10px] px-1 rounded ${
                      e.tone ?? 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {e.verdict}
                  </span>
                )}
              </div>
              {e.text && (
                <p className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap mt-0.5">
                  {e.text}
                </p>
              )}
              {e.gaps && e.gaps.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {e.gaps.map((g, j) => (
                    <li key={j} className="text-[10px] text-amber-700">
                      · {g}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
