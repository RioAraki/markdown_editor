'use client';

import React, { useEffect, useState, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { formatDisplayDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { Save, Check, AlertCircle, Loader2, Cloud, FileCheck, Globe, ExternalLink } from 'lucide-react';
import { LabelSelector } from './LabelSelector';
import { AuditDialog } from './AuditDialog';
import { PublishDialog } from './PublishDialog';
import { MarkdownToolbar } from './MarkdownToolbar';
import { parseLabelsFromMarkdown, updateLabelsInMarkdown } from '@/lib/labelUtils';
import { useLabels } from '@/contexts/LabelContext';
import { runAudit, AuditResult } from '@/lib/auditRules';

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

  const { labels } = useLabels();
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{
    isPublished: boolean;
    tokenId?: string;
    url?: string;
    fileExists?: boolean;
  }>({ isPublished: false });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse labels from content when it changes
  useEffect(() => {
    const labelIds = parseLabelsFromMarkdown(currentContent);
    setSelectedLabels(labelIds);
  }, [currentContent, selectedDate]);

  // Handle label changes
  const handleLabelsChange = (labelIds: string[]) => {
    const updatedContent = updateLabelsInMarkdown(currentContent, labelIds, labels);
    updateContent(updatedContent);
  };

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Ctrl+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
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

  // Fetch weather and append to content
  const handleAddWeather = async () => {
    if (isLoadingWeather) return;

    try {
      setIsLoadingWeather(true);

      // Hardcoded coordinates for Shanghai
      const latitude = 31.2304;
      const longitude = 121.4737;

      // Fetch weather data
      const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`);
      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const weatherData = await response.json();

      // Format weather metadata
      const now = new Date();

      // Remove existing weather data if present
      let contentWithoutWeather = currentContent;
      contentWithoutWeather = contentWithoutWeather.replace(
        /- \*\*Time:\*\*[^\n]*\n- \*\*Location:\*\*[^\n]*\n- \*\*Weather:\*\*[^\n]*\n- \*\*Temperature:\*\*[^\n]*\n- \*\*Feels Like:\*\*[^\n]*\n- \*\*Humidity:\*\*[^\n]*\n- \*\*Wind Speed:\*\*[^\n]*\n/g,
        ''
      );

      // Check if there's already a metadata section
      const hasMetadataSection = contentWithoutWeather.includes('\n---\n');

      let weatherMetadata = '';
      if (hasMetadataSection) {
        // Append to existing metadata section
        weatherMetadata = `- **Time:** ${format(now, 'yyyy-MM-dd HH:mm:ss')}
- **Location:** ${weatherData.location}
- **Weather:** ${weatherData.weather}
- **Temperature:** ${weatherData.temperature}°C
- **Feels Like:** ${weatherData.feelsLike}°C
- **Humidity:** ${weatherData.humidity}%
- **Wind Speed:** ${weatherData.windSpeed} m/s
`;
      } else {
        // Create new metadata section
        weatherMetadata = `

---

- **Time:** ${format(now, 'yyyy-MM-dd HH:mm:ss')}
- **Location:** ${weatherData.location}
- **Weather:** ${weatherData.weather}
- **Temperature:** ${weatherData.temperature}°C
- **Feels Like:** ${weatherData.feelsLike}°C
- **Humidity:** ${weatherData.humidity}%
- **Wind Speed:** ${weatherData.windSpeed} m/s
`;
      }

      // Append to current content
      updateContent(contentWithoutWeather + weatherMetadata);
    } catch (err) {
      console.error('Error fetching weather:', err);
      alert('Failed to fetch weather data for Shanghai. Please try again.');
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Handle audit
  const handleAudit = () => {
    const result = runAudit(currentContent);
    setAuditResult(result);
    setShowAuditDialog(true);
  };

  // Handle audit confirmation
  const handleAuditConfirm = () => {
    if (auditResult) {
      updateContent(auditResult.fixedText);
    }
  };

  // Fetch publish status when date changes
  useEffect(() => {
    const fetchPublishStatus = async () => {
      if (!selectedDate) return;

      try {
        const response = await fetch(`/api/publish/${selectedDate}`);
        if (response.ok) {
          const data = await response.json();
          setPublishStatus(data);
        }
      } catch (err) {
        console.error('Error fetching publish status:', err);
      }
    };

    fetchPublishStatus();
  }, [selectedDate]);

  // Handle publish
  const handlePublish = async (tokenId: string, description?: string) => {
    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, tokenId, description }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish');
      }

      const data = await response.json();
      setPublishStatus({
        isPublished: true,
        tokenId: data.tokenId,
        url: data.url,
        fileExists: true,
      });

      alert(`Published successfully at ${data.url}`);
    } catch (err) {
      throw err; // Re-throw to be handled by PublishDialog
    }
  };

  // Handle unpublish
  const handleUnpublish = async () => {
    if (!confirm('Are you sure you want to unpublish this entry?')) {
      return;
    }

    try {
      const response = await fetch('/api/publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unpublish');
      }

      setPublishStatus({ isPublished: false });
      alert('Unpublished successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unpublish');
    }
  };

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

        {/* Actions and status */}
        <div className="flex items-center gap-3">
          {/* Label selector */}
          <LabelSelector
            selectedLabels={selectedLabels}
            onLabelsChange={handleLabelsChange}
          />

          {/* Publish status (when published) */}
          {publishStatus.isPublished && (
            <div className="flex items-center gap-2">
              <a
                href={publishStatus.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
                title="View published entry"
              >
                <Globe className="w-4 h-4" />
                Published
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={handleUnpublish}
                className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                title="Unpublish this entry"
              >
                Unpublish
              </button>
            </div>
          )}

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
      </div>

      {/* Markdown Toolbar */}
      <MarkdownToolbar
        textareaRef={textareaRef}
        onContentChange={updateContent}
        content={currentContent}
        onWeatherClick={handleAddWeather}
        isLoadingWeather={isLoadingWeather}
        onAuditClick={handleAudit}
        onPublishClick={() => setShowPublishDialog(true)}
        isPublished={publishStatus.isPublished}
        publishDisabled={!publishStatus.fileExists}
      />

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <textarea
          ref={textareaRef}
          value={currentContent}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Start writing your diary entry..."
          className="w-full h-full p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none overflow-y-auto"
        />
      </div>

      {/* Audit Dialog */}
      <AuditDialog
        isOpen={showAuditDialog}
        onClose={() => setShowAuditDialog(false)}
        result={auditResult}
        onConfirm={handleAuditConfirm}
      />

      {/* Publish Dialog */}
      <PublishDialog
        isOpen={showPublishDialog}
        onClose={() => setShowPublishDialog(false)}
        date={selectedDate || ''}
        onPublish={handlePublish}
        isPublished={publishStatus.isPublished}
        currentUrl={publishStatus.url}
      />
    </div>
  );
}
