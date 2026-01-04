'use client';

import React, { useState } from 'react';
import { X, Globe, AlertCircle, ExternalLink } from 'lucide-react';

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  onPublish: (tokenId: string, description?: string) => Promise<void>;
  isPublished: boolean;
  currentUrl?: string;
}

export function PublishDialog({
  isOpen,
  onClose,
  date,
  onPublish,
  isPublished,
  currentUrl,
}: PublishDialogProps) {
  const [tokenId, setTokenId] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');

    if (!tokenId.trim()) {
      setError('URL slug is required');
      return;
    }

    // Validate format
    if (!/^[a-z0-9-]+$/.test(tokenId)) {
      setError('URL slug must only contain lowercase letters, numbers, and hyphens');
      return;
    }

    try {
      setIsSubmitting(true);
      await onPublish(tokenId, description || undefined);
      onClose();
      // Reset form
      setTokenId('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewUrl = tokenId ? `/special/${tokenId}` : '/special/[your-slug]';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Globe className="w-5 h-5 mr-2 text-green-600" />
                {isPublished ? 'Already Published' : 'Publish Diary Entry'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Diary date: {date}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isPublished && currentUrl ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-green-800 font-medium mb-1">
                    This entry is already published
                  </p>
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-700 hover:text-green-900 underline flex items-center gap-1"
                  >
                    {currentUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* URL Slug Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value.toLowerCase())}
                  placeholder="my-story-2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-mono"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only lowercase letters, numbers, and hyphens allowed
                </p>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short description of this entry"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={isSubmitting}
                />
              </div>

              {/* Preview URL */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-1">Preview URL:</p>
                <p className="text-sm font-mono text-gray-900 break-all">
                  {previewUrl}
                </p>
              </div>

              {/* Filename Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs font-medium text-blue-900 mb-1">Will map to file:</p>
                <p className="text-sm font-mono text-blue-800">
                  D:\diary\data\diary\{date}_public.md
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            disabled={isSubmitting}
          >
            {isPublished ? 'Close' : 'Cancel'}
          </button>
          {!isPublished && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !tokenId.trim()}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-md hover:from-green-700 hover:to-emerald-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
