'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { SteamExport, SteamDashboardData } from '@/types/steam';

interface SteamContextType {
  exports: SteamExport[];
  selectedDate: string | null;
  currentData: SteamDashboardData | null;
  isLoading: boolean;
  error: string | null;
  selectExport: (date: string) => void;
  refreshExports: () => Promise<void>;
}

const SteamContext = createContext<SteamContextType | undefined>(undefined);

export function SteamProvider({ children }: { children: React.ReactNode }) {
  const [exports, setExports] = useState<SteamExport[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentData, setCurrentData] = useState<SteamDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch list of exports
  const fetchExports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/steam');
      if (!response.ok) {
        throw new Error('Failed to fetch Steam exports');
      }

      const data = await response.json();
      setExports(data.exports || []);
    } catch (err) {
      console.error('Error fetching exports:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load specific export data
  const loadExportData = useCallback(async (date: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/steam/${date}`);
      if (!response.ok) {
        throw new Error('Failed to load Steam export');
      }

      const data = await response.json();
      setCurrentData(data.export);
    } catch (err) {
      console.error('Error loading export:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCurrentData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Select an export
  const selectExport = useCallback((date: string) => {
    setSelectedDate(date);
    loadExportData(date);
  }, [loadExportData]);

  // Refresh exports list
  const refreshExports = useCallback(async () => {
    await fetchExports();
  }, [fetchExports]);

  // Load exports on mount
  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  // Auto-select most recent export
  useEffect(() => {
    if (exports.length > 0 && !selectedDate) {
      selectExport(exports[0].date);
    }
  }, [exports, selectedDate, selectExport]);

  const value: SteamContextType = {
    exports,
    selectedDate,
    currentData,
    isLoading,
    error,
    selectExport,
    refreshExports,
  };

  return (
    <SteamContext.Provider value={value}>
      {children}
    </SteamContext.Provider>
  );
}

export function useSteamContext() {
  const context = useContext(SteamContext);
  if (context === undefined) {
    throw new Error('useSteamContext must be used within a SteamProvider');
  }
  return context;
}
