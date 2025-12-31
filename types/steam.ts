export interface SteamGame {
  appid: number;
  name: string;
  playtime_2weeks?: number;
  playtime_forever: number;
  img_icon_url: string;
  playtime_delta?: number;
  is_returning_game?: boolean;
}

export interface SteamWeeklyActivity {
  games: SteamGame[];
  total_weekly_playtime: number;
}

export interface SteamDashboardData {
  timestamp: string;
  weekly_activity: SteamWeeklyActivity;
}

export interface SteamExport {
  date: string;
  timestamp: string;
  totalWeeklyPlaytime: number;
  gamesCount: number;
}
