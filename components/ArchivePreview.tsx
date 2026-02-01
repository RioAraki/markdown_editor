'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useArchive } from '@/contexts/ArchiveContext';
import { Archive } from 'lucide-react';

export function ArchivePreview() {
  const { selectedArchive, currentContent } = useArchive();

  if (!selectedArchive) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">No archive selected</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <h2 className="text-lg font-semibold text-amber-900 flex items-center">
          <Archive className="w-5 h-5 mr-2 text-amber-600" />
          Preview
        </h2>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <article className="prose prose-sm prose-slate max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentContent}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
