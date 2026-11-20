import { resolveServerPaths } from '@/lib/serverPaths';
import { loadLeetCodeModel } from '@/lib/leetcodeModel';
import { NextResponse } from 'next/server';
import { format } from 'date-fns';

const DATA_DIR = resolveServerPaths().interviewData;

/**
 * Per-topic ability for the radar, the sync status, and the 待注解 inbox:
 * attempts that came in from leetcode.cn and still carry the 已同步 label.
 */
export async function GET() {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { bank, log, sync, ability, solved } = await loadLeetCodeModel(DATA_DIR, today);
    const byId = new Map(bank.problems.map((p) => [p.id, p]));
    const topicName = new Map(ability.topics.map((t) => [t.id, t.name]));

    const inbox: { id: number; title: string; date: string; rating?: number; topics: string[] }[] = [];
    let flagged = 0;
    for (const [key, entry] of Object.entries(log)) {
      const last = [...entry.attempts].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      if (last?.redo) flagged += 1;
      for (const a of entry.attempts) {
        if (a.outcome !== 'synced') continue;
        const p = byId.get(Number(key));
        inbox.push({
          id: Number(key),
          title: p?.title ?? `#${key}`,
          date: a.date,
          rating: p?.rating,
          topics: (p?.topics ?? []).map((t) => topicName.get(t) ?? t),
        });
      }
    }
    inbox.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    const done = new Set([...Object.keys(log).map(Number), ...solved]);
    return NextResponse.json({
      today,
      ability,
      profile: sync.profile ?? null,
      lastSyncAt: sync.lastSyncAt ?? null,
      deepSyncedAt: sync.deep?.fetchedAt ?? null,
      deepAvailable: !!process.env.LEETCODE_SESSION,
      inbox,
      counts: { done: done.size, flagged, inbox: inbox.length },
    });
  } catch (error) {
    console.error('Error in GET /api/interview/leetcode/ability:', error);
    return NextResponse.json({ error: 'Failed to compute ability' }, { status: 500 });
  }
}
