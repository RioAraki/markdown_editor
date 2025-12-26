import { NextResponse } from 'next/server';
import { listDiaryFiles } from '@/lib/diaryFileSystem';
import { DiaryListResponse, ErrorResponse } from '@/types/diary';

/**
 * GET /api/diaries
 * List all diary entries (metadata only, no content)
 */
export async function GET() {
  try {
    const diaries = await listDiaryFiles();

    const response: DiaryListResponse = {
      diaries,
      total: diaries.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/diaries:', error);

    const errorResponse: ErrorResponse = {
      error: 'Failed to fetch diaries',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
