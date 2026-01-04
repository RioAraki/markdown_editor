'use client';

import React from 'react';

interface ThreeColumnLayoutProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
  leftCollapsed?: boolean;
}

export function ThreeColumnLayout({ left, middle, right, leftCollapsed = false }: ThreeColumnLayoutProps) {
  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Desktop: Three columns */}
      <div className={`hidden lg:grid h-full overflow-hidden transition-all duration-300 ${
        leftCollapsed ? 'lg:grid-cols-[60px_1fr_1fr]' : 'lg:grid-cols-[300px_1fr_1fr]'
      }`}>
        <div className="border-r border-gray-200 h-full overflow-y-auto">
          {left}
        </div>
        <div className="border-r border-gray-200 h-full">
          {middle}
        </div>
        <div className="h-full overflow-y-auto">
          {right}
        </div>
      </div>

      {/* Tablet: Two columns (list + tabbed editor/preview) */}
      <div className={`hidden md:grid lg:hidden h-full overflow-hidden transition-all duration-300 ${
        leftCollapsed ? 'md:grid-cols-[60px_1fr]' : 'md:grid-cols-[250px_1fr]'
      }`}>
        <div className="border-r border-gray-200 h-full overflow-y-auto">
          {left}
        </div>
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0">
            {middle}
          </div>
        </div>
      </div>

      {/* Mobile: Single column */}
      <div className="md:hidden h-full overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {left}
        </div>
      </div>
    </div>
  );
}
