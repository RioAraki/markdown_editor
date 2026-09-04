'use client';

import { useState } from 'react';
import { CheckCircle2, CornerDownRight } from 'lucide-react';

/**
 * The line in a day where one knowledge point ends and the next begins.
 *
 * The course walks one pattern at a time, but a day is planned in one shot, so
 * the crossing happens silently in the middle of a list of problem titles. That
 * is how an evening of 二分 turned into 栈 without anyone noticing — the titles
 * give nothing away, which is the point.
 *
 * So it names **the point that just finished**, never the one starting. The
 * finished one is information you have earned: you solved those problems, and
 * knowing 二分 is behind you is exactly what was missing. Naming the new one
 * would tell you what the problems below are testing, and being told 「下面是
 * 单调栈」 before reading the problem is the hint this whole block is built to
 * withhold. It is one click away for when you want it.
 */
export function TopicDivider({
  finished,
  starting,
}: {
  /** 中文 name of the point whose last problem sits above this line. */
  finished?: string;
  /** The point below. Hidden until asked for — naming it is a hint. */
  starting?: string;
}) {
  const [reveal, setReveal] = useState(false);

  // The inventory title carries a count suffix — 「二分（7 基础 + 3 进阶）」 —
  // which is useful in a list of topics and noise on a one-line marker.
  const bare = (t?: string) => t?.split('（')[0].trim();

  return (
    <div className="flex items-center gap-2 py-1.5" role="separator">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-200" />
      <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span className="text-[11px] text-emerald-800">
          {bare(finished) ? (
            <>
              <b className="font-semibold">{bare(finished)}</b> 告一段落
            </>
          ) : (
            '这个知识点告一段落'
          )}
        </span>
        <CornerDownRight className="w-3 h-3 text-stone-400 shrink-0" />
        {reveal && starting ? (
          <span className="text-[11px] text-stone-600">
            下面是 <b className="font-semibold">{bare(starting)}</b>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setReveal(true)}
            disabled={!starting}
            title="先别看——自己认出考点也是练习的一部分"
            className="text-[11px] text-stone-500 hover:text-indigo-600 disabled:text-stone-400 disabled:cursor-default"
          >
            下面换了新知识点
            {starting && <span className="text-stone-400">（看是哪个）</span>}
          </button>
        )}
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-200" />
    </div>
  );
}
