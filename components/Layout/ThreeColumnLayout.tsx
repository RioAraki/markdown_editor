'use client';

import React from 'react';

interface ThreeColumnLayoutProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
}

export function ThreeColumnLayout({ left, middle, right }: ThreeColumnLayoutProps) {
  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Desktop: Three columns */}
      <div className="hidden lg:grid lg:grid-cols-[300px_1fr_1fr] h-full">
        <div className="border-r border-gray-200 overflow-y-auto">
          {left}
        </div>
        <div className="border-r border-gray-200 overflow-y-auto">
          {middle}
        </div>
        <div className="overflow-y-auto">
          {right}
        </div>
      </div>

      {/* Tablet: Two columns (list + tabbed editor/preview) */}
      <div className="hidden md:grid md:grid-cols-[250px_1fr] lg:hidden h-full">
        <div className="border-r border-gray-200 overflow-y-auto">
          {left}
        </div>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">
            {middle}
          </div>
        </div>
      </div>

      {/* Mobile: Single column */}
      <div className="md:hidden h-full flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {left}
        </div>
      </div>
    </div>
  );
}
