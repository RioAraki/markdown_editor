import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const STEAM_EXPORT_DIR = 'D:\\diary\\data\\steam_export';
const STEAM_API_BASE = 'http://api.steampowered.com';

interface SteamGame {
  appid: number;
  name: string;
  playtime_2weeks?: number;
  playtime_forever: number;
  img_icon_url: string;
  playtime_delta?: number;
  is_returning_game?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, steamId } = await request.json();

    if (!apiKey || !steamId) {
      return NextResponse.json(
        { error: 'API key and Steam ID are required' },
        { status: 400 }
      );
    }

    // Fetch recently played games from Steam API
    const recentUrl = `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`;

    const recentResponse = await fetch(recentUrl);
    if (!recentResponse.ok) {
      throw new Error('Failed to fetch Steam data');
    }

    const recentData = await recentResponse.json();
    const currentGames: SteamGame[] = recentData.response?.games || [];

    // Load previous export to calculate deltas
    const previousData = loadPreviousExport();
    const weeklyGames = calculateWeeklyPlaytime(currentGames, previousData);

    // Create export data
    const exportData = {
      timestamp: new Date().toISOString(),
      weekly_activity: {
        games: weeklyGames,
        total_weekly_playtime: weeklyGames.reduce((sum, game) => sum + (game.playtime_delta || 0), 0),
      },
    };

    // Ensure export directory exists
    if (!fs.existsSync(STEAM_EXPORT_DIR)) {
      fs.mkdirSync(STEAM_EXPORT_DIR, { recursive: true });
    }

    // Save export file
    const today = new Date().toISOString().split('T')[0];
    const filename = `steam_dashboard_${today}.json`;
    const filepath = path.join(STEAM_EXPORT_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

    return NextResponse.json({
      success: true,
      filename,
      gamesCount: weeklyGames.length,
      totalPlaytime: exportData.weekly_activity.total_weekly_playtime,
    });
  } catch (error) {
    console.error('Error generating Steam dashboard:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate dashboard' },
      { status: 500 }
    );
  }
}

function loadPreviousExport(): SteamGame[] | null {
  if (!fs.existsSync(STEAM_EXPORT_DIR)) {
    return null;
  }

  const files = fs.readdirSync(STEAM_EXPORT_DIR)
    .filter(file => file.startsWith('steam_dashboard_') && file.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  try {
    const latestFile = path.join(STEAM_EXPORT_DIR, files[0]);
    const content = fs.readFileSync(latestFile, 'utf-8');
    const data = JSON.parse(content);
    return data.weekly_activity?.games || null;
  } catch (error) {
    console.error('Error loading previous export:', error);
    return null;
  }
}

function calculateWeeklyPlaytime(currentGames: SteamGame[], previousGames: SteamGame[] | null): SteamGame[] {
  if (!previousGames) {
    // No previous data, use 2-week data as weekly data
    return currentGames.map(game => ({
      ...game,
      playtime_delta: game.playtime_2weeks || 0,
      is_returning_game: false,
    }));
  }

  const previousLookup = new Map(previousGames.map(g => [g.appid, g]));

  return currentGames.map(currentGame => {
    const previous = previousLookup.get(currentGame.appid);

    if (previous) {
      const playtimeDelta = Math.max(0, currentGame.playtime_forever - previous.playtime_forever);
      return {
        ...currentGame,
        playtime_delta: playtimeDelta,
        is_returning_game: true,
      };
    } else {
      const playtimeDelta = currentGame.playtime_2weeks || 0;
      return {
        ...currentGame,
        playtime_delta: playtimeDelta,
        is_returning_game: currentGame.playtime_forever > playtimeDelta,
      };
    }
  });
}
