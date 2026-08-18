'use client';

import React, { useState } from 'react';
import { MessageSquare, MessageSquarePlus } from 'lucide-react';

interface TaskNoteProps {
  value: string;
  placeholder?: string;
  onChange: (note: string) => void;
}

export function TaskNote({ value, placeholder, onChange }: TaskNoteProps) {
  const [open, setOpen] = useState(value.length > 0);

  React.useEffect(() => {
    if (value.length > 0) setOpen(true);
  }, [value]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700 transition-colors"
      >
        <MessageSquarePlus className="w-3 h-3" />
        加笔记
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <MessageSquare className="w-3.5 h-3.5 mt-1.5 text-stone-400 shrink-0" />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '这一项的收获 / 卡壳点…'}
        rows={Math.max(1, value.split('\n').length)}
        onBlur={() => {
          if (value.length === 0) setOpen(false);
        }}
        className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded bg-stone-50/70 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white resize-y leading-relaxed"
      />
    </div>
  );
}
