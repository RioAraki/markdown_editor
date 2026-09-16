'use client';

import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { nextResumeSection, type ResumeSectionQuestion } from '@/lib/nextResumeSection';

export function AddResumeSection({ units, meta, onAdd }: {
  units: { trailing: string }[];
  meta: Record<string, ResumeSectionQuestion>;
  onAdd: (trailing: string) => void;
}) {
  const submitting = useRef(false);
  useEffect(() => { submitting.current = false; }, [units]);
  const next = nextResumeSection(meta, units);
  return <div className="mt-3 flex items-center gap-2 flex-wrap">
    <button type="button" disabled={!next} onClick={() => {
      if (!next || submitting.current) return;
      submitting.current = true;
      for (const q of next) onAdd(` [${q.id}] ${q.q}`);
    }} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
      title="按简历题库顺序追加下一部分的全部问题，不要求当前部分答完">
      <Plus className="w-3.5 h-3.5" />继续下一部分
    </button>
    <span className="text-xs text-stone-500">{next
      ? `${next[0].storyTitle} · ${next[0].clusterTitle} · ${next.length} 问`
      : Object.keys(meta).length ? '没有后续部分可追加' : '正在加载简历题目…'}</span>
  </div>;
}
