import { NextResponse } from 'next/server';
import { listTrainingDaysWithContent } from '@/lib/trainingFileSystem';
import { TrainingDayListResponse } from '@/types/training';

export async function GET() {
  try {
    const days = await listTrainingDaysWithContent();
    const response: TrainingDayListResponse = { days };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/training:', error);
    return NextResponse.json(
      { error: 'Failed to list training days' },
      { status: 500 },
    );
  }
}
