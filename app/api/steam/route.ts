import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const STEAM_EXPORT_DIR = 'D:\\diary\\data\\steam_export';

export async function GET() {
  try {
    // Check if steam_export directory exists
    if (!fs.existsSync(STEAM_EXPORT_DIR)) {
      return NextResponse.json({ exports: [] });
    }

    // Read all JSON files from steam_export directory
    const files = fs.readdirSync(STEAM_EXPORT_DIR)
      .filter(file => file.startsWith('steam_dashboard_') && file.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    // Extract date and basic info from each file
    const exports = files.map(filename => {
      const match = filename.match(/steam_dashboard_(\d{4}-\d{2}-\d{2})\.json/);
      if (!match) return null;

      const date = match[1];
      const filePath = path.join(STEAM_EXPORT_DIR, filename);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        return {
          date,
          timestamp: data.timestamp,
          totalWeeklyPlaytime: data.weekly_activity?.total_weekly_playtime || 0,
          gamesCount: data.weekly_activity?.games?.length || 0,
        };
      } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ exports });
  } catch (error) {
    console.error('Error fetching Steam exports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Steam exports' },
      { status: 500 }
    );
  }
}
