'use client';

import { ThreeColumnLayout } from "@/components/Layout/ThreeColumnLayout";
import { DiaryList } from "@/components/DiaryList";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownPreview } from "@/components/MarkdownPreview";

export default function Home() {
  return (
    <ThreeColumnLayout
      left={<DiaryList />}
      middle={<MarkdownEditor />}
      right={<MarkdownPreview />}
    />
  );
}
