'use client';

import React, { useState } from 'react';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { getTodayDate } from '@/lib/dateUtils';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Plus, BookOpen } from 'lucide-react';
import { Calendar } from './Calendar';

export function DiaryList() {
  const {
    diaries,
    selectedDate,
    isLoading,
    selectDiary,
    createNewDiary,
  } = useDiaryContext();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDate, setNewDate] = useState(getTodayDate());

  const handleCreateNew = async () => {
    if (showDatePicker) {
      await createNewDiary(newDate);
      setShowDatePicker(false);
      setNewDate(getTodayDate());
    } else {
      setShowDatePicker(true);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h2 className="text-lg font-semibold text-blue-900 flex items-center">
          <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
          Diary Entries
        </h2>
        <p className="text-sm text-blue-600 mt-1">
          {diaries.length} {diaries.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {/* New Entry Button */}
      <div className="p-4 border-b border-gray-200">
        {showDatePicker ? (
          <div className="space-y-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleCreateNew}
                size="sm"
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-1" />
                Create
              </Button>
              <Button
                onClick={() => setShowDatePicker(false)}
                variant="secondary"
                size="sm"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleCreateNew}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        )}
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-y-auto">
        {diaries.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No diary entries yet</p>
          </div>
        ) : (
          <Calendar
            markedDates={diaries.map(d => d.date)}
            selectedDate={selectedDate}
            onSelectDate={selectDiary}
          />
        )}
      </div>
    </div>
  );
}
