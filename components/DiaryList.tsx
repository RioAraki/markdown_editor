'use client';

import React, { useState } from 'react';
import { useDiaryContext } from '@/contexts/DiaryContext';
import { getTodayDate } from '@/lib/dateUtils';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Plus, BookOpen, ChevronLeft, ChevronRight, Archive, Dumbbell } from 'lucide-react';
import { Calendar } from './Calendar';
import { ArchiveList } from './ArchiveList';
import { TrainingList } from './TrainingList';

export type SidebarTab = 'diary' | 'archive' | 'training';

interface DiaryListProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

export function DiaryList({
  collapsed = false,
  onToggleCollapsed,
  activeTab = 'diary',
  onTabChange,
}: DiaryListProps = {}) {
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

  // Collapsed view: vertical strip with all 3 mode icons clickable + expand button.
  // Lets users switch modes without expanding (mode switching is one of the two
  // main reasons the sidebar exists).
  if (collapsed) {
    return (
      <div className="flex flex-col h-full bg-white border-r border-gray-200">
        <button
          onClick={onToggleCollapsed}
          className="flex items-center justify-center py-3 border-b border-gray-200 text-blue-600 hover:bg-blue-50 transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <CollapsedTab
          icon={<BookOpen className="w-5 h-5" />}
          label="Diary"
          active={activeTab === 'diary'}
          activeColor="text-blue-700 bg-blue-50 border-l-blue-600"
          onClick={() => onTabChange?.('diary')}
        />
        <CollapsedTab
          icon={<Archive className="w-5 h-5" />}
          label="Archive"
          active={activeTab === 'archive'}
          activeColor="text-amber-700 bg-amber-50 border-l-amber-600"
          onClick={() => onTabChange?.('archive')}
        />
        <CollapsedTab
          icon={<Dumbbell className="w-5 h-5" />}
          label="Training"
          active={activeTab === 'training'}
          activeColor="text-stone-900 bg-stone-100 border-l-stone-800"
          onClick={() => onTabChange?.('training')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 relative">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-blue-900 flex items-center">
              {activeTab === 'diary' && (
                <>
                  <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
                  Diary Entries
                </>
              )}
              {activeTab === 'archive' && (
                <>
                  <Archive className="w-5 h-5 mr-2 text-amber-600" />
                  Archive Zone
                </>
              )}
              {activeTab === 'training' && (
                <>
                  <Dumbbell className="w-5 h-5 mr-2 text-stone-700" />
                  Training Log
                </>
              )}
            </h2>
            <p className="text-sm text-blue-600 mt-1">
              {activeTab === 'diary' &&
                `${diaries.length} ${diaries.length === 1 ? 'entry' : 'entries'}`}
              {activeTab === 'archive' && 'Saved drafts'}
              {activeTab === 'training' && 'Daily check-ins'}
            </p>
          </div>
          <button
            onClick={onToggleCollapsed}
            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Tab buttons */}
        <div className="flex border-t border-blue-100">
          <button
            onClick={() => onTabChange?.('diary')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
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
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'archive'
                ? 'text-amber-700 bg-white border-b-2 border-amber-600'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            <Archive className="w-4 h-4 inline mr-1" />
            Archive
          </button>
          <button
            onClick={() => onTabChange?.('training')}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'training'
                ? 'text-stone-900 bg-white border-b-2 border-stone-800'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            <Dumbbell className="w-4 h-4 inline mr-1" />
            Training
          </button>
        </div>
      </div>

      {/* New Entry Button (only for diary tab) */}
      {activeTab === 'diary' && (
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
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'diary' && (
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
        )}
        {activeTab === 'archive' && <ArchiveList />}
        {activeTab === 'training' && <TrainingList />}
      </div>
    </div>
  );
}

function CollapsedTab({
  icon,
  label,
  active,
  activeColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeColor: string; // e.g. "text-blue-700 bg-blue-50 border-l-blue-600"
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center justify-center py-4 border-l-2 transition-colors ${
        active
          ? activeColor
          : 'text-gray-500 hover:bg-gray-50 border-l-transparent'
      }`}
    >
      {icon}
    </button>
  );
}
