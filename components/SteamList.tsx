'use client';

import React, { useState, useEffect } from 'react';
import { useSteamContext } from '@/contexts/SteamContext';
import { Gamepad2, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar } from './Calendar';
import { SteamSettings } from './SteamSettings';

const SIDEBAR_COLLAPSED_KEY = 'steam-sidebar-collapsed';

interface SteamListProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SteamList({ onCollapsedChange }: SteamListProps = {}) {
  const { exports, selectedDate, selectExport, isLoading } = useSteamContext();
  const [showSettings, setShowSettings] = useState(false);
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

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200 relative">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-blue-50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-indigo-800 flex items-center">
                <Gamepad2 className="w-5 h-5 mr-2 text-indigo-500" />
                Steam Activity
              </h2>
              <p className="text-sm text-indigo-600 mt-1">
                {exports.length} {exports.length === 1 ? 'week' : 'weeks'}
              </p>
            </div>
          )}
          {isCollapsed && (
            <div className="flex-1 flex justify-center">
              <Gamepad2 className="w-5 h-5 text-indigo-500" />
            </div>
          )}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isCollapsed && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                title="Steam Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={toggleCollapsed}
              className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {isLoading && exports.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : exports.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Gamepad2 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No Steam data yet</p>
              <p className="text-xs mt-1">Run scrape_steam.py to generate data</p>
            </div>
          ) : (
            <Calendar
              markedDates={exports.map(e => e.date)}
              selectedDate={selectedDate}
              onSelectDate={selectExport}
            />
          )}
        </div>
      )}

      {/* Settings Modal */}
      <SteamSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
