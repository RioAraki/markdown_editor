'use client';

import { useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, followUpPending, type StoryAnswer, type StoryBank, type StoryAnswers, type StoryQuestion } from '@shared/interview/stories';
import NoteBody from '@shared/interview/ui/NoteBody';
import { behavioralHistory } from '@/lib/interviewAnswerHistory';
import type { InterviewDayDoc } from '@/types/interview';
import { RecordingPanel } from './RecordingPanel';
import { CopyInterviewContext } from './CopyInterviewContext';
import { interviewContext } from '@/lib/interviewContext';
import { CustomResumeQuestion } from './CustomResumeQuestion';
import { AnswerTimestamps } from './AnswerTimestamps';
import { AttemptHistory } from './AttemptHistory';
import { FollowUpChain } from './FollowUpChain';
import type { Resume } from '@shared/interview/resume';

export function InterviewAnswerReview({ itemId, stories, days, resume }: {
  itemId: string;
  stories?: { bank: StoryBank; answers: StoryAnswers };
  days: InterviewDayDoc[];
  resume?: Resume;
}) {
  const [createdId, setCreatedId] = useState('');
  const story = stories?.bank.stories.find(s => s.clusters.some(c => c.id === itemId));
  const cluster = story?.clusters.find(c => c.id === itemId);
  if (story && cluster) return <div className="space-y-2" aria-label="简历问题与历史回答">
    <p className="text-[11px] text-stone-400">逐题回看与修改 · 主问题、追问、回答状态与全部本地录音</p>
    <CustomResumeQuestion key={cluster.id} storyId={story.id} clusterId={cluster.id} onCreated={setCreatedId} />
    {cluster.questions.map(question => <ResumeAnswer key={question.id} initiallyOpen={createdId === question.id} storyId={story.id} storyTitle={story.title} clusterTitle={cluster.title} resume={resume} resumeAnchor={cluster.resumeAnchor ?? story.resumeAnchor} question={question} answer={stories?.answers[story.id]?.[question.id]} />)}
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

function ResumeAnswer({ initiallyOpen, storyId, storyTitle, clusterTitle, question, answer, resume, resumeAnchor }: { initiallyOpen?: boolean; storyId: string; storyTitle: string; clusterTitle: string; question: StoryQuestion; answer?: StoryAnswer; resume?: Resume; resumeAnchor?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initiallyOpen) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [initiallyOpen]);
  const [open, setOpen] = useState(!!initiallyOpen);
  const contextTextRef = useRef<((focus?: 'main') => string) | null>(null);
  const [editing, setEditing] = useState(!!initiallyOpen && !answer?.answer);
  const [draft, setDraft] = useState(answer?.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draftKey = `interview-overview-answer:${storyId}:${question.id}`;
  useEffect(() => {
    try { const saved = localStorage.getItem(draftKey); if (saved !== null) { setDraft(saved); setEditing(true); setOpen(true); } } catch {}
  }, [draftKey]);
  const save = async (patch: { answer?: string; status?: string } = { answer: draft }) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/interview/stories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, questionId: question.id, ...patch }) });
      if (!res.ok) throw new Error('保存失败，草稿已保留，请重试。');
      if ('answer' in patch) { try { localStorage.removeItem(draftKey); } catch {} setEditing(false); }
      window.dispatchEvent(new CustomEvent('interview:stories-updated'));
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  const getContext = () => ({ question: question.q, answer: editing ? draft : answer?.answer, storyTitle, clusterTitle, resume, resumeAnchor, tests: question.tests, gaps: answer?.gaps, revisions: answer?.revisions });
  const prefix = `resume:${storyId}:${question.id}`;
  return <div ref={cardRef} className="rounded border border-stone-200 bg-white overflow-hidden">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="w-full text-left p-2.5 text-xs leading-relaxed">
      <span className="block text-stone-800">{question.custom && <span className="mr-1 text-indigo-600">自定义</span>}{question.q}</span>
      <span className={`block mt-1 text-[11px] ${answer?.status === 'struggled' ? 'text-amber-700' : 'text-stone-500'}`}>{answer?.dropped ? '这题没意义 · 已弃用' : STATUS_LABEL[answer?.status ?? 'todo']} · {open ? '收起回答' : '展开答案与录音'}</span>
      {!!answer?.followUps?.filter(f => !f.deleted).length && <span className="block text-[11px] text-indigo-600">追问待准备 {answer.followUps.filter(followUpPending).length} / {answer.followUps.filter(f => !f.deleted).length}</span>}
    </button>
    {open && <div className="border-t border-stone-100 p-2.5 space-y-3">
      <div><p className="text-[10px] text-stone-400 mb-1">当前文字答案{answer?.date ? ` · ${answer.date}` : ''}</p>
        {answer?.answer ? <NoteBody body={answer.answer} /> : <p className="text-xs text-stone-400">尚未填写文字答案，可以查看下方录音。</p>}
      </div>
      <AnswerTimestamps createdAt={answer?.createdAt ?? [answer?.date, ...(answer?.revisions ?? []).map(r => r.date)].filter(Boolean).sort()[0]} updatedAt={answer?.updatedAt ?? answer?.date} />
      {editing ? <div className="space-y-2">
        <textarea aria-label="修改主问题答案" rows={8} disabled={busy} value={draft} className="w-full rounded border border-stone-300 bg-white p-2 text-xs text-stone-800 leading-relaxed" onChange={e => { setDraft(e.target.value); try { localStorage.setItem(draftKey, e.target.value); } catch {} }} />
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">{busy ? '保存中…' : '保存答案'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); try { localStorage.removeItem(draftKey); } catch {} }} className="text-xs text-stone-600">取消修改</button></div>
      </div> : <button type="button" onClick={() => { setDraft(answer?.answer ?? ''); setEditing(true); }} className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600">{answer?.answer ? '修改答案' : '填写答案'}</button>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <label className="block text-xs text-stone-600">回答状态 <select aria-label="主问题回答状态" disabled={busy || editing} value={answer?.status ?? 'todo'} onChange={e => void save({ status: e.target.value })} className="rounded border border-stone-200 bg-white p-1">{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <CopyInterviewContext getText={() => contextTextRef.current?.('main') ?? interviewContext(getContext(), answer?.followUps ?? [], 'main')} />
      <AttemptHistory entries={(answer?.revisions ?? []).map(r => ({ date: r.date, text: r.text, verdict: r.grade, gaps: r.gaps }))} label="以前的文字版本" />
      {answer?.gaps?.length ? <div className="text-xs text-amber-700">{answer.gaps.map((gap, i) => <p key={i}>{gap}</p>)}</div> : null}
      <RecordingPanel questionKey={prefix} historyOnly={!question.custom} />
      <FollowUpChain key={prefix} items={answer?.followUps ?? []} storyId={storyId} questionId={question.id} recordingPrefix={prefix}
        getContext={getContext} contextTextRef={contextTextRef} />
    </div>}
  </div>;
}
