'use client';

import { useState, useEffect, useCallback } from 'react';
import { DiaryEntry, DiaryListResponse } from '@/types/diary';

interface UseDiariesResult {
  diaries: DiaryEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage the list of diary entries
 */
export function useDiaries(): UseDiariesResult {
  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiaries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/diaries');

      if (!response.ok) {
        throw new Error('Failed to fetch diaries');
      }

      const data: DiaryListResponse = await response.json();
      setDiaries(data.diaries);
    } catch (err) {
      console.error('Error fetching diaries:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setDiaries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiaries();
  }, [fetchDiaries]);

  return {
    diaries,
    isLoading,
    error,
    refetch: fetchDiaries,
  };
}
