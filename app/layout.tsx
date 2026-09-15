import type { Metadata } from "next";
import "./globals.css";
import { DiaryProvider } from "@/contexts/DiaryContext";
import { LabelProvider } from "@/contexts/LabelContext";
import { resolveServerPaths } from "@/lib/serverPaths";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Markdown Diary Editor",
  description: "A markdown editor for your diary entries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  resolveServerPaths();
  const profile = process.env.EDITOR_PROFILE;
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        {(profile === 'development' || profile === 'candidate') && (
          <div className="fixed bottom-2 right-2 z-[100] rounded bg-amber-300 px-3 py-1 text-xs font-semibold text-black" role="status">
            {profile === 'candidate' ? '候选验证 · 数据副本' : '开发版 · 数据副本'}
          </div>
        )}
        <LabelProvider>
          <DiaryProvider>
            {children}
          </DiaryProvider>
        </LabelProvider>
      </body>
    </html>
  );
}
