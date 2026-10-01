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
  const dragged = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const target = useRef<{ id: string; after: boolean } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  function endDrag() { dragged.current = null; target.current = null; setDragId(null); setDropAt(null); }
  function pointAt(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-question-id]');
    if (!row || !list.current?.contains(row)) { target.current = null; setDropAt(null); return; }
    const rect = row.getBoundingClientRect();
    const next = { id: row.dataset.questionId!, after: y > rect.top + rect.height / 2 };
    target.current = next; setDropAt(next);
  }
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
      <p className="text-xs text-stone-600">拖动题目左侧的 ⠿ 手柄调整顺序，紫色线表示放置位置。也可上下移动或指定位置，完成后点击保存顺序。</p>
      <ol ref={list} className="space-y-2">{draft.map((q, index) => <li key={q.id}
        data-question-id={q.id}
        className={`rounded border bg-white p-2 space-y-2 ${dragId === q.id ? 'opacity-40' : ''} ${dropAt?.id === q.id ? (dropAt.after ? 'border-b-indigo-600 border-b-4' : 'border-t-indigo-600 border-t-4') : 'border-stone-200'}`}>
        <div className="flex items-start gap-2">
        <button type="button" disabled={busy} aria-label={`拖动第${index + 1}题排序`} title="拖动调整顺序"
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing select-none rounded border border-stone-200 px-2 py-1 text-lg leading-none text-stone-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
          onPointerDown={e => {
            if (busy || e.button !== 0) return;
            e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
            dragged.current = q.id; setDragId(q.id);
          }}
          onPointerMove={e => {
            if (!dragged.current || busy) return;
            pointAt(e.clientX, e.clientY);
            let container = list.current?.parentElement;
            while (container) {
              if (/(auto|scroll)/.test(getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight) {
                const rect = container.getBoundingClientRect();
                if (e.clientY < rect.top + 50) container.scrollTop -= 18;
                else if (e.clientY > rect.bottom - 50) container.scrollTop += 18;
                break;
              }
              container = container.parentElement;
            }
          }}
          onPointerUp={e => {
            if (!dragged.current) return;
            pointAt(e.clientX, e.clientY);
            const from = draft.findIndex(item => item.id === dragged.current);
            const to = draft.findIndex(item => item.id === target.current?.id);
            if (!busy && from >= 0 && to >= 0) {
              const boundary = to + (target.current?.after ? 1 : 0);
              move(from, boundary > from ? boundary - 1 : boundary);
            }
            endDrag();
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={e => { if (e.key === 'Escape') endDrag(); }}>⠿</button>
        <p className="text-xs text-stone-800"><span className="mr-2 font-mono text-indigo-700">{index + 1}.</span>{q.q}{q.custom && <span className="ml-1 text-indigo-600">（自定义）</span>}</p></div>
        <div className="flex gap-2 items-center"><button type="button" className={button} aria-label={`上移第${index + 1}题`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>↑ 上移</button><button type="button" className={button} aria-label={`下移第${index + 1}题`} disabled={busy || index === draft.length - 1} onClick={() => move(index, index + 1)}>↓ 下移</button><label className="text-xs text-stone-600">移到 <select aria-label={`第${index + 1}题的目标位置`} className="rounded border border-stone-300 bg-white p-1" value={index} disabled={busy} onChange={e => move(index, Number(e.target.value))}>{draft.map((_, i) => <option key={i} value={i}>第 {i + 1} 题</option>)}</select></label></div>
      </li>)}</ol>
      <div className="flex gap-2"><button type="button" disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50" onClick={() => void save()}>{busy ? '保存中…' : '保存顺序'}</button><button type="button" disabled={busy} className={button} onClick={() => { setOpen(false); setError(''); window.dispatchEvent(new CustomEvent('interview:stories-updated')); }}>取消</button></div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}。当前调整仍保留。</p>}
    </section>}
  </div>;
}
