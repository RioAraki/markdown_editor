import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    releaseId: process.env.EDITOR_RELEASE_ID || 'development',
    mode: process.env.EDITOR_PROFILE || 'development',
    uptimeSeconds: process.uptime(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
