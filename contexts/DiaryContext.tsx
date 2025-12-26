'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DiaryEntry } from '@/types/diary';
import { useDiaries } from '@/hooks/useDiaries';
import { useAutoSave } from '@/hooks/useAutoSave';
import { getTodayDate } from '@/lib/dateUtils';

interface DiaryContextType {
  diaries: DiaryEntry[];
  selectedDate: string | null;
  currentContent: string;
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
  hasUnsavedChanges: boolean;
  selectDiary: (date: string) => void;
  updateContent: (content: string) => void;
  createNewDiary: (date?: string) => Promise<void>;
  refreshDiaries: () => Promise<void>;
  saveNow: () => Promise<void>;
}

const DiaryContext = createContext<DiaryContextType | undefined>(undefined);

export function DiaryProvider({ children }: { children: React.ReactNode }) {
  const { diaries, isLoading: isDiariesLoading, error: diariesError, refetch } = useDiaries();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Auto-save functionality
  const saveDiary = useCallback(async (content: string) => {
    if (!selectedDate) return;

    const response = await fetch(`/api/diaries/${selectedDate}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error('Failed to save diary');
    }
  }, [selectedDate]);

  const { isSaving, lastSaved, error: saveError, hasUnsavedChanges, saveNow } = useAutoSave({
    content: currentContent,
    date: selectedDate,
    onSave: saveDiary,
  });

  // Load diary content when a diary is selected
  const loadDiaryContent = useCallback(async (date: string) => {
    try {
      setIsLoadingContent(true);
      setContentError(null);

      const response = await fetch(`/api/diaries/${date}`);

      if (response.ok) {
        const data = await response.json();
        setCurrentContent(data.entry.content || '');
      } else if (response.status === 404) {
        // Diary doesn't exist yet, set empty content
        setCurrentContent('');
      } else {
        throw new Error('Failed to load diary');
      }
    } catch (err) {
      console.error('Error loading diary:', err);
      setContentError(err instanceof Error ? err.message : 'Unknown error');
      setCurrentContent('');
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  // Select a diary
  const selectDiary = useCallback((date: string) => {
    setSelectedDate(date);
    loadDiaryContent(date);
  }, [loadDiaryContent]);

  // Update content
  const updateContent = useCallback((content: string) => {
    setCurrentContent(content);
  }, []);

  // Create a new diary entry
  const createNewDiary = useCallback(async (date?: string) => {
    const newDate = date || getTodayDate();

    try {
      setContentError(null);

      // Check if diary already exists
      const exists = diaries.some(d => d.date === newDate);

      if (exists) {
        // Just select the existing diary
        selectDiary(newDate);
        return;
      }

      // Create new diary
      const response = await fetch(`/api/diaries/${newDate}`, {
        method: 'POST',
      });

      if (response.ok || response.status === 409) {
        // Refresh the diary list
        await refetch();
        // Select the new diary
        selectDiary(newDate);
      } else {
        throw new Error('Failed to create diary');
      }
    } catch (err) {
      console.error('Error creating diary:', err);
      setContentError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [diaries, refetch, selectDiary]);

  // Refresh diaries list
  const refreshDiaries = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Auto-select today's diary on initial load
  useEffect(() => {
    if (diaries.length > 0 && !selectedDate) {
      const today = getTodayDate();
      const todayDiary = diaries.find(d => d.date === today);

      if (todayDiary) {
        selectDiary(today);
      } else {
        // Select the most recent diary
        selectDiary(diaries[0].date);
      }
    }
  }, [diaries, selectedDate, selectDiary]);

  const value: DiaryContextType = {
    diaries,
    selectedDate,
    currentContent,
    isLoading: isDiariesLoading || isLoadingContent,
    isSaving,
    lastSaved,
    error: diariesError || contentError || saveError,
    hasUnsavedChanges,
    selectDiary,
    updateContent,
    createNewDiary,
    refreshDiaries,
    saveNow,
  };

  return (
    <DiaryContext.Provider value={value}>
      {children}
    </DiaryContext.Provider>
  );
}

export function useDiaryContext() {
  const context = useContext(DiaryContext);
  if (context === undefined) {
    throw new Error('useDiaryContext must be used within a DiaryProvider');
  }
  return context;
}
