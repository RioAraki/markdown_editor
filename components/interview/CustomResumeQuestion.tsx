'use client';
import { useEffect, useRef, useState } from 'react';

export function CustomResumeQuestion({ storyId, clusterId, onCreated }: { storyId: string; clusterId: string; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useRef('');
  const submitting = useRef(false);
  const key = `custom-resume-question:${storyId}:${clusterId}`;
  const keep = (text: string) => { try { localStorage.setItem(key, JSON.stringify({ question: text, id: id.current })); } catch {} };
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); if (saved && typeof saved.question === 'string') { setQuestion(saved.question); id.current = saved.id ?? ''; setOpen(true); } } catch {}
  }, [key]);
  async function create() {
    if (submitting.current || !question.trim()) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      if (!id.current) id.current = 'cq-custom-' + Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString().padStart(10, '0')).join('');
      keep(question);
      const response = await fetch('/api/interview/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, clusterId, id: id.current, question }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败，请重试');
      onCreated(data.question.id);
      try { localStorage.removeItem(key); } catch {}
      id.current = ''; setQuestion(''); setOpen(false);
      window.dispatchEvent(new CustomEvent('interview:stories-updated'));
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="rounded border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-2">
    <button type="button" onClick={() => setOpen(value => !value)} disabled={busy} className="text-xs text-indigo-700">＋ 自定义问题</button>
    {open && <form onSubmit={e => { e.preventDefault(); void create(); }} className="space-y-2">
      <p className="text-[11px] text-stone-600">新增到当前分类，与现有问题平级。添加后可独立填写答案、录音和继续追问。</p>
      <textarea aria-label="自定义独立问题" rows={3} required maxLength={2000} disabled={busy} value={question} onChange={e => { setQuestion(e.target.value); keep(e.target.value); }} className="w-full rounded border border-stone-300 bg-white p-2 text-xs text-stone-800" placeholder="记录面试官问到的新问题，不需要选择原问题。" />
      <button type="submit" disabled={busy || !question.trim()} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">{busy ? '添加中…' : '添加问题并准备回答'}</button>
      {error && <p role="alert" className="text-xs text-rose-700">{error} · 草稿已保留</p>}
    </form>}
  </div>;
}
