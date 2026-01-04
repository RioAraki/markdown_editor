'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ArchiveItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  originalDate?: string;
}

interface ArchiveContextType {
  archives: ArchiveItem[];
  selectedArchive: ArchiveItem | null;
  currentContent: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectArchive: (id: string) => void;
  updateContent: (content: string) => void;
  updateTitle: (id: string, title: string) => Promise<void>;
  createNewArchive: (title: string) => Promise<void>;
  deleteArchive: (id: string) => Promise<void>;
  saveNow: () => Promise<void>;
}

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

export function ArchiveProvider({ children }: { children: React.ReactNode }) {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<ArchiveItem | null>(null);
  const [currentContent, setCurrentContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all archives
  const fetchArchives = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/archive');
      if (response.ok) {
        const data = await response.json();
        setArchives(data.archives);
      }
    } catch (err) {
      console.error('Error fetching archives:', err);
      setError('Failed to load archives');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load archives on mount
  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  // Select archive
  const selectArchive = useCallback((id: string) => {
    const archive = archives.find(a => a.id === id);
    if (archive) {
      setSelectedArchive(archive);
      setCurrentContent(archive.content);
    }
  }, [archives]);

  // Update content
  const updateContent = useCallback((content: string) => {
    setCurrentContent(content);
  }, []);

  // Save current archive
  const saveNow = useCallback(async () => {
    if (!selectedArchive || isSaving) return;

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(`/api/archive/${selectedArchive.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedArchive.title,
          content: currentContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save archive');
      }

      // Update local state
      setArchives(archives.map(a =>
        a.id === selectedArchive.id
          ? { ...a, content: currentContent }
          : a
      ));
      setSelectedArchive({ ...selectedArchive, content: currentContent });
    } catch (err) {
      console.error('Error saving archive:', err);
      setError('Failed to save archive');
    } finally {
      setIsSaving(false);
    }
  }, [selectedArchive, currentContent, archives, isSaving]);

  // Create new archive
  const createNewArchive = useCallback(async (title: string) => {
    try {
      const response = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create archive');
      }

      const data = await response.json();
      const newArchive = data.archive;

      setArchives([newArchive, ...archives]);
      setSelectedArchive(newArchive);
      setCurrentContent('');
    } catch (err) {
      console.error('Error creating archive:', err);
      throw err;
    }
  }, [archives]);

  // Update archive title
  const updateTitle = useCallback(async (id: string, title: string) => {
    try {
      const response = await fetch(`/api/archive/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error('Failed to update title');
      }

      const data = await response.json();
      const updatedArchive = data.archive;

      // Update local state
      setArchives(archives.map(a =>
        a.id === id ? updatedArchive : a
      ));

      // Update selected archive if it's the one being edited
      if (selectedArchive?.id === id) {
        setSelectedArchive(updatedArchive);
      }
    } catch (err) {
      console.error('Error updating title:', err);
      throw err;
    }
  }, [archives, selectedArchive]);

  // Delete archive
  const deleteArchive = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/archive/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete archive');
      }

      setArchives(archives.filter(a => a.id !== id));
      if (selectedArchive?.id === id) {
        setSelectedArchive(null);
        setCurrentContent('');
      }
    } catch (err) {
      console.error('Error deleting archive:', err);
      throw err;
    }
  }, [archives, selectedArchive]);

  const value: ArchiveContextType = {
    archives,
    selectedArchive,
    currentContent,
    isLoading,
    isSaving,
    error,
    selectArchive,
    updateContent,
    updateTitle,
    createNewArchive,
    deleteArchive,
    saveNow,
  };

  return (
    <ArchiveContext.Provider value={value}>
      {children}
    </ArchiveContext.Provider>
  );
}

export function useArchive() {
  const context = useContext(ArchiveContext);
  if (context === undefined) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
}
