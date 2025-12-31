'use client';

import React, { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { formatDisplayDate } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { Save, Check, AlertCircle, Loader2, Cloud } from 'lucide-react';
import { LabelSelector } from './LabelSelector';
import { parseLabelsFromMarkdown, updateLabelsInMarkdown } from '@/lib/labelUtils';
import { useLabels } from '@/contexts/LabelContext';

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

          {/* Weather button */}
          <button
            onClick={handleAddWeather}
            disabled={isLoadingWeather}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Add weather data"
          >
            {isLoadingWeather ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
            {isLoadingWeather ? 'Loading...' : 'Weather'}
          </button>

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
