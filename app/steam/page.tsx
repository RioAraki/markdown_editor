'use client';

import { SteamProvider } from '@/contexts/SteamContext';
import { SteamList } from '@/components/SteamList';
import { SteamDashboard } from '@/components/SteamDashboard';

export default function SteamPage() {
  return (
    <SteamProvider>
      <div className="h-screen flex">
        {/* Left Sidebar - Steam Exports List */}
        <div className="w-80 flex-shrink-0">
          <SteamList />
        </div>

        {/* Main Content - Steam Dashboard */}
        <div className="flex-1">
          <SteamDashboard />
        </div>
      </div>
    </SteamProvider>
  );
}
