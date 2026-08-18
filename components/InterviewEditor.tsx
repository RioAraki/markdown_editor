'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  Loader2,
  RefreshCw,
  Save,
  Target,
} from 'lucide-react';
import { format } from 'date-fns';
import { useInterview } from '@/contexts/InterviewContext';
import { getTodayDate } from '@/lib/dateUtils';
import { dayProgress } from '@/lib/interviewProgress';
import {
  InterviewBlock,
  InterviewDayDoc,
  OVERALL_NOTE_NAME,
  UnitStatus,
  taskName,
} from '@/types/interview';
import { parsePlannedTarget } from '@/lib/interviewParser';
import { TodayPicker } from './interview/TodayPicker';
import { UnitChip } from './interview/UnitChip';
import { TaskNote } from './interview/TaskNote';
import { usePullToRefresh } from './training/usePullToRefresh';

const PTR_THRESHOLD = 60;

interface Handlers {
  onToggleTaskStatus: (
    dateStr: string,
    blockIdx: number,
    status: UnitStatus,
    trailing?: string,
  ) => void;
  onToggleUnitStatus: (
    dateStr: string,
    blockIdx: number,
    unitIdx: number,
    status: UnitStatus,
    trailing?: string,
  ) => void;
  onUpdateNoteEntry: (
    dateStr: string,
    blockIdx: number,
    name: string,
    note: string,
  ) => void;
  /** Item id bound to this task, if the day was created with inventory binding. */
  itemsByTask: Record<string, string>;
  mastery: Record<string, { status: 'mastered'; at: string; note?: string }>;
  onToggleMastery: (itemId: string, mastered: boolean) => void;
}

