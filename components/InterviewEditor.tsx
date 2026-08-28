'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ExternalLink,
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
import { TodayPicker } from './interview/TodayPicker';
import { UnitRecord } from './interview/UnitRecord';
import { TaskNote } from './interview/TaskNote';
import { AddProblem } from './interview/AddProblem';
import { QuestionRecord, QuestionMeta } from './interview/QuestionRecord';
import { AddQuestion } from './interview/AddQuestion';
import { PaperPanel } from './interview/PaperPanel';
import { PaperUnit } from './interview/PaperUnit';
import { ChallengeRecord, ChallengeMeta } from './interview/ChallengeRecord';
import { parseQuestionUnit } from '@shared/interview/qbank';
import { OUTCOME_LABEL } from '@shared/interview/leetcode';
import type { AttemptEntry } from './interview/AttemptHistory';
import type { Resume } from '@shared/interview/resume';
import type { StoryAnswer, StoryBank } from '@shared/interview/stories';
import { usePullToRefresh } from './training/usePullToRefresh';

const PTR_THRESHOLD = 60;

/** 结果 → 小徽章配色，和 UnitRecord 里那套一致。 */
const OUTCOME_TONE_CHIP: Record<string, string> = {
  failed: 'bg-red-100 text-red-700',
  'used-solution': 'bg-orange-100 text-orange-700',
  struggled: 'bg-amber-100 text-amber-800',
  suboptimal: 'bg-lime-100 text-lime-800',
  clean: 'bg-emerald-100 text-emerald-700',
  unknown: 'bg-stone-200 text-stone-600',
};

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
  onAppendUnit: (dateStr: string, blockIdx: number, trailing: string) => void;
}

