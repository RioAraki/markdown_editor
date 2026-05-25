'use client';

import React from 'react';
import { Menu } from 'lucide-react';

interface ThreeColumnLayoutProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right?: React.ReactNode;
  leftCollapsed?: boolean;
  onToggleLeft?: () => void;
}

export function ThreeColumnLayout({
  left,
  middle,
  right,
  leftCollapsed = false,
  onToggleLeft,
}: ThreeColumnLayoutProps) {
  const showRight = right !== undefined && right !== null;

  // Desktop (lg+) supports 3-column with optional right pane
  const lgCols = leftCollapsed
    ? showRight ? 'lg:grid-cols-[60px_1fr_1fr]' : 'lg:grid-cols-[60px_1fr]'
    : showRight ? 'lg:grid-cols-[300px_1fr_1fr]' : 'lg:grid-cols-[300px_1fr]';
  // Tablet (md..<lg): always 2-column (sidebar + editor). Right pane hidden.
  const mdCols = leftCollapsed
    ? 'md:grid-cols-[60px_1fr]'
    : 'md:grid-cols-[260px_1fr]';

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Tablet + desktop (md+): sidebar is a persistent column */}
      <div
        className={`hidden md:grid h-full overflow-hidden transition-all duration-300 ${mdCols} ${lgCols}`}
      >
        <div className="border-r border-gray-200 h-full overflow-y-auto">
          {left}
        </div>
        <div className={`${showRight ? 'lg:border-r lg:border-gray-200' : ''} h-full overflow-hidden`}>
          {middle}
        </div>
        {showRight && (
          <div className="hidden lg:block h-full overflow-y-auto">
            {right}
          </div>
        )}
      </div>

      {/* Phone (<md): editor is full-width; sidebar is an overlay drawer when expanded */}
      <div className="md:hidden h-full overflow-hidden relative">
        <div className="h-full">{middle}</div>

        {/* Hamburger button (visible when sidebar is collapsed/hidden) */}
        {leftCollapsed && (
          <button
            onClick={onToggleLeft}
            className="fixed left-2 top-2 z-30 w-10 h-10 flex items-center justify-center bg-white/95 backdrop-blur-sm border border-gray-200 rounded-md shadow-md text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Backdrop + sidebar overlay (visible when sidebar is expanded) */}
        {!leftCollapsed && (
          <>
            <div
              onClick={onToggleLeft}
              className="fixed inset-0 z-40 bg-black/40"
              aria-label="Close menu"
            />
            <div className="fixed left-0 top-0 bottom-0 z-50 w-[85vw] max-w-[320px] bg-white shadow-2xl overflow-y-auto">
              {left}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
