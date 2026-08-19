'use client';

import { useCallback, useEffect, useState } from "react";
import { ThreeColumnLayout } from "@/components/Layout/ThreeColumnLayout";
import { DiaryList, SidebarTab } from "@/components/DiaryList";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { ArchiveEditor } from "@/components/ArchiveEditor";
import { ArchivePreview } from "@/components/ArchivePreview";
import { TrainingEditor } from "@/components/TrainingEditor";
import { InterviewEditor } from "@/components/InterviewEditor";
import { OverviewPane } from "@/components/interview/OverviewPane";
import { ArchiveProvider } from "@/contexts/ArchiveContext";
import { TrainingProvider } from "@/contexts/TrainingContext";
import { InterviewProvider } from "@/contexts/InterviewContext";

const SIDEBAR_COLLAPSED_KEY = 'diary-sidebar-collapsed';
const ACTIVE_TAB_KEY = 'sidebar-active-tab';

export default function Home() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('diary');

  useEffect(() => {
    const storedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (storedCollapsed !== null) {
      setCollapsed(storedCollapsed === 'true');
    } else if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setCollapsed(true);
    }
    const storedTab = localStorage.getItem(ACTIVE_TAB_KEY);
    if (
      storedTab === 'diary' ||
      storedTab === 'archive' ||
      storedTab === 'training' ||
      storedTab === 'interview'
    ) {
      setActiveTab(storedTab);
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const handleTabChange = useCallback((tab: SidebarTab) => {
    setActiveTab(tab);
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  }, []);

  let middle: React.ReactNode;
  let right: React.ReactNode | undefined;
  if (activeTab === 'diary') {
    middle = <MarkdownEditor />;
    right = <MarkdownPreview />;
  } else if (activeTab === 'archive') {
    middle = <ArchiveEditor />;
    right = <ArchivePreview />;
  } else if (activeTab === 'interview') {
    middle = <InterviewEditor />;
    right = <OverviewPane />;
  } else {
    middle = <TrainingEditor />;
    right = undefined;
  }

  return (
    <ArchiveProvider>
      <TrainingProvider>
        <InterviewProvider>
          <ThreeColumnLayout
            left={
              <DiaryList
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                activeTab={activeTab}
                onTabChange={handleTabChange}
              />
            }
            middle={middle}
            right={right}
            leftCollapsed={collapsed}
            onToggleLeft={toggleCollapsed}
          />
        </InterviewProvider>
      </TrainingProvider>
    </ArchiveProvider>
  );
}
