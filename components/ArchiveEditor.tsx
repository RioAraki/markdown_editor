'use client';

import React, { useEffect, useState, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useArchive } from '@/contexts/ArchiveContext';
import { format } from 'date-fns';
import { Save, Check, AlertCircle, Loader2, Archive } from 'lucide-react';
import { MarkdownToolbar } from './MarkdownToolbar';

export function ArchiveEditor() {
  const {
    selectedArchive,
    currentContent,
    updateContent,
    isSaving,
    error,
    saveNow,
  } = useArchive();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track unsaved changes
  useEffect(() => {
    if (selectedArchive) {
      setHasUnsavedChanges(currentContent !== selectedArchive.content);
    }
  }, [currentContent, selectedArchive]);

  // Auto-save
  useEffect(() => {
    if (!selectedArchive || !hasUnsavedChanges) return;

    const timer = setTimeout(async () => {
      await saveNow();
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentContent, selectedArchive, hasUnsavedChanges, saveNow]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Ctrl+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNow().then(() => {
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
        });
      }
      // Ctrl+B: Bold
      else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = currentContent.substring(start, end);
        const before = currentContent.substring(0, start);
        const after = currentContent.substring(end);

        if (selectedText) {
          updateContent(before + '**' + selectedText + '**' + after);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 2, end + 2);
          }, 0);
        } else {
          updateContent(before + '**text**' + after);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 2, start + 6);
          }, 0);
        }
      }
      // Ctrl+I: Italic
      else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = currentContent.substring(start, end);
        const before = currentContent.substring(0, start);
        const after = currentContent.substring(end);

        if (selectedText) {
          updateContent(before + '*' + selectedText + '*' + after);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, end + 1);
          }, 0);
        } else {
          updateContent(before + '*text*' + after);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, start + 5);
          }, 0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveNow]);

  if (!selectedArchive) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Select an archive to start editing</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Archive className="w-5 h-5 mr-2 text-amber-600" />
            {selectedArchive.title}
          </h2>
          <p className="text-sm text-gray-500">
            {format(new Date(selectedArchive.createdAt), 'MMM d, yyyy HH:mm')}
          </p>
        </div>

        {/* Save status */}
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

      {/* Markdown Toolbar */}
      <MarkdownToolbar
        textareaRef={textareaRef}
        onContentChange={updateContent}
        content={currentContent}
      />

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <TextareaAutosize
          ref={textareaRef}
          value={currentContent}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Start writing your archive content..."
          className="w-full h-full min-h-full p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none"
          minRows={20}
        />
      </div>
    </div>
  );
}
