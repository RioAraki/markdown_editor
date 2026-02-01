'use client';

import React, { useState, useMemo } from 'react';
import { Archive, Plus, Trash2, Edit2, Check, X, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useArchive } from '@/contexts/ArchiveContext';
import { Button } from './ui/Button';

// Sanitize title to filename (client-side preview, mirrors server logic)
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

export function ArchiveList() {
  const {
    archives,
    selectedArchive,
    selectArchive,
    createNewArchive,
    updateTitle,
    deleteArchive,
    isLoading,
  } = useArchive();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Preview of generated filename
  const previewFilename = useMemo(() => {
    if (!newTitle.trim()) return '';
    return sanitizeFilename(newTitle) + '.md';
  }, [newTitle]);

  // Handle create
  const handleCreate = async () => {
    if (!newTitle.trim()) {
      alert('Title is required');
      return;
    }

    try {
      setIsCreating(true);
      await createNewArchive(newTitle);
      setShowCreateDialog(false);
      setNewTitle('');
    } catch (err) {
      alert('Failed to create archive');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle edit start
  const handleEditStart = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  // Handle edit save
  const handleEditSave = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editTitle.trim()) {
      alert('Title cannot be empty');
      return;
    }

    try {
      await updateTitle(id, editTitle);
      setEditingId(null);
      setEditTitle('');
    } catch (err) {
      alert('Failed to update title');
    }
  };

  // Handle edit cancel
  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  // Handle delete
  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`Delete archive "${title}"?`)) return;

    try {
      await deleteArchive(id);
    } catch (err) {
      alert('Failed to delete archive');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 text-center text-gray-500 text-sm">
          Loading archives...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* New Archive Button */}
        <div className="p-4 border-b border-gray-200">
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Archive
          </Button>
        </div>

        {/* Archive List */}
        <div className="flex-1 overflow-y-auto">
          {archives.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Archive className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No archives yet</p>
              <p className="text-xs mt-1">Click "New Archive" to create one</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {archives.map((archive) => (
                <div
                  key={archive.id}
                  onClick={() => editingId !== archive.id && selectArchive(archive.id)}
                  className={`p-3 cursor-pointer transition-colors group relative ${
                    selectedArchive?.id === archive.id
                      ? 'bg-amber-50 border-l-4 border-amber-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {editingId === archive.id ? (
                        <div className="flex items-center gap-1 mb-1">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 px-2 py-1 text-sm border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleEditSave(e as any, archive.id);
                              } else if (e.key === 'Escape') {
                                handleEditCancel(e as any);
                              }
                            }}
                          />
                          <button
                            onClick={(e) => handleEditSave(e, archive.id)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <h4 className={`text-sm font-medium truncate ${
                          selectedArchive?.id === archive.id
                            ? 'text-amber-900'
                            : 'text-gray-900'
                        }`}>
                          {archive.title}
                        </h4>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(archive.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                      {archive.originalDate && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          From: {archive.originalDate}
                        </p>
                      )}
                    </div>
                    {editingId !== archive.id && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => handleEditStart(e, archive.id, archive.title)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-blue-600 hover:bg-blue-50 rounded transition-opacity"
                          title="Edit title"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, archive.id, archive.title)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-opacity"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Archive</h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter archive title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) {
                    handleCreate();
                  }
                }}
              />
              {previewFilename && (
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                  <FileText className="w-4 h-4" />
                  <span>File: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-amber-700">{previewFilename}</code></span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewTitle('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !newTitle.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-md hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