export function InterviewEditor() {
  const {
    days,
    isLoading,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    error,
    mastery,
    toggleMastery,
    toggleTaskStatus,
    toggleUnitStatus,
    updateNoteEntry,
    saveNow,
    refresh,
  } = useInterview();

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
      // No record for today: land at the top where the TodayPicker sits.
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    hasScrolledRef.current = true;
  }, [days, isLoading, today]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-3 sm:px-6 py-4 pl-14 md:pl-6 border-b border-stone-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 flex items-center">
            <Target className="w-5 h-5 mr-2 text-indigo-600" />
            Interview Prep
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
        <div
          className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
          style={{
            top: Math.max(0, pullDistance - 36),
            opacity: isRefreshing
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

        <div ref={scrollContainerRef} className="h-full overflow-y-auto">
          <div
            className="px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6"
            style={{
              transform:
                pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
              transition: pullDistance === 0 ? 'transform 200ms' : 'none',
            }}
          >
            {isLoading && days.length === 0 && (
              <div className="flex items-center justify-center py-12 text-stone-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </div>
            )}
            {!isLoading && <TodayPicker />}
            {days.map((day) => (
              <DayCard
                key={day.dateStr}
                day={day}
                isToday={day.dateStr === today}
                itemsByTask={day.itemsByTask}
                mastery={mastery}
                onToggleMastery={toggleMastery}
                onToggleTaskStatus={toggleTaskStatus}
                onToggleUnitStatus={toggleUnitStatus}
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
  itemsByTask,
  mastery,
  onToggleMastery,
  onToggleTaskStatus,
  onToggleUnitStatus,
  onUpdateNoteEntry,
}: { day: InterviewDayDoc; isToday: boolean } & Handlers) {
  const { done, total } = dayProgress(day);

  const notesBlockIdx = day.blocks.findIndex((b) => b.kind === 'notes');
  const notesBlock =
    notesBlockIdx >= 0 && day.blocks[notesBlockIdx].kind === 'notes'
      ? (day.blocks[notesBlockIdx] as Extract<InterviewBlock, { kind: 'notes' }>)
      : null;

  const noteByName = useMemo(() => {
    const m = new Map<string, string>();
    if (notesBlock) for (const e of notesBlock.entries) m.set(e.name, e.note);
    return m;
  }, [notesBlock]);

  const overallNote = noteByName.get(OVERALL_NOTE_NAME) ?? '';

  return (
    <section
      data-day-card={day.dateStr}
      className={`bg-white rounded-lg border shadow-sm overflow-hidden scroll-mt-4 ${
        isToday ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-stone-200'
      }`}
    >
      <header
        className={`px-3 sm:px-5 py-3 border-b border-stone-200 flex items-center justify-between gap-2 ${
          isToday
            ? 'bg-gradient-to-r from-indigo-50 to-white'
            : 'bg-gradient-to-r from-stone-50 to-white'
        }`}
      >
        <h3 className="text-[15px] sm:text-base font-semibold text-stone-800 leading-snug flex items-center gap-2">
          {isToday && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-indigo-600 text-white rounded">
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
          if (block.kind === 'notes') return null;
          return (
            <BlockRow
              key={blockIdx}
              block={block}
              dateStr={day.dateStr}
              blockIdx={blockIdx}
              notesBlockIdx={notesBlockIdx}
              noteValue={
                block.kind === 'task' || block.kind === 'task-units'
                  ? (noteByName.get(taskName(block.label)) ?? '')
                  : ''
              }
              itemsByTask={itemsByTask}
              mastery={mastery}
              onToggleMastery={onToggleMastery}
              onToggleTaskStatus={onToggleTaskStatus}
              onToggleUnitStatus={onToggleUnitStatus}
              onUpdateNoteEntry={onUpdateNoteEntry}
            />
          );
        })}
        {total === 0 && (
          <p className="text-xs text-stone-400 italic py-2">
            这一天没有任务清单。
          </p>
        )}

        {notesBlockIdx >= 0 && (
          <div className="pt-3 mt-2">
            <label className="text-xs uppercase tracking-wider text-stone-400 font-medium block mb-1.5">
              今日复盘
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
              placeholder="今天卡在哪、学到什么、明天要补什么……"
              rows={Math.max(2, overallNote.split('\n').length)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white resize-y leading-relaxed"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** "标记已掌握" toggle — the only way an inventory item reaches 已掌握. */
function MasteryToggle({
  itemId,
  mastery,
  onToggle,
}: {
  itemId?: string;
  mastery: Record<string, { status: 'mastered'; at: string; note?: string }>;
  onToggle: (itemId: string, mastered: boolean) => void;
}) {
  if (!itemId) return null;
  const done = !!mastery[itemId];
  return (
    <button
      type="button"
      onClick={() => onToggle(itemId, !done)}
      title={
        done
          ? `已掌握 · ${mastery[itemId].at}（点击取消）`
          : '确认已掌握——标准是能不看稿讲出来'
      }
      className={`mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
        done
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
          : 'bg-white border-stone-300 text-stone-500 hover:border-emerald-400 hover:text-emerald-700'
      }`}
    >
      <Award className="w-3 h-3" />
      {done ? `已掌握 · ${mastery[itemId].at.slice(5)}` : '标记已掌握'}
    </button>
  );
}

function BlockRow({
  block,
  dateStr,
  blockIdx,
  notesBlockIdx,
  noteValue,
  itemsByTask,
  mastery,
  onToggleMastery,
  onToggleTaskStatus,
  onToggleUnitStatus,
  onUpdateNoteEntry,
}: {
  block: InterviewBlock;
  dateStr: string;
  blockIdx: number;
  notesBlockIdx: number;
  noteValue: string;
} & Handlers) {
  if (block.kind === 'task') {
    const name = taskName(block.label);
    return (
      <div className="py-3 -mx-2 px-2">
        <label className="flex items-start gap-3 cursor-pointer group">
          <UnitChip
            index={1}
            status={block.status}
            trailing={block.trailing}
            plannedTarget={parsePlannedTarget(block.label)}
            onChange={(s, t) => onToggleTaskStatus(dateStr, blockIdx, s, t)}
          />
          <span
            className={`text-[15px] leading-relaxed select-text mt-1 ${
              block.status === 'done'
                ? 'text-stone-400 line-through'
                : 'text-stone-800'
            }`}
          >
            {block.label}
          </span>
        </label>
        <div className="flex items-start gap-2 flex-wrap">
          <MasteryToggle
            itemId={itemsByTask[name]}
            mastery={mastery}
            onToggle={onToggleMastery}
          />
        </div>
        {notesBlockIdx >= 0 && (
          <TaskNote
            value={noteValue}
            onChange={(text) =>
              onUpdateNoteEntry(dateStr, notesBlockIdx, name, text)
            }
          />
        )}
      </div>
    );
  }

  if (block.kind === 'task-units') {
    const name = taskName(block.label);
    const doneCount = block.units.filter((u) => u.status !== 'pending').length;
    const total = block.units.length;
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
          {block.units.map((unit, unitIdx) => (
            <UnitChip
              key={unitIdx}
              index={unitIdx + 1}
              status={unit.status}
              trailing={unit.trailing}
              plannedTarget={parsePlannedTarget(block.label)}
              onChange={(s, t) =>
                onToggleUnitStatus(dateStr, blockIdx, unitIdx, s, t)
              }
            />
          ))}
        </div>
        <MasteryToggle
          itemId={itemsByTask[name]}
          mastery={mastery}
          onToggle={onToggleMastery}
        />
        {notesBlockIdx >= 0 && (
          <TaskNote
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
  if (block.raw.trim().startsWith('<!--')) return null;
  return (
    <p className="text-xs text-stone-400 italic py-1 select-text">{block.raw}</p>
  );
}
