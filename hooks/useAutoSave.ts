'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The unit of editing: a date and the content belonging to *that* date.
 * These two must always travel together. Passing them as separate props is what
 * let a stale content value get written to a newly selected date.
 */
export interface AutoSaveEntry {
  date: string;
  content: string;
}

interface UseAutoSaveOptions {
  entry: AutoSaveEntry | null;
  onSave: (date: string, content: string) => Promise<void>;
  delay?: number;
}

interface UseAutoSaveResult {
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
  hasUnsavedChanges: boolean;
  saveNow: () => Promise<void>;
}

/**
 * Auto-save the entry being edited, debounced.
 *
 * Two invariants keep one day's text from landing in another day's file:
 *  - every save is addressed by the date that arrived with the content, never
 *    by whatever date happens to be selected when the timer fires;
 *  - switching dates flushes the outgoing day's pending edit *to the outgoing
 *    day* before the new one becomes current.
 */
export function useAutoSave({
  entry,
  onSave,
  delay = 1000,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Last content known to be on disk, per date. Keyed by date so that selecting
  // a different day cannot inherit the previous day's baseline and mistake a
  // freshly loaded entry for an unsaved edit (or vice versa).
  const savedByDateRef = useRef<Map<string, string>>(new Map());
  const entryRef = useRef<AutoSaveEntry | null>(entry);
  const previousEntryRef = useRef<AutoSaveEntry | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in a ref so that rebuilding onSave never triggers a save by itself.
  // The old code listed it as an effect dependency, so simply selecting another
  // date re-ran the save effect with the previous day's debounced content.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const isDirty = useCallback((candidate: AutoSaveEntry | null): boolean => {
    if (!candidate) return false;
    return savedByDateRef.current.get(candidate.date) !== candidate.content;
  }, []);

  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSave = useCallback(
    async (target: AutoSaveEntry | null) => {
      if (!isDirty(target) || !target) return;

      // Claim the write up front: a flush and a debounce firing for the same
      // entry must not both hit the network.
      savedByDateRef.current.set(target.date, target.content);

      try {
        setIsSaving(true);
        setError(null);

        await onSaveRef.current(target.date, target.content);

        // Only touch the status shown in the UI if the user is still on this
        // entry — a background flush of the day they just left must not relabel
        // the day they are looking at now.
        if (entryRef.current?.date === target.date) {
          setLastSaved(new Date());
          setHasUnsavedChanges(entryRef.current.content !== target.content);
        }
      } catch (err) {
        console.error('Auto-save error:', err);
        // The write did not land, so drop the optimistic baseline and let the
        // next change retry.
        savedByDateRef.current.delete(target.date);
        setError(err instanceof Error ? err.message : 'Failed to save');
        if (entryRef.current?.date === target.date) {
          setHasUnsavedChanges(true);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [isDirty]
  );

  useEffect(() => {
    const previous = previousEntryRef.current;
    entryRef.current = entry;
    previousEntryRef.current = entry;

    // A different date means `entry.content` was just loaded from disk rather
    // than typed by the user.
    if (previous?.date !== entry?.date) {
      cancelPending();

      // Whatever was typed under the outgoing date still belongs to it.
      if (isDirty(previous)) {
        void runSave(previous);
      }

      if (entry) {
        savedByDateRef.current.set(entry.date, entry.content);
      }
      setHasUnsavedChanges(false);
      setLastSaved(null);
      setError(null);
      return;
    }

    if (!isDirty(entry)) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);
    cancelPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave(entryRef.current);
    }, delay);
  }, [entry, delay, cancelPending, isDirty, runSave]);

  // Drop a scheduled save on unmount; anything still pending was already
  // flushed by the date-change branch above.
  useEffect(() => cancelPending, [cancelPending]);

  const saveNow = useCallback(async () => {
    cancelPending();
    await runSave(entryRef.current);
  }, [cancelPending, runSave]);

  return {
    isSaving,
    lastSaved,
    error,
    hasUnsavedChanges,
    saveNow,
  };
}
