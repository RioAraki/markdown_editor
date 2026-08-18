'use client';

import React, { useEffect, useState } from 'react';
import { UnitStatus } from '@/types/interview';
import {
  PartialDetail,
  buildPartialTrailing,
  parsePartialDetail,
} from '@/lib/interviewParser';

interface UnitChipProps {
  index: number;
  status: UnitStatus;
  trailing: string;
  /** Planned target from the task label, e.g. "3 题" — used as a placeholder. */
  plannedTarget?: string;
  onChange: (status: UnitStatus, trailing?: string) => void;
}

// Cycle: pending → done → partial → pending.
function nextStatus(s: UnitStatus): UnitStatus {
  if (s === 'pending') return 'done';
  if (s === 'done') return 'partial';
  return 'pending';
}

export function UnitChip({
  index,
  status,
  trailing,
  plannedTarget,
  onChange,
}: UnitChipProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  const handleTap = () => {
    const next = nextStatus(status);
    if (next === 'partial') {
      onChange('partial', trailing);
      setEditorOpen(true);
    } else {
      onChange(next);
    }
  };

  const colors = {
    pending:
      'bg-white text-stone-500 border border-stone-300 hover:border-stone-500 hover:text-stone-700',
    done: 'bg-indigo-600 text-white shadow-inner border border-indigo-600',
    partial: 'bg-amber-400 text-stone-900 border border-amber-500 shadow-inner',
  }[status];

  const detail = parsePartialDetail(trailing);
  const summary =
    status === 'partial'
      ? detail.actual || detail.note || '已记录'
      : null;

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleTap}
        aria-pressed={status !== 'pending'}
        aria-label={`Item ${index}: ${status}`}
        className={`w-11 h-11 rounded-lg font-mono text-sm font-semibold transition-all select-none touch-manipulation active:scale-95 ${colors}`}
      >
        {index}
      </button>
      {summary && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="mt-0.5 text-[10px] text-amber-700 hover:text-amber-900 max-w-[80px] truncate"
          title="编辑完成详情"
        >
          {summary}
        </button>
      )}
      {editorOpen && (
        <PartialEditor
          initial={detail}
          plannedTarget={plannedTarget}
          index={index}
          onClose={() => setEditorOpen(false)}
          onSave={(d) => {
            onChange('partial', buildPartialTrailing(d));
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PartialEditor({
  initial,
  plannedTarget,
  index,
  onClose,
  onSave,
}: {
  initial: PartialDetail;
  plannedTarget?: string;
  index: number;
  onClose: () => void;
  onSave: (detail: PartialDetail) => void;
}) {
  const [actual, setActual] = useState(initial.actual ?? '');
  const [note, setNote] = useState(initial.note ?? '');

  const handleSave = () => onSave({ actual, note });

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleSave}
        aria-label="Close"
      />
      <div className="relative w-full sm:max-w-xs rounded-xl bg-white shadow-2xl p-4 space-y-4 border border-stone-200">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-stone-500 font-medium">
            第 {index} 项 · 打折完成
          </p>
          <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
        </div>

        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">
            实际完成了多少
            {plannedTarget && (
              <span className="ml-1 text-stone-400">（计划 {plannedTarget}）</span>
            )}
          </span>
          <input
            type="text"
            value={actual}
            autoFocus
            onChange={(e) => setActual(e.target.value)}
            placeholder={plannedTarget ? `如 ${plannedTarget} 的一半` : '如 2 题 / 30 min'}
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">为什么没做完</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如 加班 / 卡在 DP"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-sm font-medium bg-stone-800 text-white rounded-md hover:bg-stone-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
