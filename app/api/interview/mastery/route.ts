import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { loadMastery, saveMastery } from '@/lib/interviewInventory';

export async function GET() {
  try {
    return NextResponse.json(await loadMastery());
  } catch (error) {
    console.error('Error in GET /api/interview/mastery:', error);
    return NextResponse.json(
      { error: 'Failed to read mastery' },
      { status: 500 },
    );
  }
}

/**
 * Toggle an item's mastered state.
 * Body: `{ itemId, mastered, note? }`.
 */
export async function PUT(req: Request) {
  try {
    const body: { itemId?: string; mastered?: boolean; note?: string } =
      await req.json();
    if (typeof body.itemId !== 'string' || !body.itemId) {
      return NextResponse.json(
        { error: 'itemId must be a non-empty string' },
        { status: 400 },
      );
    }
    const store = await loadMastery();
    if (body.mastered) {
      store[body.itemId] = {
        status: 'mastered',
        at: format(new Date(), 'yyyy-MM-dd'),
        ...(body.note ? { note: body.note } : {}),
      };
    } else {
      delete store[body.itemId];
    }
    await saveMastery(store);
    return NextResponse.json(store);
  } catch (error) {
    console.error('Error in PUT /api/interview/mastery:', error);
    return NextResponse.json(
      { error: 'Failed to save mastery' },
      { status: 500 },
    );
  }
}
