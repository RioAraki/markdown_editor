'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Label, DEFAULT_LABELS } from '@/types/label';

const LABELS_STORAGE_KEY = 'diary-labels';

interface LabelContextType {
  labels: Label[];
  addLabel: (name: string, color: string) => Label;
  removeLabel: (id: string) => void;
  updateLabel: (id: string, updates: Partial<Omit<Label, 'id'>>) => void;
}

const LabelContext = createContext<LabelContextType | undefined>(undefined);

export function LabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load labels from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LABELS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLabels(parsed);
      } catch (err) {
        console.error('Failed to parse labels from localStorage:', err);
        setLabels(DEFAULT_LABELS);
      }
    } else {
      // First time: use default labels
      setLabels(DEFAULT_LABELS);
    }
    setIsInitialized(true);
  }, []);

  // Save labels to localStorage whenever they change (after initialization)
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
    }
  }, [labels, isInitialized]);

  const addLabel = useCallback((name: string, color: string) => {
    const newLabel: Label = {
      id: Date.now().toString(),
      name,
      color,
    };
    setLabels(prev => [...prev, newLabel]);
    return newLabel;
  }, []);

  const removeLabel = useCallback((id: string) => {
    setLabels(prev => prev.filter(label => label.id !== id));
  }, []);

  const updateLabel = useCallback((id: string, updates: Partial<Omit<Label, 'id'>>) => {
    setLabels(prev => prev.map(label =>
      label.id === id ? { ...label, ...updates } : label
    ));
  }, []);

  const value: LabelContextType = {
    labels,
    addLabel,
    removeLabel,
    updateLabel,
  };

  return (
    <LabelContext.Provider value={value}>
      {children}
    </LabelContext.Provider>
  );
}

export function useLabels() {
  const context = useContext(LabelContext);
  if (context === undefined) {
    throw new Error('useLabels must be used within a LabelProvider');
  }
  return context;
}
