import { NextResponse } from 'next/server';
import { readTrainingDay, writeTrainingDay } from '@/lib/trainingFileSystem';
import {
  SaveTrainingRequest,
  TrainingDayContentResponse,
} from '@/types/training';

type RouteContext = {
  params: Promise<{ date: string }>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 },
      );
    }
    const content = await readTrainingDay(date);
    const response: TrainingDayContentResponse = {
      dateStr: date,
      filename: `${date}.md`,
      content,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Training day not found') {
      return NextResponse.json(
        { error: 'Training day not found' },
        { status: 404 },
      );
    }
    console.error('Error in GET /api/training/[date]:', error);
    return NextResponse.json(
      { error: 'Failed to read training day' },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    if (!DATE_RE.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 },
      );
    }
    const body: SaveTrainingRequest = await req.json();
    if (typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'content must be a string' },
        { status: 400 },
      );
    }
    await writeTrainingDay(date, body.content);
    const response: TrainingDayContentResponse = {
      dateStr: date,
      filename: `${date}.md`,
      content: body.content,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Training day not found') {
      return NextResponse.json(
        { error: 'Training day not found' },
        { status: 404 },
      );
    }
    console.error('Error in PUT /api/training/[date]:', error);
    return NextResponse.json(
      { error: 'Failed to save training day' },
      { status: 500 },
    );
  }
}
