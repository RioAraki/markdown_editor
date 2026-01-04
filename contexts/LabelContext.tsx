'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Label, DEFAULT_LABELS } from '@/types/label';

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

  // Load labels from API on mount
  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const response = await fetch('/api/labels');
        if (response.ok) {
          const data = await response.json();
          setLabels(data.labels);
        } else {
          console.error('Failed to load labels from API');
          setLabels(DEFAULT_LABELS);
        }
      } catch (err) {
        console.error('Error fetching labels:', err);
        setLabels(DEFAULT_LABELS);
      }
      setIsInitialized(true);
    };

    fetchLabels();
  }, []);

  // Save labels to API whenever they change (after initialization)
  useEffect(() => {
    if (isInitialized && labels.length > 0) {
      const saveLabels = async () => {
        try {
          await fetch('/api/labels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels }),
          });
        } catch (err) {
          console.error('Error saving labels:', err);
        }
      };

      saveLabels();
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
