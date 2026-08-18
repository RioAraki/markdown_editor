'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { InterviewDayDoc, UnitStatus } from '@/types/interview';
import {
  ensureNotesBlock,
  parseInterviewDayDoc,
  serializeInterviewDayDoc,
  setNoteEntry,
  setTaskStatus,
  setUnitStatus,
} from '@/lib/interviewParser';

interface InterviewContextType {
  days: InterviewDayDoc[];
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  error: string | null;
  /** Inventory item ids confirmed as mastered. */
  mastery: Record<string, { status: 'mastered'; at: string; note?: string }>;
  toggleMastery: (itemId: string, mastered: boolean) => Promise<void>;
  toggleTaskStatus: (
    dateStr: string,
    blockIdx: number,
    status: UnitStatus,
    trailing?: string,
  ) => void;
  toggleUnitStatus: (
    dateStr: string,
    blockIdx: number,
    unitIdx: number,
    status: UnitStatus,
    trailing?: string,
  ) => void;
  updateNoteEntry: (
    dateStr: string,
    blockIdx: number,
    name: string,
    note: string,
  ) => void;
  saveNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

const InterviewContext = createContext<InterviewContextType | undefined>(
  undefined,
);

const AUTOSAVE_DELAY_MS = 1500;

export function InterviewProvider({ children }: { children: React.ReactNode }) {
  const [days, setDays] = useState<InterviewDayDoc[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysRef = useRef<InterviewDayDoc[]>([]);
  daysRef.current = days;
  const savedRef = useRef<Record<string, string>>({});
  savedRef.current = saved;

  const dirtyDates = days.filter(
    (d) => serializeInterviewDayDoc(d) !== saved[d.dateStr],
  );
  const hasUnsavedChanges = dirtyDates.length > 0;

  const fetchDays = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/interview');
      if (!res.ok) throw new Error('Failed to list interview days');
      const data = await res.json();
      const parsed: InterviewDayDoc[] = data.days.map(
        (d: { dateStr: string; filename: string; content: string }) =>
          ensureNotesBlock(parseInterviewDayDoc(d.content, d.filename)),
      );
      const savedMap: Record<string, string> = {};
      for (const doc of parsed) {
        savedMap[doc.dateStr] = serializeInterviewDayDoc(doc);
      }
      setDays(parsed);
      setSaved(savedMap);
      setLastSaved(null);
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError && /fetch/i.test(err.message);
      if (!isNetworkError) console.error(err);
      setError(isNetworkError ? '网络中断,稍后重试' : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const [mastery, setMastery] = useState<
    Record<string, { status: 'mastered'; at: string; note?: string }>
  >({});

  const fetchMastery = useCallback(async () => {
    try {
      const res = await fetch('/api/interview/mastery');
      if (!res.ok) return;
      setMastery(await res.json());
    } catch {
      // Mastery is supplementary — a failure here shouldn't blank the editor.
    }
  }, []);

  const toggleMastery = useCallback(
    async (itemId: string, mastered: boolean) => {
      // Optimistic: the toggle should feel instant.
      setMastery((prev) => {
        const next = { ...prev };
        if (mastered) {
          next[itemId] = {
            status: 'mastered',
            at: new Date().toISOString().slice(0, 10),
          };
        } else {
          delete next[itemId];
        }
        return next;
      });
      try {
        const res = await fetch('/api/interview/mastery', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, mastered }),
        });
        if (!res.ok) throw new Error();
        setMastery(await res.json());
      } catch {
        setError('掌握状态保存失败');
        void fetchMastery();
      }
    },
    [fetchMastery],
  );

  useEffect(() => {
    fetchDays();
    fetchMastery();
  }, [fetchDays, fetchMastery]);

  const updateDay = useCallback(
    (dateStr: string, mutator: (doc: InterviewDayDoc) => InterviewDayDoc) => {
      setDays((prev) =>
        prev.map((d) => (d.dateStr === dateStr ? mutator(d) : d)),
      );
    },
    [],
  );

  const toggleTaskStatus = useCallback(
    (dateStr: string, blockIdx: number, status: UnitStatus, trailing?: string) => {
      updateDay(dateStr, (doc) => setTaskStatus(doc, blockIdx, status, trailing));
    },
    [updateDay],
  );

  const toggleUnitStatus = useCallback(
    (
      dateStr: string,
      blockIdx: number,
      unitIdx: number,
      status: UnitStatus,
      trailing?: string,
    ) => {
      updateDay(dateStr, (doc) =>
        setUnitStatus(doc, blockIdx, unitIdx, status, trailing),
      );
    },
    [updateDay],
  );

  const updateNoteEntry = useCallback(
    (dateStr: string, blockIdx: number, name: string, note: string) => {
      updateDay(dateStr, (doc) => setNoteEntry(doc, blockIdx, name, note));
    },
    [updateDay],
  );

  const saveNowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const saveNow = useCallback(async () => {
    const currentDays = daysRef.current;
    const currentSaved = savedRef.current;
    const dirty = currentDays.filter(
      (d) => serializeInterviewDayDoc(d) !== currentSaved[d.dateStr],
    );
    if (dirty.length === 0) return;
    try {
      setIsSaving(true);
      setError(null);
      await Promise.all(
        dirty.map(async (doc) => {
          const serialized = serializeInterviewDayDoc(doc);
          const res = await fetch(`/api/interview/${doc.dateStr}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: serialized }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),
      );
      setSaved((prev) => {
        const next = { ...prev };
        for (const doc of dirty) {
          next[doc.dateStr] = serializeInterviewDayDoc(doc);
        }
        return next;
      });
      setLastSaved(new Date());
    } catch (err) {
      // Network blips are common; don't console.error them (Next dev mode turns
      // console.error into a full-screen overlay).
      const isNetworkError =
        err instanceof TypeError && /fetch/i.test(err.message);
      if (!isNetworkError) console.error(err);
      setError(isNetworkError ? '网络中断,稍后重试' : '保存失败');
      if (isNetworkError) {
        setTimeout(() => {
          void saveNowRef.current();
        }, 3000);
      }
    } finally {
      setIsSaving(false);
    }
  }, []);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (dirtyDates.length === 0) return;
    const t = setTimeout(() => {
      saveNow();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [days, saved, saveNow]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: InterviewContextType = {
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
    refresh: fetchDays,
  };

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return ctx;
}
