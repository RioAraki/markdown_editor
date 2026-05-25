'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SetStatus } from '@/types/training';
import {
  CompromiseDetail,
  PlannedSet,
  buildCompromiseTrailing,
  parseCompromiseDetail,
} from '@/lib/trainingParser';
import { Minus, Plus } from 'lucide-react';

interface SetChipProps {
  index: number;
  status: SetStatus;
  trailing: string;
  /** Planned reps/weight extracted from the parent exercise label, used as defaults. */
  planned: PlannedSet;
  onChange: (status: SetStatus, trailing?: string) => void;
}

// Cycle order: pending → done → compromise → pending.
function nextStatus(s: SetStatus): SetStatus {
  if (s === 'pending') return 'done';
  if (s === 'done') return 'compromise';
  return 'pending';
}

export function SetChip({ index, status, trailing, planned, onChange }: SetChipProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  const handleTap = () => {
    const next = nextStatus(status);
    if (next === 'compromise') {
      onChange('compromise', trailing);
      setEditorOpen(true);
    } else {
      onChange(next);
    }
  };

  const handleSaveDetail = (text: string) => {
    onChange('compromise', text);
  };

  const colors = {
    pending:
      'bg-white text-stone-500 border border-stone-300 hover:border-stone-500 hover:text-stone-700',
    done: 'bg-emerald-600 text-white shadow-inner border border-emerald-600',
    compromise:
      'bg-amber-400 text-stone-900 border border-amber-500 shadow-inner',
  }[status];

  const detail = parseCompromiseDetail(trailing);
  const summary =
    status === 'compromise'
      ? [
          detail.reps ? `${detail.reps}次` : null,
          detail.weight ? `@${detail.weight}` : null,
        ]
          .filter(Boolean)
          .join(' ') || (detail.note ?? '已记录')
      : null;

  return (
    <div className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleTap}
        aria-pressed={status !== 'pending'}
        aria-label={`Set ${index}: ${status}`}
        className={`w-11 h-11 rounded-lg font-mono text-sm font-semibold transition-all select-none touch-manipulation active:scale-95 ${colors}`}
      >
        {index}
      </button>
      {summary && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="mt-0.5 text-[10px] text-amber-700 hover:text-amber-900 max-w-[80px] truncate"
          title="编辑妥协详情"
        >
          {summary}
        </button>
      )}
      {editorOpen && (
        <CompromiseEditor
          initial={detail}
          planned={planned}
          setIndex={index}
          onClose={() => setEditorOpen(false)}
          onSave={(d) => {
            handleSaveDetail(buildCompromiseTrailing(d));
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function defaultReps(initial: CompromiseDetail, planned: PlannedSet): number {
  if (initial.reps != null && initial.reps !== '') {
    const n = parseInt(initial.reps, 10);
    if (!Number.isNaN(n)) return n;
  }
  if (planned.maxReps != null) return planned.maxReps;
  if (planned.minReps != null) return planned.minReps;
  return 10;
}

function defaultWeight(
  initial: CompromiseDetail,
  planned: PlannedSet,
): number {
  if (initial.weight) {
    const m = /(\d+(?:\.\d+)?)/.exec(initial.weight);
    if (m) return parseFloat(m[1]);
  }
  if (planned.weightKg != null) return planned.weightKg;
  return 0;
}

function CompromiseEditor({
  initial,
  planned,
  setIndex,
  onClose,
  onSave,
}: {
  initial: CompromiseDetail;
  planned: PlannedSet;
  setIndex: number;
  onClose: () => void;
  onSave: (detail: CompromiseDetail) => void;
}) {
  const initialReps = defaultReps(initial, planned);
  const initialWeight = defaultWeight(initial, planned);

  const [reps, setReps] = useState(initialReps);
  const [weight, setWeight] = useState(initialWeight);
  const [note, setNote] = useState(initial.note ?? '');

  // Slider ranges with sensible defaults around the plan.
  const repsMax = Math.max(30, (planned.maxReps ?? 10) + 5);
  const weightMax = Math.max(50, (planned.weightKg ?? 10) * 2);

  const weightStep = 0.5;

  const formatWeight = (w: number) =>
    `${w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)}${planned.weightUnit || 'kg'}`;

  const handleSave = () => {
    onSave({
      reps: String(reps),
      weight: formatWeight(weight),
      note,
    });
  };

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  const plannedRepsLabel =
    planned.minReps != null && planned.maxReps != null
      ? planned.minReps === planned.maxReps
        ? `${planned.minReps}`
        : `${planned.minReps}-${planned.maxReps}`
      : null;

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
            第 {setIndex} 组 · 妥协详情
          </p>
          <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
        </div>

        <SliderStepper
          label="实际次数"
          plannedHint={plannedRepsLabel ? `计划 ${plannedRepsLabel}` : null}
          value={reps}
          min={0}
          max={repsMax}
          step={1}
          unit="次"
          onChange={setReps}
          display={(v) => v.toString()}
        />

        <SliderStepper
          label="实际重量"
          plannedHint={
            planned.weightKg != null
              ? `计划 ${formatWeight(planned.weightKg)}`
              : null
          }
          value={weight}
          min={0}
          max={weightMax}
          step={weightStep}
          unit={planned.weightUnit || 'kg'}
          onChange={setWeight}
          display={(v) => formatWeight(v)}
        />

        <label className="block">
          <span className="block text-xs text-stone-500 mb-1">备注</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如 腰有点酸"
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

function SliderStepper({
  label,
  plannedHint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  display,
}: {
  label: string;
  plannedHint: string | null;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  display: (v: number) => string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-stone-500">{label}</span>
        {plannedHint && (
          <span className="text-[10px] text-stone-400">{plannedHint}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StepButton
          onClick={() => onChange(clamp(value - step))}
          aria-label={`减少${label}`}
        >
          <Minus className="w-4 h-4" />
        </StepButton>
        <div className="flex-1 text-center">
          <span className="text-2xl font-bold text-stone-900 tabular-nums">
            {display(value)}
          </span>
        </div>
        <StepButton
          onClick={() => onChange(clamp(value + step))}
          aria-label={`增加${label}`}
        >
          <Plus className="w-4 h-4" />
        </StepButton>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label} 滑块`}
        className="w-full mt-1 accent-amber-500 touch-manipulation"
      />
      {/* hidden but supplies the planned-as-unit hint via title for accessibility */}
      <span className="sr-only">单位 {unit}</span>
    </div>
  );
}

function StepButton({
  onClick,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 active:bg-stone-300 transition-colors touch-manipulation"
      {...rest}
    >
      {children}
    </button>
  );
}
