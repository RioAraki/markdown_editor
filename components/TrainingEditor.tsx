'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  Check,
  Dumbbell,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTraining } from '@/contexts/TrainingContext';
import { getTodayDate } from '@/lib/dateUtils';
import { dayProgress } from '@/lib/trainingProgress';
import {
  NoteEntry,
  OVERALL_NOTE_NAME,
  SetStatus,
  TrainingBlock,
  TrainingDayDoc,
  exerciseName,
} from '@/types/training';
import { parsePlannedSet } from '@/lib/trainingParser';
import { SetChip } from './training/SetChip';
import { ExerciseNote } from './training/ExerciseNote';
import { usePullToRefresh } from './training/usePullToRefresh';

const PTR_THRESHOLD = 60;

interface Handlers {
  onToggleExerciseStatus: (
    dateStr: string,
    blockIdx: number,
    status: SetStatus,
    trailing?: string,
  ) => void;
  onToggleSetStatus: (
    dateStr: string,
    blockIdx: number,
    setIdx: number,
    status: SetStatus,
    trailing?: string,
  ) => void;
  onUpdateNoteEntry: (
    dateStr: string,
    blockIdx: number,
    name: string,
    note: string,
  ) => void;
}

export function TrainingEditor() {
  const {
    days,
    isLoading,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    error,
    toggleExerciseStatus,
    toggleSetStatus,
    updateNoteEntry,
    saveNow,
    refresh,
  } = useTraining();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const today = getTodayDate();
  const { pullDistance, isRefreshing } = usePullToRefresh(
    scrollContainerRef,
    refresh,
    { threshold: PTR_THRESHOLD },
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveNow]);

  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (isLoading || days.length === 0) return;
    if (!scrollContainerRef.current) return;
    const target = scrollContainerRef.current.querySelector<HTMLElement>(
      `[data-day-card="${today}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    } else {
      const pastDates = days.filter((d) => d.dateStr <= today);
      const fallback = pastDates[pastDates.length - 1] ?? days[0];
      if (fallback) {
        const el = scrollContainerRef.current.querySelector<HTMLElement>(
          `[data-day-card="${fallback.dateStr}"]`,
        );
        el?.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }
    hasScrolledRef.current = true;
  }, [days, isLoading, today]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-3 sm:px-6 py-4 pl-14 md:pl-6 border-b border-stone-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 flex items-center">
            <Dumbbell className="w-5 h-5 mr-2 text-stone-700" />
            Training Log
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {days.length} 天 · 今天: {today}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {isSaving && (
            <span className="flex items-center text-blue-600">
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Saving...
            </span>
          )}
          {!isSaving && lastSaved && !hasUnsavedChanges && (
            <span className="flex items-center text-green-600">
              <Check className="w-4 h-4 mr-1" />
              Saved {format(lastSaved, 'HH:mm:ss')}
            </span>
          )}
          {!isSaving && hasUnsavedChanges && (
            <span className="flex items-center text-stone-500">
              <Save className="w-4 h-4 mr-1" />
              Unsaved
            </span>
          )}
          {error && (
            <span className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              {error}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden bg-stone-50">
        {/* Pull-to-refresh indicator (visible only while pulling or refreshing) */}
        <div
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
          style={{
            top: Math.max(0, pullDistance - 36),
            opacity:
              isRefreshing
                ? 1
                : pullDistance > 8
                  ? Math.min(1, pullDistance / PTR_THRESHOLD)
                  : 0,
            transition:
              pullDistance === 0 && !isRefreshing
                ? 'top 200ms, opacity 200ms'
                : 'none',
          }}
        >
          <div className="bg-white rounded-full shadow-md border border-stone-200 p-2">
            <RefreshCw
              className={`w-5 h-5 text-stone-600 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                transform: isRefreshing
                  ? undefined
                  : `rotate(${Math.min(360, pullDistance * 4)}deg)`,
              }}
            />
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto"
        >
          <div
            className="px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6"
            style={{
              transform:
                pullDistance > 0
                  ? `translateY(${pullDistance}px)`
                  : undefined,
              transition:
                pullDistance === 0 ? 'transform 200ms' : 'none',
            }}
          >
            {isLoading && days.length === 0 && (
              <div className="flex items-center justify-center py-12 text-stone-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </div>
            )}
            {!isLoading && days.length === 0 && (
              <div className="text-center text-stone-500 text-sm py-12 px-4">
                还没有训练记录。先在{' '}
                <code className="bg-stone-100 px-1.5 py-0.5 rounded">
                  D:\diary\data\training\log\
                </code>{' '}
                创建一个{' '}
                <code className="bg-stone-100 px-1.5 py-0.5 rounded">
                  YYYY-MM-DD.md
                </code>{' '}
                文件。
              </div>
            )}
            {days.map((day) => (
              <DayCard
                key={day.dateStr}
                day={day}
                isToday={day.dateStr === today}
                onToggleExerciseStatus={toggleExerciseStatus}
                onToggleSetStatus={toggleSetStatus}
                onUpdateNoteEntry={updateNoteEntry}
              />
            ))}
            <div className="h-[40vh]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DayCard({
  day,
  isToday,
  onToggleExerciseStatus,
  onToggleSetStatus,
  onUpdateNoteEntry,
}: { day: TrainingDayDoc; isToday: boolean } & Handlers) {
  const { done, total } = dayProgress(day);

  // Locate the (single) notes block — created by ensureNotesBlock during parse
  const notesBlockIdx = day.blocks.findIndex((b) => b.kind === 'notes');
  const notesBlock =
    notesBlockIdx >= 0 && day.blocks[notesBlockIdx].kind === 'notes'
      ? (day.blocks[notesBlockIdx] as Extract<TrainingBlock, { kind: 'notes' }>)
      : null;

  // Build a map for fast lookup of per-exercise note text by exercise name
  const noteByName = useMemo(() => {
    const m = new Map<string, string>();
    if (notesBlock) {
      for (const e of notesBlock.entries) m.set(e.name, e.note);
    }
    return m;
  }, [notesBlock]);

  const overallNote = noteByName.get(OVERALL_NOTE_NAME) ?? '';

  return (
    <section
      data-day-card={day.dateStr}
      className={`bg-white rounded-lg border shadow-sm overflow-hidden scroll-mt-4 ${
        isToday
          ? 'border-stone-800 ring-2 ring-stone-800/10'
          : 'border-stone-200'
      }`}
    >
      <header
        className={`px-3 sm:px-5 py-3 border-b border-stone-200 flex items-center justify-between gap-2 ${
          isToday
            ? 'bg-gradient-to-r from-stone-100 to-stone-50'
            : 'bg-gradient-to-r from-stone-50 to-white'
        }`}
      >
        <h3 className="text-[15px] sm:text-base font-semibold text-stone-800 leading-snug flex items-center gap-2">
          {isToday && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-stone-800 text-white rounded">
              today
            </span>
          )}
          {day.heading}
        </h3>
        {total > 0 && (
          <span
            className={`text-xs font-mono shrink-0 ${
              done === total ? 'text-emerald-600 font-semibold' : 'text-stone-500'
            }`}
          >
            {done}/{total}
          </span>
        )}
      </header>

      <div className="px-3 sm:px-5 py-2 sm:py-3 divide-y divide-stone-100">
        {day.blocks.map((block, blockIdx) => {
          if (block.kind === 'notes') {
            // Overall note rendered separately at the bottom; per-exercise notes live with their exercise
            return null;
          }
          return (
            <BlockRow
              key={blockIdx}
              block={block}
              dateStr={day.dateStr}
              blockIdx={blockIdx}
              notesBlockIdx={notesBlockIdx}
              noteValue={
                block.kind === 'exercise'
                  ? noteByName.get(exerciseName(block.label)) ?? ''
                  : block.kind === 'exercise-sets'
                    ? noteByName.get(exerciseName(block.label)) ?? ''
                    : ''
              }
              onToggleExerciseStatus={onToggleExerciseStatus}
              onToggleSetStatus={onToggleSetStatus}
              onUpdateNoteEntry={onUpdateNoteEntry}
            />
          );
        })}
        {total === 0 && (
          <p className="text-xs text-stone-400 italic py-2">
            这一天没有动作清单。
          </p>
        )}

        {/* Overall (总体) note */}
        {notesBlockIdx >= 0 && (
          <div className="pt-3 mt-2">
            <label className="text-xs uppercase tracking-wider text-stone-400 font-medium block mb-1.5">
              总体笔记
            </label>
            <textarea
              value={overallNote}
              onChange={(e) =>
                onUpdateNoteEntry(
                  day.dateStr,
                  notesBlockIdx,
                  OVERALL_NOTE_NAME,
                  e.target.value,
                )
              }
              placeholder="今天的整体感受、调整、下次计划……"
              rows={Math.max(2, overallNote.split('\n').length)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:bg-white resize-y leading-relaxed"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function BlockRow({
  block,
  dateStr,
  blockIdx,
  notesBlockIdx,
  noteValue,
  onToggleExerciseStatus,
  onToggleSetStatus,
  onUpdateNoteEntry,
}: {
  block: TrainingBlock;
  dateStr: string;
  blockIdx: number;
  notesBlockIdx: number;
  noteValue: string;
} & Handlers) {
  if (block.kind === 'exercise') {
    const name = exerciseName(block.label);
    const planned = parsePlannedSet(block.label);
    return (
      <div className="py-3 -mx-2 px-2">
        <label className="flex items-start gap-3 cursor-pointer group">
          <SetChip
            index={1}
            status={block.status}
            trailing={block.trailing}
            planned={planned}
            onChange={(s, t) => onToggleExerciseStatus(dateStr, blockIdx, s, t)}
          />
          <span
            className={`text-[15px] leading-relaxed select-text mt-1 ${
              block.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-800'
            }`}
          >
            {block.label}
          </span>
        </label>
        {notesBlockIdx >= 0 && (
          <ExerciseNote
            value={noteValue}
            onChange={(text) =>
              onUpdateNoteEntry(dateStr, notesBlockIdx, name, text)
            }
          />
        )}
      </div>
    );
  }

  if (block.kind === 'exercise-sets') {
    const name = exerciseName(block.label);
    const planned = parsePlannedSet(block.label);
    const doneCount = block.sets.filter((s) => s.status !== 'pending').length;
    const total = block.sets.length;
    const allDone = doneCount === total && total > 0;
    return (
      <div className="py-3">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p
            className={`text-[15px] leading-snug select-text ${
              allDone ? 'text-stone-400 line-through' : 'text-stone-800'
            }`}
          >
            {block.label}
          </p>
          <span
            className={`text-[11px] font-mono shrink-0 ${
              allDone ? 'text-emerald-600' : 'text-stone-400'
            }`}
          >
            {doneCount}/{total}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {block.sets.map((set, setIdx) => (
            <SetChip
              key={setIdx}
              index={setIdx + 1}
              status={set.status}
              trailing={set.trailing}
              planned={planned}
              onChange={(s, t) =>
                onToggleSetStatus(dateStr, blockIdx, setIdx, s, t)
              }
            />
          ))}
        </div>
        {notesBlockIdx >= 0 && (
          <ExerciseNote
            value={noteValue}
            onChange={(text) =>
              onUpdateNoteEntry(dateStr, notesBlockIdx, name, text)
            }
          />
        )}
      </div>
    );
  }

  if (block.kind !== 'other') return null;
  if (block.raw.trim() === '') return null;
  return (
    <p className="text-xs text-stone-400 italic py-1 select-text">{block.raw}</p>
  );
}
