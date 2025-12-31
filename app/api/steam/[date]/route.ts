import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const STEAM_EXPORT_DIR = 'D:\\diary\\data\\steam_export';

export async function GET(
  request: NextRequest,
  { params }: { params: { date: string } }
) {
  try {
    const { date } = params;
    const filename = `steam_dashboard_${date}.json`;
    const filePath = path.join(STEAM_EXPORT_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Steam export not found' },
        { status: 404 }
      );
    }

    // Read and parse the file
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    return NextResponse.json({ export: data });
  } catch (error) {
    console.error('Error fetching Steam export:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Steam export' },
      { status: 500 }
    );
  }
}
