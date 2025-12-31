import type { Metadata } from "next";
import "./globals.css";
import { DiaryProvider } from "@/contexts/DiaryContext";
import { LabelProvider } from "@/contexts/LabelContext";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Markdown Diary Editor",
  description: "A markdown editor for your diary entries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <LabelProvider>
          <DiaryProvider>
            <Navigation />
            {children}
          </DiaryProvider>
        </LabelProvider>
      </body>
    </html>
  );
}
