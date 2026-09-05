'use client';

import type { Resume, ResumeLine } from '@shared/interview/resume';

/**
 * The whole project as it sits on the resume, with the line under attack marked.
 *
 * One bullet on its own reads as a fragment — 「Built an eval system of 100
 * benchmark questions」 says little without the agent it grades — and an
 * interviewer never sees it alone either: they read the project top to bottom
 * and then pick. So this shows what they see, and marks where the questions
 * below are aimed.
 *
 * Sticky and height-capped: it has to still be there at question nine, without
 * eating half the screen on the way.
 */

/** `**bold**` → <strong>. The bold spans are the claims being staked. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-stone-900">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** The bullet an anchor belongs to, its sub-bullets, and the team it sits under. */
function projectBlock(resume: Resume, anchor: string) {
  const lines = resume.lines;
  const a = lines.find((l) => l.id === anchor);
  if (!a) return null;
  const headId = a.parent ?? a.id;
  const i = lines.findIndex((l) => l.id === headId);
  if (i < 0) return null;

  let company: ResumeLine | undefined;
  let team: ResumeLine | undefined;
  for (let j = i - 1; j >= 0; j--) {
    if (!team && lines[j].kind === 'team') team = lines[j];
    if (lines[j].kind === 'company') {
      company = lines[j];
      break;
    }
  }
  return {
    company,
    team,
    rows: [lines[i], ...lines.filter((l) => l.parent === headId)],
  };
}

export function ResumeSnippet({
  resume,
  anchor,
}: {
  resume?: Resume;
  anchor?: string;
}) {
  const block = resume && anchor ? projectBlock(resume, anchor) : null;
  if (!block) return null;

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 pt-2 text-[10px] text-stone-400">
        简历原文 · <span className="text-indigo-600 font-semibold">▸</span>{' '}
        标的那一行是下面所有问题在打的
      </div>
      <div className="px-3 pb-2.5 pt-1 max-h-[38vh] overflow-y-auto">
        {block.company && (
          <div className="text-[11px] font-semibold text-stone-500 mb-1.5">
            {block.company.text}
            {block.team ? ` · ${block.team.text}` : ''}
          </div>
        )}
        {block.rows.map((r) => {
          const on = r.id === anchor;
          return (
            <div
              key={r.id}
              className={`relative text-[12.5px] leading-relaxed border-l-2 ${
                r.kind === 'sub' ? 'pl-[34px]' : 'pl-5'
              } ${
                on
                  ? 'border-indigo-500 bg-indigo-50 rounded-r-md py-1 my-0.5 text-stone-700'
                  : 'border-transparent py-0.5 text-stone-400'
              }`}
            >
              <span
                className={`absolute ${r.kind === 'sub' ? 'left-5' : 'left-1.5'} ${
                  on ? 'text-indigo-600 font-bold' : 'text-stone-300'
                }`}
              >
                {on ? '▸' : '·'}
              </span>
              <Bold text={r.text} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
