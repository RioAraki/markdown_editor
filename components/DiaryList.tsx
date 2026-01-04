'use client';

import React, { useState, useEffect } from 'react';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { getTodayDate } from '@/lib/dateUtils';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Plus, BookOpen, ChevronLeft, ChevronRight, Archive } from 'lucide-react';
import { Calendar } from './Calendar';
import { ArchiveList } from './ArchiveList';

const SIDEBAR_COLLAPSED_KEY = 'diary-sidebar-collapsed';

interface DiaryListProps {
  onCollapsedChange?: (collapsed: boolean) => void;
  activeTab?: 'diary' | 'archive';
  onTabChange?: (tab: 'diary' | 'archive') => void;
}

export function DiaryList({ onCollapsedChange, activeTab = 'diary', onTabChange }: DiaryListProps = {}) {
  const {
    diaries,
    selectedDate,
    isLoading,
    selectDiary,
    createNewDiary,
  } = useDiaryContext();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newDate, setNewDate] = useState(getTodayDate());
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      const collapsed = stored === 'true';
      setIsCollapsed(collapsed);
      onCollapsedChange?.(collapsed);
    }
  }, [onCollapsedChange]);

  // Toggle collapsed state
  const toggleCollapsed = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newCollapsed));
    onCollapsedChange?.(newCollapsed);
  };

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
    <div className="flex flex-col h-full bg-white border-r border-gray-200 relative">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="px-4 py-3 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-blue-900 flex items-center">
                {activeTab === 'diary' ? (
                  <>
                    <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
                    Diary Entries
                  </>
                ) : (
                  <>
                    <Archive className="w-5 h-5 mr-2 text-amber-600" />
                    Archive Zone
                  </>
                )}
              </h2>
              <p className="text-sm text-blue-600 mt-1">
                {activeTab === 'diary'
                  ? `${diaries.length} ${diaries.length === 1 ? 'entry' : 'entries'}`
                  : 'Saved drafts'}
              </p>
            </div>
          )}
          {isCollapsed && (
            <div className="flex-1 flex justify-center">
              {activeTab === 'diary' ? (
                <BookOpen className="w-5 h-5 text-blue-600" />
              ) : (
                <Archive className="w-5 h-5 text-amber-600" />
              )}
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors flex-shrink-0"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Tab buttons */}
        {!isCollapsed && (
          <div className="flex border-t border-blue-100">
            <button
              onClick={() => onTabChange?.('diary')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'diary'
                  ? 'text-blue-700 bg-white border-b-2 border-blue-600'
                  : 'text-blue-600 hover:bg-blue-50'
              }`}
            >
              <BookOpen className="w-4 h-4 inline mr-1" />
              Diary
            </button>
            <button
              onClick={() => onTabChange?.('archive')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'archive'
                  ? 'text-amber-700 bg-white border-b-2 border-amber-600'
                  : 'text-blue-600 hover:bg-blue-50'
              }`}
            >
              <Archive className="w-4 h-4 inline mr-1" />
              Archive
            </button>
          </div>
        )}
      </div>

      {/* New Entry Button (only for diary tab) */}
      {!isCollapsed && activeTab === 'diary' && (
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
      )}

      {/* Content area */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'diary' ? (
            // Diary Calendar
            diaries.length === 0 ? (
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
            )
          ) : (
            // Archive List
            <ArchiveList />
          )}
        </div>
      )}
    </div>
  );
}
