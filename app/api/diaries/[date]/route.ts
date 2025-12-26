import { NextResponse } from 'next/server';
import {
  readDiaryFile,
  writeDiaryFile,
  createDiaryFile,
  diaryFileExists,
} from '@/lib/diaryFileSystem';
import { isValidDateFormat, getDiaryFilename } from '@/lib/dateUtils';
import { DiaryContentResponse, ErrorResponse, SaveDiaryRequest } from '@/types/diary';

type RouteContext = {
  params: Promise<{ date: string }>;
};

/**
 * GET /api/diaries/[date]
 * Get the content of a specific diary entry
 */
export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { date } = await context.params;

    // Validate date format
    if (!isValidDateFormat(date)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid date format',
        details: 'Date must be in YYYY-MM-DD format',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Read the diary file
    const content = await readDiaryFile(date);

    const response: DiaryContentResponse = {
      entry: {
        date,
        filename: getDiaryFilename(date),
        content,
        exists: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/diaries/[date]:', error);

    if (error instanceof Error && error.message === 'Diary entry not found') {
      const errorResponse: ErrorResponse = {
        error: 'Diary entry not found',
        details: `No diary entry exists for this date`,
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    const errorResponse: ErrorResponse = {
      error: 'Failed to read diary',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * POST /api/diaries/[date]
 * Create a new diary entry
 */
export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { date } = await context.params;

    // Validate date format
    if (!isValidDateFormat(date)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid date format',
        details: 'Date must be in YYYY-MM-DD format',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Check if diary already exists
    const exists = await diaryFileExists(date);
    if (exists) {
      const errorResponse: ErrorResponse = {
        error: 'Diary entry already exists',
        details: 'Use PUT to update an existing diary entry',
      };
      return NextResponse.json(errorResponse, { status: 409 });
    }

    // Create the diary file
    await createDiaryFile(date);

    const response: DiaryContentResponse = {
      entry: {
        date,
        filename: getDiaryFilename(date),
        content: '',
        exists: true,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/diaries/[date]:', error);

    const errorResponse: ErrorResponse = {
      error: 'Failed to create diary',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * PUT /api/diaries/[date]
 * Update an existing diary entry or create if it doesn't exist
 */
export async function PUT(
  request: Request,
  context: RouteContext
) {
  try {
    const { date } = await context.params;

    // Validate date format
    if (!isValidDateFormat(date)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid date format',
        details: 'Date must be in YYYY-MM-DD format',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Parse request body
    const body: SaveDiaryRequest = await request.json();

    if (typeof body.content !== 'string') {
      const errorResponse: ErrorResponse = {
        error: 'Invalid request body',
        details: 'Content must be a string',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Write the diary file
    await writeDiaryFile(date, body.content);

    const response: DiaryContentResponse = {
      entry: {
        date,
        filename: getDiaryFilename(date),
        content: body.content,
        exists: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in PUT /api/diaries/[date]:', error);

    const errorResponse: ErrorResponse = {
      error: 'Failed to update diary',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
