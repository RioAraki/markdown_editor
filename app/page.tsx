'use client';

import { useState } from "react";
import { ThreeColumnLayout } from "@/components/Layout/ThreeColumnLayout";
import { DiaryList } from "@/components/DiaryList";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { ArchiveEditor } from "@/components/ArchiveEditor";
import { ArchivePreview } from "@/components/ArchivePreview";
import { ArchiveProvider } from "@/contexts/ArchiveContext";

export default function Home() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'diary' | 'archive'>('diary');

  return (
    <ArchiveProvider>
      <ThreeColumnLayout
        left={<DiaryList onCollapsedChange={setSidebarCollapsed} activeTab={activeTab} onTabChange={setActiveTab} />}
        middle={activeTab === 'diary' ? <MarkdownEditor /> : <ArchiveEditor />}
        right={activeTab === 'diary' ? <MarkdownPreview /> : <ArchivePreview />}
        leftCollapsed={sidebarCollapsed}
      />
    </ArchiveProvider>
  );
}
