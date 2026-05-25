'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { SetStatus, TrainingDayDoc } from '@/types/training';
import {
  ensureNotesBlock,
  parseTrainingDayDoc,
  serializeTrainingDayDoc,
  setExerciseStatus,
  setNoteEntry,
  setSetStatus,
} from '@/lib/trainingParser';

interface TrainingContextType {
  days: TrainingDayDoc[];
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  error: string | null;
  toggleExerciseStatus: (
    dateStr: string,
    blockIdx: number,
    status: SetStatus,
    trailing?: string,
  ) => void;
  toggleSetStatus: (
    dateStr: string,
    blockIdx: number,
    setIdx: number,
    status: SetStatus,
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

const TrainingContext = createContext<TrainingContextType | undefined>(undefined);

const AUTOSAVE_DELAY_MS = 1500;

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [days, setDays] = useState<TrainingDayDoc[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysRef = useRef<TrainingDayDoc[]>([]);
  daysRef.current = days;
  const savedRef = useRef<Record<string, string>>({});
  savedRef.current = saved;

  const dirtyDates = days.filter(
    (d) => serializeTrainingDayDoc(d) !== saved[d.dateStr],
  );
  const hasUnsavedChanges = dirtyDates.length > 0;

  const fetchDays = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/training');
      if (!res.ok) throw new Error('Failed to list training days');
      const data = await res.json();
      const parsed: TrainingDayDoc[] = data.days.map(
        (d: { dateStr: string; filename: string; content: string }) =>
          ensureNotesBlock(parseTrainingDayDoc(d.content, d.filename)),
      );
      const savedMap: Record<string, string> = {};
      for (const doc of parsed) {
        savedMap[doc.dateStr] = serializeTrainingDayDoc(doc);
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

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  const updateDay = useCallback(
    (dateStr: string, mutator: (doc: TrainingDayDoc) => TrainingDayDoc) => {
      setDays((prev) =>
        prev.map((d) => (d.dateStr === dateStr ? mutator(d) : d)),
      );
    },
    [],
  );

  const toggleExerciseStatus = useCallback(
    (
      dateStr: string,
      blockIdx: number,
      status: SetStatus,
      trailing?: string,
    ) => {
      updateDay(dateStr, (doc) =>
        setExerciseStatus(doc, blockIdx, status, trailing),
      );
    },
    [updateDay],
  );

  const toggleSetStatus = useCallback(
    (
      dateStr: string,
      blockIdx: number,
      setIdx: number,
      status: SetStatus,
      trailing?: string,
    ) => {
      updateDay(dateStr, (doc) =>
        setSetStatus(doc, blockIdx, setIdx, status, trailing),
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
      (d) => serializeTrainingDayDoc(d) !== currentSaved[d.dateStr],
    );
    if (dirty.length === 0) return;
    try {
      setIsSaving(true);
      setError(null);
      await Promise.all(
        dirty.map(async (doc) => {
          const serialized = serializeTrainingDayDoc(doc);
          const res = await fetch(`/api/training/${doc.dateStr}`, {
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
          next[doc.dateStr] = serializeTrainingDayDoc(doc);
        }
        return next;
      });
      setLastSaved(new Date());
    } catch (err) {
      // Network blips (TypeError: Failed to fetch) are common on flaky WiFi.
      // Don't console.error them — Next.js dev mode surfaces console.error as
      // a full-screen overlay, which is noise the user doesn't need.
      const isNetworkError =
        err instanceof TypeError && /fetch/i.test(err.message);
      if (!isNetworkError) {
        console.error(err);
      }
      setError(isNetworkError ? '网络中断,稍后重试' : '保存失败');
      if (isNetworkError) {
        // Schedule a retry. The dirty state is still dirty (savedRef untouched),
        // so saveNowRef.current() will resend exactly what failed.
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

  const value: TrainingContextType = {
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
    refresh: fetchDays,
  };

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining() {
  const ctx = useContext(TrainingContext);
  if (!ctx) {
    throw new Error('useTraining must be used within a TrainingProvider');
  }
  return ctx;
}