export function InterviewEditor() {
  const {
    days,
    selectedDate,
    setSelectedDate,
    isLoading,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    error,
    toggleTaskStatus,
    toggleUnitStatus,
    updateNoteEntry,
    appendUnit,
    saveNow,
    refresh,
  } = useInterview();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const today = getTodayDate();
  const shownDay = days.find((d) => d.dateStr === selectedDate);

  // problemId → 中文专题名. Only used to reveal what an already-attempted
  // problem was testing; never shown before an outcome is recorded.
  const [problemTopic, setProblemTopic] = useState<Record<number, string>>({});
  const [problemItem, setProblemItem] = useState<Record<number, string>>({});
  /** problemId → 历次尝试，供卡片展示「以前写过什么」。 */
  const [attempts, setAttempts] = useState<Record<number, AttemptEntry[]>>({});
  /** questionId → 历次作答。 */
  const [qhistory, setQhistory] = useState<Record<string, AttemptEntry[]>>({});
  /** Which paper's workbench is open, if any. */
  const [openPaper, setOpenPaper] = useState<string | null>(null);
  const [paperIds, setPaperIds] = useState<string[]>([]);
  const [cmeta, setCmeta] = useState<Record<string, ChallengeMeta>>({});
  const [canswers, setCanswers] = useState<Record<string, StoryAnswer>>({});
  /** The resume itself, so a challenge can show the line it attacks. */
  const [resume, setResume] = useState<Resume | undefined>();
  const loadStories = useCallback(() => {
    fetch('/api/interview/stories')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: {
        bank: StoryBank;
        answers: Record<string, Record<string, StoryAnswer>>;
        resume?: Resume;
      }) => {
        setResume(d.resume);
        const m: Record<string, ChallengeMeta> = {};
        for (const st of d.bank.stories ?? []) {
          for (const c of st.clusters) {
            for (const q of c.questions) {
              m[q.id] = {
                ...q,
                storyId: st.id,
                storyTitle: st.title,
                clusterTitle: c.title,
                resumeAnchor: c.resumeAnchor,
              };
            }
          }
        }
        setCmeta(m);
        const flat: Record<string, StoryAnswer> = {};
        for (const perStory of Object.values(d.answers ?? {})) {
          for (const [qid, a] of Object.entries(perStory)) flat[qid] = a;
        }
        setCanswers(flat);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadStories();
    const h = () => loadStories();
    window.addEventListener('interview:stories-updated', h);
    return () => window.removeEventListener('interview:stories-updated', h);
  }, [loadStories]);
  useEffect(() => {
    fetch('/api/interview/papers')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { ids: string[] }) => setPaperIds(d.ids ?? []))
      .catch(() => {});
  }, []);
  const [links, setLinks] = useState<{
    tasks: Record<string, string>;
    problems: Record<number, string>;
  }>({ tasks: {}, problems: {} });
  const [qmeta, setQmeta] = useState<Record<string, QuestionMeta>>({});
  const [qanswers, setQanswers] = useState<Record<string, string>>({});
  const loadQBank = useCallback(() => {
    fetch('/api/interview/qbank')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { bank: { questions: QuestionMeta & { id: string }[] }; log: Record<string, { answers: { date: string; text: string }[] }> }) => {
        const meta: Record<string, QuestionMeta> = {};
        for (const q of d.bank.questions as unknown as (QuestionMeta & { id: string })[]) {
          meta[q.id] = {
            question: q.question,
            category: q.category,
            answer: q.answer,
            url: q.url,
          };
        }
        setQmeta(meta);
        const latest: Record<string, string> = {};
        const hist: Record<string, AttemptEntry[]> = {};
        for (const [id, rec] of Object.entries(d.log ?? {})) {
          const list = rec.answers ?? [];
          const a = list[list.length - 1];
          if (a) latest[id] = a.text;
          if (list.length > 0) {
            hist[id] = list.map((x) => ({ date: x.date, text: x.text }));
          }
        }
        setQanswers(latest);
        setQhistory(hist);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadQBank();
    const h = () => loadQBank();
    window.addEventListener('interview:qbank-updated', h);
    return () => window.removeEventListener('interview:qbank-updated', h);
  }, [loadQBank]);

  useEffect(() => {
    fetch('/api/interview/tasklinks')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setLinks)
      .catch(() => {});
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/interview/leetcode')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: {
        bank: { problems: { id: number; item: string | null }[] };
        topics: Record<string, string>;
        log: Record<string, { attempts: { date: string; outcome: string; note?: string }[] }>;
      }) => {
        if (cancelled) return;
        const m: Record<number, string> = {};
        const items: Record<number, string> = {};
        for (const p of d.bank.problems) {
          if (!p.item) continue;
          items[p.id] = p.item;
          if (d.topics[p.item]) m[p.id] = d.topics[p.item];
        }
        setProblemTopic(m);
        setProblemItem(items);

        const hist: Record<number, AttemptEntry[]> = {};
        for (const [pid, rec] of Object.entries(d.log ?? {})) {
          const rows = (rec.attempts ?? [])
            .filter((a) => a.note || a.outcome !== 'unknown')
            .map((a) => ({
              date: a.date,
              verdict: OUTCOME_LABEL[a.outcome as keyof typeof OUTCOME_LABEL],
              tone: OUTCOME_TONE_CHIP[a.outcome] ?? undefined,
              text: a.note,
            }));
          if (rows.length > 0) hist[Number(pid)] = rows;
        }
        setAttempts(hist);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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

  // Only one day is on screen, so switching days starts at its top.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedDate]);

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
            {selectedDate === today ? `今天 ${today}` : `${selectedDate}（回看）`}
            <span className="ml-2 text-stone-400">共 {days.length} 天记录</span>
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
        {openPaper && (
          <PaperPanel
            paperId={openPaper}
            dateStr={selectedDate}
            onClose={() => setOpenPaper(null)}
          />
        )}
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
            {!isLoading && selectedDate === today && <TodayPicker />}
            {!isLoading && !shownDay && selectedDate !== today && (
              <div className="bg-white rounded-lg border border-stone-200 p-6 text-center">
                <p className="text-sm text-stone-500">
                  {selectedDate} 没有记录
                </p>
                <button
                  onClick={() => setSelectedDate(today)}
                  className="mt-2 text-xs text-indigo-600 hover:underline"
                >
                  回到今天
                </button>
              </div>
            )}
            {shownDay && (
              <DayCard
                key={shownDay.dateStr}
                day={shownDay}
                isToday={shownDay.dateStr === today}
                problemTopic={problemTopic}
                problemItem={problemItem}
                attempts={attempts}
                qhistory={qhistory}
                paperIds={paperIds}
                onOpenPaper={setOpenPaper}
                cmeta={cmeta}
                canswers={canswers}
                resume={resume}
                qmeta={qmeta}
                qanswers={qanswers}
                links={links}
                onToggleTaskStatus={toggleTaskStatus}
                onToggleUnitStatus={toggleUnitStatus}
                onUpdateNoteEntry={updateNoteEntry}
                onAppendUnit={appendUnit}
              />
            )}
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
  problemTopic,
  problemItem,
  attempts,
  qhistory,
  paperIds,
  onOpenPaper,
  cmeta,
  canswers,
  resume,
  qmeta,
  qanswers,
  links,
  onToggleTaskStatus,
  onToggleUnitStatus,
  onUpdateNoteEntry,
  onAppendUnit,
}: {
  day: InterviewDayDoc;
  isToday: boolean;
  problemTopic: Record<number, string>;
  problemItem: Record<number, string>;
  attempts: Record<number, AttemptEntry[]>;
  qhistory: Record<string, AttemptEntry[]>;
  paperIds: string[];
  onOpenPaper: (id: string) => void;
  cmeta: Record<string, ChallengeMeta>;
  canswers: Record<string, StoryAnswer>;
  resume?: Resume;
  qmeta: Record<string, QuestionMeta>;
  qanswers: Record<string, string>;
  links: { tasks: Record<string, string>; problems: Record<number, string> };
} & Handlers) {
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
              problemTopic={problemTopic}
              problemItem={problemItem}
              attempts={attempts}
              qhistory={qhistory}
              paperIds={paperIds}
              onOpenPaper={onOpenPaper}
              cmeta={cmeta}
              canswers={canswers}
              itemsByTask={day.itemsByTask}
              qmeta={qmeta}
              qanswers={qanswers}
              links={links}
              notesBlockIdx={notesBlockIdx}
              noteValue={
                block.kind === 'task' || block.kind === 'task-units'
                  ? (noteByName.get(taskName(block.label)) ?? '')
                  : ''
              }
              onToggleTaskStatus={onToggleTaskStatus}
              onToggleUnitStatus={onToggleUnitStatus}
              onUpdateNoteEntry={onUpdateNoteEntry}
              onAppendUnit={onAppendUnit}
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


/**
 * Strip the algorithm topic out of a 刷题 label for display.
 *
 * Naming the topic before the problem is solved is a hint, and older day files
 * were generated with it baked in — so hide it at render time rather than
 * trusting the file. Only segments that exactly match a known topic name go.
 */
function displayLabel(
  label: string,
  isProblemBlock: boolean,
  problemTopic: Record<number, string>,
): string {
  if (!isProblemBlock) return label;
  const topics = new Set(Object.values(problemTopic));
  const parts = label.split('·').map((p) => p.trim());
  return parts.filter((p, i) => i === 0 || !topics.has(p)).join(' · ');
}

function BlockRow({
  block,
  dateStr,
  blockIdx,
  problemTopic,
  problemItem,
  attempts,
  qhistory,
  paperIds,
  onOpenPaper,
  cmeta,
  canswers,
  resume,
  itemsByTask,
  qmeta,
  qanswers,
  links,
  notesBlockIdx,
  noteValue,
  onToggleTaskStatus,
  onToggleUnitStatus,
  onUpdateNoteEntry,
  onAppendUnit,
}: {
  block: InterviewBlock;
  dateStr: string;
  blockIdx: number;
  problemTopic: Record<number, string>;
  problemItem: Record<number, string>;
  attempts: Record<number, AttemptEntry[]>;
  qhistory: Record<string, AttemptEntry[]>;
  paperIds: string[];
  onOpenPaper: (id: string) => void;
  cmeta: Record<string, ChallengeMeta>;
  canswers: Record<string, StoryAnswer>;
  resume?: Resume;
  itemsByTask: Record<string, string>;
  qmeta: Record<string, QuestionMeta>;
  qanswers: Record<string, string>;
  links: { tasks: Record<string, string>; problems: Record<number, string> };
  notesBlockIdx: number;
  noteValue: string;
} & Handlers) {
  if (block.kind === 'task') {
    const name = taskName(block.label);
    return (
      <div className="py-3">
        <p
          className={`text-[15px] leading-snug select-text mb-2 ${
            block.status === 'done' ? 'text-stone-400' : 'text-stone-800'
          }`}
        >
          {block.label}
          {links.tasks[name] && (
            <a
              href={links.tasks[name]}
              target="_blank"
              rel="noreferrer"
              title="打开这一项的网站"
              className="ml-1.5 inline-flex align-middle text-stone-400 hover:text-indigo-600"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </p>
        <UnitRecord
          index={1}
          status={block.status}
          trailing={block.trailing}
          dateStr={dateStr}
          problemTopic={problemTopic}
          problemItem={problemItem}
          onChange={(s, t) => onToggleTaskStatus(dateStr, blockIdx, s, t)}
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

  if (block.kind === 'task-units') {
    const name = taskName(block.label);
    const doneCount = block.units.filter((u) => u.status !== 'pending').length;
    const total = block.units.length;
    const allDone = doneCount === total && total > 0;
    const isProblemBlock = block.units.some((u) => /#\d+/.test(u.trailing));
    const isQuestionBlock = block.units.some((u) => !!parseQuestionUnit(u.trailing));
    // A paper slot is identified by what the day bound it to, not by the unit
    // text — the checkbox itself is blank until the paper file says otherwise.
    const boundItem = itemsByTask[name];
    const paperId =
      boundItem && paperIds.includes(boundItem) ? boundItem : undefined;
    return (
      <div className="py-3">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p
            className={`text-[15px] leading-snug select-text ${
              allDone ? 'text-stone-400' : 'text-stone-800'
            }`}
          >
            {displayLabel(block.label, isProblemBlock, problemTopic)}
            {links.tasks[name] && (
              <a
                href={links.tasks[name]}
                target="_blank"
                rel="noreferrer"
                title="打开这一项的网站"
                className="ml-1.5 inline-flex align-middle text-stone-400 hover:text-indigo-600"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </p>
          <span
            className={`text-[11px] font-mono shrink-0 ${
              allDone ? 'text-emerald-600' : 'text-stone-400'
            }`}
          >
            {doneCount}/{total}
          </span>
        </div>
        <div className="space-y-1.5">
          {paperId && (
            <PaperUnit
              paperId={paperId}
              dateStr={dateStr}
              status={block.units[0]?.status ?? 'pending'}
              onChange={(st, t) => onToggleUnitStatus(dateStr, blockIdx, 0, st, t)}
              onOpen={() => onOpenPaper(paperId)}
            />
          )}
          {!paperId && block.units.map((unit, unitIdx) => {
            // `key` stays out of this object — React requires it directly on
            // the element, and spreading it there is an error.
            const common = {
              index: unitIdx + 1,
              status: unit.status,
              trailing: unit.trailing,
              dateStr,
              onChange: (s: UnitStatus, t: string) =>
                onToggleUnitStatus(dateStr, blockIdx, unitIdx, s, t),
            };
            if (/^\[[a-z]{2}-[a-z]+-\d+\]/.test(unit.trailing.trim())) {
              return (
                <ChallengeRecord
                  key={unitIdx}
                  {...common}
                  meta={cmeta}
                  saved={canswers}
                />
              );
            }
            return parseQuestionUnit(unit.trailing) ? (
              <QuestionRecord
                key={unitIdx}
                {...common}
                meta={qmeta}
                savedAnswer={qanswers}
                history={qhistory}
              />
            ) : (
              <UnitRecord
                key={unitIdx}
                {...common}
                problemTopic={problemTopic}
                problemItem={problemItem}
                attempts={attempts}
                problemUrl={links.problems}
              />
            );
          })}
        </div>
        {isProblemBlock && (
          <AddProblem
            units={block.units}
            onAdd={(trailing) => onAppendUnit(dateStr, blockIdx, trailing)}
          />
        )}
        {isQuestionBlock && (
          <AddQuestion
            units={block.units}
            onAdd={(trailing) => onAppendUnit(dateStr, blockIdx, trailing)}
          />
        )}
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
