'use client';

import React, { useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { formatDisplayDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { Save, Check, AlertCircle, Loader2 } from 'lucide-react';

export function MarkdownEditor() {
  const {
    selectedDate,
    currentContent,
    updateContent,
    isSaving,
    lastSaved,
    hasUnsavedChanges,
    error,
    saveNow,
  } = useDiaryContext();

  // Add Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // Prevent browser's save dialog
        saveNow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveNow]);

  if (!selectedDate) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Select a diary entry to start editing</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {formatDisplayDate(selectedDate)}
          </h2>
          <p className="text-sm text-gray-500">{selectedDate}</p>
        </div>

        {/* Save status indicator */}
        <div className="flex items-center gap-2 text-sm">
          {isSaving && (
            <span className="flex items-center text-blue-600">
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Saving...
            </span>
          )}
          {!isSaving && lastSaved && !hasUnsavedChanges && (
            <span className="flex items-center text-green-600">
              <Check className="w-4 h-4 mr-1" />
              Saved at {format(lastSaved, 'HH:mm:ss')}
            </span>
          )}
          {!isSaving && hasUnsavedChanges && (
            <span className="flex items-center text-gray-500">
              <Save className="w-4 h-4 mr-1" />
              Unsaved changes
            </span>
          )}
          {error && (
            <span className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              Failed to save
            </span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <TextareaAutosize
          value={currentContent}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Start writing your diary entry..."
          className="w-full h-full min-h-full p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none"
          minRows={20}
        />
      </div>
    </div>
  );
}
