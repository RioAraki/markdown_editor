'use client';

import React, { useState } from 'react';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { formatDisplayDate, getTodayDate } from '@/lib/dateUtils';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Plus, Calendar } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold mb-3">Diary Entries</h2>

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

      <div className="flex-1 overflow-y-auto">
        {diaries.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No diary entries yet</p>
          </div>
        ) : (
          <ul>
            {diaries.map((diary) => (
              <li key={diary.date}>
                <button
                  onClick={() => selectDiary(diary.date)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-200 transition-colors hover:bg-gray-100 ${
                    selectedDate === diary.date
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="font-medium text-gray-900">
                    {diary.date}
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatDisplayDate(diary.date)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
