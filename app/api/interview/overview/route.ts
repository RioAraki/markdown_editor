import { loadQBank } from '@/lib/editorQBank';
import { resolveServerPaths } from '@/lib/serverPaths';
import { NextResponse } from 'next/server';
import {
  loadInterviewPlan,
  loadLeetCode,
  loadStories,
  loadResume,
  loadTopicNotes,
} from '@shared/interview/load';

/**
 * The whole interview-prep model, straight from the same files the diary
 * renderer reads. The client computes coverage/progress with the shared core,
 * overlaying whatever the user has edited in this session but not yet saved —
 * that's what makes the overview reflect today's ticks immediately.
 */

const DATA_DIR = resolveServerPaths().interviewData;

export async function GET() {
  try {
    const [plan, leetcode, qbank, notes, stories, resume] = await Promise.all([
      loadInterviewPlan(DATA_DIR),
      loadLeetCode(DATA_DIR),
      loadQBank(DATA_DIR),
      loadTopicNotes(DATA_DIR),
      loadStories(DATA_DIR),
      loadResume(DATA_DIR),
    ]);
    // The catalog holds ~4000 problems; the overview's figures only need the
    // ones you have touched or that belong to the old curriculum.
    const touched = leetcode.bank.problems.filter((p) => p.item || leetcode.log[String(p.id)]);
    return NextResponse.json({
      plan,
      leetcode: { ...leetcode, bank: { ...leetcode.bank, problems: touched } },
      qbank, notes, stories, resume,
    });
  } catch (error) {
    console.error('Error in GET /api/interview/overview:', error);
    return NextResponse.json(
      { error: 'Failed to load interview overview' },
      { status: 500 },
    );
  }
}
