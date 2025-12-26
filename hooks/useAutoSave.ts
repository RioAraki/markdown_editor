'use client';

import { useEffect, useState, useRef } from 'react';
import { useDebounce } from 'use-debounce';

interface UseAutoSaveOptions {
  content: string;
  date: string | null;
  onSave: (content: string) => Promise<void>;
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
 * Hook to handle auto-saving of diary content with debouncing
 */
export function useAutoSave({
  content,
  date,
  onSave,
  delay = 1000,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const initialContentRef = useRef<string>(content);
  const lastSavedContentRef = useRef<string>(content);

  // Debounce the content
  const [debouncedContent] = useDebounce(content, delay);

  // Update initial content when date changes
  useEffect(() => {
    initialContentRef.current = content;
    lastSavedContentRef.current = content;
    setHasUnsavedChanges(false);
    setLastSaved(null);
    setError(null);
  }, [date]);

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(content !== lastSavedContentRef.current);
  }, [content]);

  // Auto-save when debounced content changes
  useEffect(() => {
    if (!date) {
      return;
    }

    // Skip if content hasn't changed from last saved
    if (debouncedContent === lastSavedContentRef.current) {
      return;
    }

    // Skip if content is the same as initial (nothing to save)
    if (debouncedContent === initialContentRef.current && !lastSaved) {
      return;
    }

    const saveContent = async () => {
      try {
        setIsSaving(true);
        setError(null);

        await onSave(debouncedContent);

        lastSavedContentRef.current = debouncedContent;
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      } catch (err) {
        console.error('Auto-save error:', err);
        setError(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setIsSaving(false);
      }
    };

    saveContent();
  }, [debouncedContent, date, onSave, lastSaved]);

  // Manual save function
  const saveNow = async () => {
    if (!date || isSaving) {
      return;
    }

    // Skip if there are no unsaved changes
    if (content === lastSavedContentRef.current) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await onSave(content);

      lastSavedContentRef.current = content;
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Manual save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    lastSaved,
    error,
    hasUnsavedChanges,
    saveNow,
  };
}
