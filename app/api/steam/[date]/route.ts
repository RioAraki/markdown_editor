import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const STEAM_EXPORT_DIR = 'D:\\diary\\data\\steam_export';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const filename = `steam_dashboard_${date}.json`;
    const filePath = path.join(STEAM_EXPORT_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Steam export not found' },
        { status: 404 }
      );
    }

    // Read current data
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Get updates from request
    const { appid, trophy, comment } = await request.json();

    if (!appid) {
      return NextResponse.json(
        { error: 'appid is required' },
        { status: 400 }
      );
    }

    // Find and update the game
    const game = data.weekly_activity.games.find((g: any) => g.appid === appid);
    if (!game) {
      return NextResponse.json(
        { error: 'Game not found in this export' },
        { status: 404 }
      );
    }

    // Update trophy and comment
    if (trophy !== undefined) {
      if (trophy === null || trophy === '') {
        delete game.trophy;
      } else {
        game.trophy = trophy;
      }
    }

    if (comment !== undefined) {
      if (comment === null || comment === '') {
        delete game.comment;
      } else {
        game.comment = comment;
      }
    }

    // Save updated data
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    return NextResponse.json({ success: true, game });
  } catch (error) {
    console.error('Error updating Steam export:', error);
    return NextResponse.json(
      { error: 'Failed to update Steam export' },
      { status: 500 }
    );
  }
}
