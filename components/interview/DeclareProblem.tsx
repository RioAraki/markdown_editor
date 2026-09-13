'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { parseProblemUnit } from '@shared/interview/leetcode';
import { useInterview } from '@/contexts/InterviewContext';
import type { TaskUnit } from '@/types/interview';

export function DeclareProblem({ dateStr, units, onAdd, disabled, onBusyChange }: {
  dateStr: string;
  units: TaskUnit[];
  onAdd: (trailing: string) => void;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { days } = useInterview();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');
  const request = useRef<AbortController | null>(null);
  const current = useRef({ days, units });
  current.current = { days, units };
  useEffect(() => {
    setOpen(false); setBusy(false); setError(''); setAdded(''); setUrl('');
    return () => { request.current?.abort(); request.current = null; onBusyChange(false); };
  }, [dateStr, onBusyChange]);
  const ids = () => {
    const day = current.current.days.find(d => d.dateStr === dateStr);
    const all = day ? day.blocks.flatMap(b => b.kind === 'task-units' ? b.units : []) : current.current.units;
    return all.map(unit => parseProblemUnit(unit.trailing)?.id).filter((id): id is number => id !== undefined);
  };
  async function submit() {
    if (request.current || disabled || !url.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); onBusyChange(true); setError(''); setAdded('');
    try {
      const response = await fetch('/api/interview/leetcode/declare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ url: url.trim(), date: dateStr, exclude: ids() }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? '申报失败，请重试');
      if (ids().includes(data.problem.id)) throw new Error(`这一天已经有 #${data.problem.id}，请直接填写原来的那一项`);
      onAdd(` ${data.unitText}`);
      window.dispatchEvent(new CustomEvent('interview:leetcode-updated'));
      setAdded(`已加入 #${data.problem.id} ${data.problem.title}，展开题目即可记录结果与批注`);
      setUrl(''); setOpen(false);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '申报失败，请重试');
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); onBusyChange(false); }
    }
  }
  return <>
    <button type="button" disabled={disabled || busy} aria-expanded={open} onClick={() => { setOpen(value => !value); setError(''); setAdded(''); }} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-stone-300 text-stone-600 bg-white hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">
      <LinkIcon className="w-3 h-3" />申报新题
    </button>
    {open && <form onSubmit={event => { event.preventDefault(); void submit(); }} className="w-full rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
      <label htmlFor={inputId} className="block text-xs text-stone-600">自己额外做的题 · 粘贴力扣中国题目链接</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input id={inputId} aria-label="力扣中国题目链接" type="url" required maxLength={2048} autoFocus value={url} onChange={event => setUrl(event.target.value)} disabled={busy} placeholder="https://leetcode.cn/problems/two-sum/" className="min-w-0 flex-1 basis-64 rounded border border-stone-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <button type="submit" disabled={busy || disabled || !url.trim()} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-40">{busy && <Loader2 className="w-3 h-3 animate-spin" />}{busy ? '识别中…' : '识别并加入'}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="text-xs text-stone-500">取消</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </form>}
    {added && <p role="status" className="w-full text-[11px] text-stone-500">{added}</p>}
  </>;
}
