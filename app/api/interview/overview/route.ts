import { NextResponse } from 'next/server';
import path from 'path';
import {
  loadInterviewPlan,
  loadLeetCode,
  loadQBank,
  loadStories,
  loadTopicNotes,
} from '@shared/interview/load';

/**
 * The whole interview-prep model, straight from the same files the diary
 * renderer reads. The client computes coverage/progress with the shared core,
 * overlaying whatever the user has edited in this session but not yet saved —
 * that's what makes the overview reflect today's ticks immediately.
 */

const DATA_DIR = path.dirname(
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log',
);

export async function GET() {
  try {
    const [plan, leetcode, qbank, notes, stories] = await Promise.all([
      loadInterviewPlan(DATA_DIR),
      loadLeetCode(DATA_DIR),
      loadQBank(DATA_DIR),
      loadTopicNotes(DATA_DIR),
      loadStories(DATA_DIR),
    ]);
    return NextResponse.json({ plan, leetcode, qbank, notes, stories });
  } catch (error) {
    console.error('Error in GET /api/interview/overview:', error);
    return NextResponse.json(
      { error: 'Failed to load interview overview' },
      { status: 500 },
    );
  }
}
