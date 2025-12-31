'use client';

import { useState, useEffect } from 'react';
import { Label, DEFAULT_LABELS } from '@/types/label';

const LABELS_STORAGE_KEY = 'diary-labels';

export function useLabels() {
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
        // Use default labels if parsing fails
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

  const addLabel = (name: string, color: string) => {
    const newLabel: Label = {
      id: Date.now().toString(),
      name,
      color,
    };
    setLabels([...labels, newLabel]);
    return newLabel;
  };

  const removeLabel = (id: string) => {
    setLabels(labels.filter(label => label.id !== id));
  };

  const updateLabel = (id: string, updates: Partial<Omit<Label, 'id'>>) => {
    setLabels(labels.map(label =>
      label.id === id ? { ...label, ...updates } : label
    ));
  };

  return {
    labels,
    addLabel,
    removeLabel,
    updateLabel,
  };
}
