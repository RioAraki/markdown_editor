import type { Metadata } from "next";
import "./globals.css";
import { DiaryProvider } from "@/contexts/DiaryContext";

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
      <body>
        <DiaryProvider>
          {children}
        </DiaryProvider>
      </body>
    </html>
  );
}
