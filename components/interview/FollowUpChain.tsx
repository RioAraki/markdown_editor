'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerDownRight, Loader2 } from 'lucide-react';
import type { FollowUp } from '@shared/interview/stories';

/**
 * The exchange one answer set off.
 *
 * A bank question is written against the resume; a follow-up is written against
 * what you actually said, which is why it cannot exist in advance and why it is
 * the part of this module that most resembles a real interview. The chain reads
 * top to bottom as a transcript, indented by depth, so the shape of the
 * conversation is visible: three shallow probes is a different thing from one
 * pursued four levels down.
 *
 * `stuck` is the interesting state. It means the follow-up found something you
 * could not answer, which makes it more valuable than any question in the bank —
 * so it is marked for promotion rather than left to be asked once and forgotten.
 */

const AUTOSAVE_MS = 1500;

function depthOf(id: string) {
  return Math.min(id.split('.').length - 1, 3);
}

export function FollowUpChain({
  items,
  onSave,
  onStuck,
}: {
  items: FollowUp[];
  onSave: (followUpId: string, answer: string) => Promise<void>;
  onStuck: (followUpId: string, stuck: boolean) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
        <CornerDownRight className="w-3 h-3" />
        追问 · {items.length} 条
        <span className="text-stone-300">
          — 基于你上面的回答，不是题库里预先写好的
        </span>
      </div>
      {items.map((f) => (
        <FollowUpItem key={f.id} f={f} onSave={onSave} onStuck={onStuck} />
      ))}
    </div>
  );
}

function FollowUpItem({
  f,
  onSave,
  onStuck,
}: {
  f: FollowUp;
  onSave: (id: string, answer: string) => Promise<void>;
  onStuck: (id: string, stuck: boolean) => Promise<void>;
}) {
  const [text, setText] = useState(f.answer ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setText(f.answer ?? '');
  }, [f.answer]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(f.id, text);
        dirty.current = false;
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [text, f.id, onSave]);

  const d = depthOf(f.id);
  return (
    <div
      className={`border-l-2 pl-2.5 ${
        f.stuck ? 'border-rose-300' : 'border-indigo-200'
      }`}
      style={{ marginLeft: d * 14 }}
    >
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[10px] font-mono text-indigo-400 shrink-0">
          追问 {f.id}
        </span>
        {f.stuck && (
          <span className="text-[10px] px-1 rounded bg-rose-100 text-rose-700">
            答不上来 · 待升格
          </span>
        )}
      </div>
      <p className="text-[13px] leading-snug text-stone-800 mt-0.5 whitespace-pre-wrap">
        {f.q}
      </p>
      {f.why && (
        <p className="text-[10.5px] text-stone-400 mt-0.5">
          为什么问：{f.why}
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
        rows={3}
        placeholder="接着答。答不上来就点下面那个按钮——那比硬编一个答案有用得多。"
        className="w-full mt-1.5 px-2.5 py-1.5 text-[12.5px] leading-relaxed border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
      />
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-stone-400 mr-auto">
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin inline" />
          ) : savedAt ? (
            `已存 ${savedAt}`
          ) : (
            `${text.trim().length} 字 · 自动保存`
          )}
        </span>
        <button
          type="button"
          onClick={() => void onStuck(f.id, !f.stuck)}
          title="标记之后它会升格成正式问题，隔几天带着上下文回来"
          className={`text-[10.5px] px-2 py-0.5 rounded border transition-colors ${
            f.stuck
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white text-stone-500 border-stone-300 hover:border-rose-400 hover:text-rose-600'
          }`}
        >
          {f.stuck ? '已标记答不上来' : '答不上来'}
        </button>
      </div>
    </div>
  );
}
