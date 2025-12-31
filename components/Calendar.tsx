'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarProps {
  markedDates: string[]; // Array of dates in YYYY-MM-DD format
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

export function Calendar({ markedDates, selectedDate, onSelectDate }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const formatDateKey = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const markedDatesSet = new Set(markedDates);

  // Generate calendar days
  const days = [];

  // Add empty cells for days before the first day
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="bg-white">
      {/* Month Navigation */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <button
          onClick={previousMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-sm font-semibold text-gray-900">{monthName}</h3>
        <button
          onClick={nextMonth}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dateKey = formatDateKey(year, month, day);
            const isMarked = markedDatesSet.has(dateKey);
            const isSelected = dateKey === selectedDate;
            const isToday = isCurrentMonth && day === today.getDate();

            return (
              <button
                key={dateKey}
                onClick={() => isMarked && onSelectDate(dateKey)}
                disabled={!isMarked}
                className={`
                  aspect-square flex items-center justify-center text-sm rounded-lg transition-all
                  ${isMarked ? 'cursor-pointer' : 'cursor-default'}
                  ${isSelected
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white font-bold shadow-lg scale-105'
                    : isMarked
                    ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-800 hover:from-blue-200 hover:to-blue-300 font-medium shadow-sm'
                    : 'text-gray-300'
                  }
                  ${isToday && !isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
