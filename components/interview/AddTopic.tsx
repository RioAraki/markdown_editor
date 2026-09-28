'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { SwapCandidate } from './ItemSwap';

/**
 * One extra topic appended to a topic slot: `[@ai-rag-embed] Embedding 选型 · note`.
 *
 * The `@` keeps it clear of every other unit parser — question ids need eight
 * hex digits, story ids a trailing number (`ai-proj-1` would otherwise read as
 * one), problems a `#`.
 */
const TOPIC_UNIT_RE = /^\[@([a-z0-9-]+)\]\s*(.*)$/;
const SEP = ' · ';

export interface TopicUnit {
  id: string;
  title: string;
  note: string;
}

export function parseTopicUnit(text: string): TopicUnit | null {
  const m = TOPIC_UNIT_RE.exec(text.trim());
  if (!m) return null;
  // Only the first separator splits title from note; the note keeps its own.
  const rest = m[2];
  const at = rest.indexOf(SEP);
  return at < 0
    ? { id: m[1], title: rest.trim(), note: '' }
    : { id: m[1], title: rest.slice(0, at).trim(), note: rest.slice(at + SEP.length).trim() };
}

export function formatTopicUnit(id: string, title: string, note = ''): string {
  const n = note.trim();
  return ` [@${id}] ${title}${n ? SEP + n : ''}`;
}

/**
 * "这个主题讲完了，接着往下讲一个".
 *
 * A topic slot (AI 深度 and the like) is bound to one inventory item, so the
 * only control it used to have was 换一道, which replaces the topic and wipes
 * the checkbox. This appends instead: the next unmastered topic after the last
 * one in the slot, in inventory order, wrapping across the slot's modules — so
 * pressing it repeatedly walks the whole pool rather than jumping around.
 */
export function AddTopic({
  task,
  boundItem,
  presentIds,
  onAdd,
}: {
  task: string;
  /** The item the day's `items:` marker binds this slot to. */
  boundItem: string;
  /** Topics already appended to the slot, oldest first. */
  presentIds: string[];
  onAdd: (trailing: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/items?block=${encodeURIComponent(task)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '没能取到下一个主题');
      const items: SwapCandidate[] = d.items ?? [];
      const taken = new Set([boundItem, ...presentIds]);
      const last = presentIds[presentIds.length - 1] ?? boundItem;
      const start = items.findIndex((c) => c.id === last) + 1;
      const ordered = [...items.slice(start), ...items.slice(0, start)];
      const next =
        ordered.find((c) => !taken.has(c.id) && !c.mastered) ??
        ordered.find((c) => !taken.has(c.id));
      if (!next) {
        setError('这个时段的主题都排进今天了');
        return;
      }
      onAdd(formatTopicUnit(next.id, next.title));
    } catch (e) {
      setError(e instanceof Error ? e.message : '没能取到下一个主题');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        title="接着往下再讲一个主题，已掌握的会跳过"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        再来一个主题
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
