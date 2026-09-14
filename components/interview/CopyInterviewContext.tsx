'use client';
import { useState } from 'react';

export function CopyInterviewContext({ getText }: { getText: () => string }) {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  async function copy() {
    const text = getText();
    setMessage(''); setFallback('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setMessage('已复制上下文与提示词，可直接粘贴给 AI');
    } catch {
      setFallback(text); setMessage('浏览器未允许直接复制，请选中下方文本后按 Ctrl+C（Mac：⌘C）');
    }
  }
  return <div className="space-y-1">
    <button type="button" onClick={() => void copy()} className="text-[11px] px-2 py-1 rounded border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50" title="复制本题、当前答案、所有未移除追问与准备提示词；只写入剪贴板">复制上下文</button>
    {message && <p role="status" className="text-[11px] text-stone-500">{message}</p>}
    {fallback && <textarea aria-label="可手动复制的面试上下文" readOnly value={fallback} onFocus={e => e.target.select()} rows={8} className="w-full min-w-0 rounded border border-stone-300 p-2 text-xs" />}
  </div>;
}
