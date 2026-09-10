'use client';

import { useState } from 'react';
import { STATUS_LABEL, type StoryAnswer, type StoryBank, type StoryAnswers, type StoryQuestion } from '@shared/interview/stories';
import NoteBody from '@shared/interview/ui/NoteBody';
import { behavioralHistory } from '@/lib/interviewAnswerHistory';
import type { InterviewDayDoc } from '@/types/interview';
import { RecordingPanel } from './RecordingPanel';
import { AttemptHistory } from './AttemptHistory';

export function InterviewAnswerReview({ itemId, stories, days }: {
  itemId: string;
  stories?: { bank: StoryBank; answers: StoryAnswers };
  days: InterviewDayDoc[];
}) {
  const story = stories?.bank.stories.find(s => s.clusters.some(c => c.id === itemId));
  const cluster = story?.clusters.find(c => c.id === itemId);
  if (story && cluster) return <div className="space-y-2" aria-label="简历问题与历史回答">
    <p className="text-[11px] text-stone-400">逐题回看 · 文字答案、回答状态与全部本地录音</p>
    {cluster.questions.map(question => <ResumeAnswer key={question.id} storyId={story.id} question={question} answer={stories?.answers[story.id]?.[question.id]} />)}
  </div>;
  if (!itemId.startsWith('bh-')) return null;
  const history = behavioralHistory(days, itemId);
  return <div className="space-y-3" aria-label="行为故事历史回答">
    <p className="text-[11px] text-stone-400">历次文字回答 · 最新在前</p>
    {history.length === 0 && <p className="text-xs text-stone-500">还没有文字回答。</p>}
    {history.map((entry, index) => <div key={`${entry.date}:${index}`} className="rounded border border-stone-200 bg-white p-2.5 space-y-2">
      <div className="text-[11px] text-stone-500">{entry.date}<span className="ml-2">{entry.status === 'done' ? '已完成' : entry.status === 'partial' ? '磕磕绊绊 / 部分完成' : '未完成'}</span></div>
      {entry.text ? <NoteBody body={entry.text} /> : <p className="text-xs text-stone-400">本次没有填写文字答案。</p>}
      {entry.note && <div className="border-t border-stone-100 pt-2"><span className="text-[10px] text-stone-400">当次笔记</span><NoteBody body={entry.note} /></div>}
    </div>)}
    <RecordingPanel questionKey={`behavioral:${itemId}`} historyOnly />
  </div>;
}

function ResumeAnswer({ storyId, question, answer }: { storyId: string; question: StoryQuestion; answer?: StoryAnswer }) {
  const [open, setOpen] = useState(false);
  const prefix = `resume:${storyId}:${question.id}`;
  return <div className="rounded border border-stone-200 bg-white overflow-hidden">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="w-full text-left p-2.5 text-xs leading-relaxed">
      <span className="block text-stone-800">{question.q}</span>
      <span className={`block mt-1 text-[11px] ${answer?.status === 'struggled' ? 'text-amber-700' : 'text-stone-500'}`}>{answer?.dropped ? '这题没意义 · 已弃用' : STATUS_LABEL[answer?.status ?? 'todo']} · {open ? '收起回答' : '展开答案与录音'}</span>
    </button>
    {open && <div className="border-t border-stone-100 p-2.5 space-y-3">
      <div><p className="text-[10px] text-stone-400 mb-1">当前文字答案{answer?.date ? ` · ${answer.date}` : ''}</p>
        {answer?.answer ? <NoteBody body={answer.answer} /> : <p className="text-xs text-stone-400">尚未填写文字答案，可以查看下方录音。</p>}
      </div>
      <AttemptHistory entries={(answer?.revisions ?? []).map(r => ({ date: r.date, text: r.text, verdict: r.grade, gaps: r.gaps }))} label="以前的文字版本" />
      {answer?.gaps?.length ? <div className="text-xs text-amber-700">{answer.gaps.map((gap, i) => <p key={i}>{gap}</p>)}</div> : null}
      <RecordingPanel questionKey={prefix} historyOnly />
      {answer?.followUps?.map(follow => <details key={follow.id} className="border-l-2 border-stone-200 pl-2">
        <summary className="cursor-pointer text-xs text-stone-600">追问 {follow.id} · {follow.q} · {follow.stuck ? '答不上来' : follow.answer ? '已作答' : '未答'}</summary>
        <div className="mt-2">{follow.answer ? <NoteBody body={follow.answer} /> : <p className="text-xs text-stone-400">尚未填写文字答案。</p>}</div>
        {/^[0-9]+(?:\.[0-9]+)*$/.test(follow.id) && <RecordingPanel questionKey={`${prefix}-followup-${follow.id.replaceAll('.', '-')}`} historyOnly />}
      </details>)}
    </div>}
  </div>;
}
