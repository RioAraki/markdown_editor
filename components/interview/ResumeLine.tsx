'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { Resume, ResumeLine as Line } from '@shared/interview/resume';
import { childrenOf, resumeContext } from '@shared/interview/resume';

/**
 * The resume line a question is aimed at, shown next to the question.
 *
 * The deep-dive used to present a challenge with no indication of what it was
 * challenging — "「30–50 个问题/天」这个数怎么统计的？" with the bullet that
 * claims it nowhere on screen. Answering means defending a specific sentence,
 * so that sentence has to be in front of you, with its own emphasis intact:
 * the bolded spans are exactly what the resume is staking and therefore what
 * gets attacked.
 */

/** `**bold**` → <strong>. Nothing else; the source is a resume, not prose. */
function Bold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold text-stone-900">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** One line of the resume, styled by its depth. */
export function ResumeLineText({
  line,
  dim = false,
  highlight = false,
}: {
  line: Line;
  dim?: boolean;
  highlight?: boolean;
}) {
  if (line.kind === 'company') {
    return (
      <div className={`pt-2 ${dim ? 'opacity-50' : ''}`}>
        <div className="text-[13px] font-bold text-stone-900">{line.text}</div>
        {line.meta && (
          <div className="text-[10px] text-stone-500">{line.meta}</div>
        )}
      </div>
    );
  }
  if (line.kind === 'team') {
    return (
      <div className={`pt-1.5 ${dim ? 'opacity-50' : ''}`}>
        <div className="text-[11px] font-medium text-stone-700 italic">
          {line.text}
          {line.meta && (
            <span className="ml-1.5 not-italic font-normal text-stone-400">
              {line.meta}
            </span>
          )}
        </div>
        {line.blurb && (
          <div className="text-[10px] text-stone-500 mt-0.5">{line.blurb}</div>
        )}
      </div>
    );
  }
  return (
    <div
      className={`text-[11.5px] leading-relaxed ${
        line.kind === 'sub' ? 'pl-4' : 'pl-1.5'
      } ${
        highlight
          ? 'bg-indigo-50 border-l-2 border-indigo-500 -ml-0.5 pl-3 py-1 rounded-r text-stone-800'
          : dim
            ? 'text-stone-400'
            : 'text-stone-600'
      }`}
    >
      <span className="text-stone-400 mr-1">{line.kind === 'sub' ? '·' : '▪'}</span>
      <Bold text={line.text} />
    </div>
  );
}

/**
 * The anchored line, with just enough surrounding context to place it.
 *
 * A sub-bullet alone reads as a fragment — "Built an eval system of 100
 * questions" means little without the project it belongs to — so the parent
 * bullet comes along, dimmed.
 */
export function ResumeAnchor({
  resume,
  anchor,
}: {
  resume?: Resume;
  anchor?: string;
}) {
  const [full, setFull] = useState(false);
  const ctx = resume ? resumeContext(resume, anchor) : undefined;
  if (!resume || !ctx) return null;

  const siblings = ctx.parent ? childrenOf(resume, ctx.parent.id) : [];

  return (
    <div className="rounded border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-indigo-100 bg-indigo-50/60">
        <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
        <span className="text-[10px] text-indigo-700 flex-1 truncate">
          简历上的这一条
          {ctx.section && (
            <span className="text-indigo-400">
              {' · '}
              {ctx.section.text}
              {ctx.team ? ` · ${ctx.team.text}` : ''}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          className="text-[10px] text-indigo-500 hover:text-indigo-700 shrink-0"
        >
          {full ? '收起整份' : '看整份简历'}
        </button>
      </div>

      {full ? (
        <div className="px-2.5 py-2 space-y-0.5 max-h-80 overflow-y-auto bg-white">
          {resume.lines.map((l) => (
            <ResumeLineText
              key={l.id}
              line={l}
              highlight={l.id === anchor}
              dim={l.id !== anchor}
            />
          ))}
        </div>
      ) : (
        <div className="px-2.5 py-2 space-y-1 bg-white">
          {ctx.parent && <ResumeLineText line={ctx.parent} dim />}
          <ResumeLineText line={ctx.line} highlight />
          {/* Sibling sub-bullets tell you what is *not* being asked here. */}
          {siblings.length > 1 && (
            <div className="pt-1 text-[10px] text-stone-400 pl-4">
              同项目还有 {siblings.length - 1} 条子项，各自有自己的问题簇
            </div>
          )}
        </div>
      )}
    </div>
  );
}
