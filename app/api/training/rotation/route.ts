import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import {
  computeLastDone,
  loadRotation,
  suggestSessionId,
} from '@/lib/trainingRotation';

export async function GET() {
  try {
    const rotation = await loadRotation();
    const lastDoneById = await computeLastDone(rotation);
    const today = format(new Date(), 'yyyy-MM-dd');
    const suggestionId = suggestSessionId(rotation, lastDoneById, today);
    return NextResponse.json({
      sessions: rotation,
      suggestionId,
      lastDoneById,
      today,
    });
  } catch (error) {
    console.error('Error in GET /api/training/rotation:', error);
    return NextResponse.json(
      { error: 'Failed to load rotation' },
      { status: 500 },
    );
  }
}
