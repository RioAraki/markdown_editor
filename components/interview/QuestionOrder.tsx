'use client';
import { useRef, useState } from 'react';
import type { StoryQuestion } from '@shared/interview/stories';

export function QuestionOrder({ storyId, clusterId, questions }: { storyId: string; clusterId: string; questions: StoryQuestion[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StoryQuestion[]>([]);
  const [base, setBase] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const button = 'rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 disabled:opacity-40';
  function move(from: number, to: number) {
    if (busy || to < 0 || to >= draft.length || from === to) return;
    setDraft(current => { const next = [...current]; const [question] = next.splice(from, 1); next.splice(to, 0, question); return next; });
    setError('');
  }
  async function save() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/interview/stories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, clusterId, questionIds: draft.map(q => q.id), expectedOrder: base }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败，请重试');
      setOpen(false); setSaved(true);
      window.dispatchEvent(new CustomEvent('interview:stories-updated'));
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="space-y-2">
    {!open && <div className="flex items-center gap-2"><button type="button" disabled={questions.length < 2} className={button} onClick={() => { setDraft([...questions]); setBase(questions.map(q => q.id)); setError(''); setSaved(false); setOpen(true); }}>调整题目顺序</button>{saved && <span role="status" className="text-xs text-emerald-700">顺序已保存</span>}</div>}
    {open && <section aria-label="调整主题内题目顺序" className="rounded border border-indigo-200 bg-indigo-50/30 p-2 space-y-2">
      <p className="text-xs text-stone-600">按由浅入深排列：上下移动，或直接选择目标位置。保存后应用到本主题题单。</p>
      <ol className="space-y-2">{draft.map((q, index) => <li key={q.id} className="rounded border border-stone-200 bg-white p-2 space-y-2">
        <p className="text-xs text-stone-800"><span className="mr-2 font-mono text-indigo-700">{index + 1}.</span>{q.q}{q.custom && <span className="ml-1 text-indigo-600">（自定义）</span>}</p>
        <div className="flex gap-2 items-center"><button type="button" className={button} aria-label={`上移第${index + 1}题`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>↑ 上移</button><button type="button" className={button} aria-label={`下移第${index + 1}题`} disabled={busy || index === draft.length - 1} onClick={() => move(index, index + 1)}>↓ 下移</button><label className="text-xs text-stone-600">移到 <select aria-label={`第${index + 1}题的目标位置`} className="rounded border border-stone-300 bg-white p-1" value={index} disabled={busy} onChange={e => move(index, Number(e.target.value))}>{draft.map((_, i) => <option key={i} value={i}>第 {i + 1} 题</option>)}</select></label></div>
      </li>)}</ol>
      <div className="flex gap-2"><button type="button" disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50" onClick={() => void save()}>{busy ? '保存中…' : '保存顺序'}</button><button type="button" disabled={busy} className={button} onClick={() => { setOpen(false); setError(''); window.dispatchEvent(new CustomEvent('interview:stories-updated')); }}>取消</button></div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}。当前调整仍保留。</p>}
    </section>}
  </div>;
}
