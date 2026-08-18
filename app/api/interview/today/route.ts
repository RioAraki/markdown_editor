import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { loadPlan, resolveDayPlan, weekOf } from '@/lib/interviewPlan';
import { TodayPlanResponse } from '@/types/interview';

export async function GET() {
  try {
    const plan = await loadPlan();
    const today = format(new Date(), 'yyyy-MM-dd');
    const suggestion = resolveDayPlan(plan, today);
    const week = weekOf(plan, today);

    const response: TodayPlanResponse = {
      today,
      suggestion,
      templates: plan.templates ?? [],
      week: week
        ? { n: week.n, theme: week.theme, phase: week.phase }
        : undefined,
      trackTypes: plan.trackTypes ?? {},
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/interview/today:', error);
    return NextResponse.json(
      { error: 'Failed to load interview plan' },
      { status: 500 },
    );
  }
}
