'use client';

import { useState } from 'react';
import { SteamProvider } from '@/contexts/SteamContext';
import { SteamList } from '@/components/SteamList';
import { SteamDashboard } from '@/components/SteamDashboard';

export default function SteamPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <SteamProvider>
      <div className="h-screen flex">
        {/* Left Sidebar - Steam Exports List */}
        <div className={`flex-shrink-0 transition-all duration-300 ${
          sidebarCollapsed ? 'w-[60px]' : 'w-80'
        }`}>
          <SteamList onCollapsedChange={setSidebarCollapsed} />
        </div>

        {/* Main Content - Steam Dashboard */}
        <div className="flex-1">
          <SteamDashboard />
        </div>
      </div>
    </SteamProvider>
  );
}
