import { NextResponse } from 'next/server';
import { resolveServerPaths } from '@/lib/serverPaths';
import { loadQBank } from '@/lib/editorQBank';
import { readReviews, updateReviews, ReviewError } from '@/lib/interviewReview';

export async function GET() {
  try {
    const dir = resolveServerPaths().interviewData;
    const [{ bank, log }, store] = await Promise.all([loadQBank(dir), readReviews(dir)]);
    return NextResponse.json({ questions: bank.questions, log, store });
  } catch (error) {
    console.error('Load review failed', error);
    return NextResponse.json({ error: '复习记录加载失败，请重试' }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ReviewError('无效请求');
    const dir = resolveServerPaths().interviewData;
    const { bank } = await loadQBank(dir);
    return NextResponse.json({ store: await updateReviews(dir, body, bank.questions) });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
    console.error('Save review failed', error);
    return NextResponse.json({ error: '保存失败，请重试；当前输入仍保留' }, { status: 500 });
  }
}
