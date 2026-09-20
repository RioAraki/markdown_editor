import { NextResponse } from 'next/server';
import { loadPlan } from '@/lib/interviewPlan';
import {
  computeTouchCounts,
  flattenInventory,
  loadInventory,
  loadMastery,
} from '@/lib/interviewInventory';

/**
 * The inventory items one slot is allowed to draw from.
 *
 * `GET /api/interview/items?block=行为故事`
 *
 * Exists so a slot on an already-written day can be re-pointed without pulling
 * the whole `today` payload (which loads every question bank, the papers and
 * the stories just to answer "what else could this slot be?").
 *
 * `touches` counts how many days have *bound* this item, not how many times it
 * was finished — the same number the picker shows while assembling a day. It is
 * what surfaces the items that have never once come up.
 */
export async function GET(req: Request) {
  try {
    const name = new URL(req.url).searchParams.get('block')?.trim();
    if (!name) {
      return NextResponse.json({ error: 'block is required' }, { status: 400 });
    }

    const [plan, inventory, mastery, touches] = await Promise.all([
      loadPlan(),
      loadInventory(),
      loadMastery(),
      computeTouchCounts(),
    ]);

    const block = (plan.blocks ?? []).find((b) => b.name === name);
    if (!block) {
      return NextResponse.json({ error: `没有名为「${name}」的时段` }, { status: 404 });
    }

    // An empty pool means the slot deliberately has no inventory item at all
    // (mocks, reviews); offering the whole domain there would be wrong.
    const pool = block.pool ?? [];
    const domainIds = new Set(
      inventory.domains.filter((d) => d.track === block.track).map((d) => d.id),
    );
    const items = pool.length
      ? flattenInventory(inventory, touches, mastery)
          .filter((c) => domainIds.has(c.domainId) && pool.includes(c.moduleId))
          .map((c) => ({
            id: c.id,
            title: c.title,
            moduleLabel: c.moduleLabel,
            touches: c.touches,
            mastered: c.mastered,
          }))
      : [];

    return NextResponse.json({ block: block.name, items });
  } catch (error) {
    console.error('Error in GET /api/interview/items:', error);
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 });
  }
}
