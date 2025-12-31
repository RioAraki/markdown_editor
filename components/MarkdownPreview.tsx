'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { Eye } from 'lucide-react';

export function MarkdownPreview() {
  const { currentContent, selectedDate } = useDiaryContext();

  // Remove label ID comments from preview (but keep visible label display)
  const previewContent = currentContent.replace(/<!--\s*label-ids:.*?-->\n/g, '');

  if (!selectedDate) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Preview will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Eye className="w-5 h-5 mr-2" />
          Preview
        </h2>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto p-4">
        {previewContent.trim() === '' ? (
          <p className="text-gray-400 italic">Nothing to preview yet...</p>
        ) : (
          <article className="prose prose-sm prose-slate max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewContent}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
