import { NextResponse } from 'next/server';
import { listInterviewDaysWithContent } from '@/lib/interviewFileSystem';
import { InterviewDayListResponse } from '@/types/interview';

export async function GET() {
  try {
    const days = await listInterviewDaysWithContent();
    const response: InterviewDayListResponse = { days };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/interview:', error);
    return NextResponse.json(
      { error: 'Failed to list interview days' },
      { status: 500 },
    );
  }
}
