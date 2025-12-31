#!/usr/bin/env python3
"""
Steam Gaming Dashboard
A comprehensive tool to analyze your Steam gaming habits using the Steam Web API.

Features:
- Weekly gaming activity tracking
- Recent gaming activity (last 2 weeks)
- Complete game library with playtime stats
- Player profile information
- Beautiful dashboard visualization

Usage:
    python scrape_steam.py --api-key YOUR_STEAM_API_KEY --steam-id YOUR_STEAM_ID
"""

import requests
import json
import argparse
import sys
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import time
from urllib.parse import urlparse
import glob


class SteamAPI:
    """Steam Web API client for fetching player data."""

    BASE_URL = "http://api.steampowered.com"

    def __init__(self, api_key: str):
        """Initialize with Steam Web API key."""
        self.api_key = api_key
        self.session = requests.Session()

    def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make authenticated request to Steam API."""
        params.update({
            'key': self.api_key,
            'format': 'json'
        })

        try:
            response = self.session.get(f"{self.BASE_URL}/{endpoint}", params=params)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            print(f"API request failed: {e}")
            return {}

    def get_player_summaries(self, steam_ids: List[str]) -> Dict[str, Any]:
        """Get basic profile information for Steam IDs."""
        steam_ids_str = ','.join(steam_ids)
        return self._make_request(
            'ISteamUser/GetPlayerSummaries/v0002/',
            {'steamids': steam_ids_str}
        )

    def get_owned_games(self, steam_id: str, include_appinfo: bool = True,
                       include_played_free_games: bool = True) -> Dict[str, Any]:
        """Get list of games owned by player with playtime information."""
        return self._make_request(
            'IPlayerService/GetOwnedGames/v0001/',
            {
                'steamid': steam_id,
                'include_appinfo': 1 if include_appinfo else 0,
                'include_played_free_games': 1 if include_played_free_games else 0
            }
        )

    def get_recently_played_games(self, steam_id: str, count: Optional[int] = None) -> Dict[str, Any]:
        """Get games played in the last 2 weeks."""
        params = {'steamid': steam_id}
        if count:
            params['count'] = count

        return self._make_request(
            'IPlayerService/GetRecentlyPlayedGames/v0001/',
            params
        )


class SteamDashboard:
    """Steam gaming dashboard with analytics and visualization."""

    def __init__(self, api_key: str, steam_id: str):
        """Initialize dashboard with Steam API credentials."""
        self.api = SteamAPI(api_key)
        self.steam_id = steam_id
        self.player_data = {}
        self.games_data = {}
        self.recent_games_data = {}
        self.weekly_games_data = {}
        self.image_dir = "steam_img"
        self.export_dir = "steam_export"

    def load_previous_data(self) -> Optional[Dict[str, Any]]:
        """Load the most recent previous export to calculate weekly deltas."""
        if not os.path.exists(self.export_dir):
            return None

        # Find all JSON files in the export directory
        json_files = glob.glob(os.path.join(self.export_dir, "steam_dashboard_*.json"))
        if not json_files:
            return None

        # Sort by modification time and get the most recent
        latest_file = max(json_files, key=os.path.getmtime)

        try:
            with open(latest_file, 'r', encoding='utf-8') as f:
                previous_data = json.load(f)
            print(f"📂 Loaded previous data from: {os.path.basename(latest_file)}")
            return previous_data
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️  Could not load previous data: {e}")
            return None

    def calculate_weekly_playtime(self, current_games: List[Dict[str, Any]],
                                previous_games: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Calculate weekly playtime deltas based on previous data."""
        weekly_games = []

        # Create lookup for previous games by appid
        previous_games_lookup = {game['appid']: game for game in previous_games}

        for current_game in current_games:
            appid = current_game['appid']
            current_forever = current_game.get('playtime_forever', 0)
            current_2weeks = current_game.get('playtime_2weeks', 0)

            weekly_game = current_game.copy()

            if appid in previous_games_lookup:
                # Game appeared in both current and previous data
                previous_forever = previous_games_lookup[appid].get('playtime_forever', 0)
                playtime_delta = current_forever - previous_forever

                if playtime_delta < 0:
                    # Handle case where playtime might have been reset
                    playtime_delta = current_2weeks

                weekly_game['playtime_delta'] = playtime_delta
                weekly_game['is_returning_game'] = True

            else:
                # Game only appears in current data
                if current_forever > current_2weeks:
                    # Played long ago, picked up again this week
                    weekly_game['playtime_delta'] = current_2weeks
                    weekly_game['is_returning_game'] = True
                else:
                    # New game or all playtime is from this week
                    weekly_game['playtime_delta'] = current_2weeks
                    weekly_game['is_returning_game'] = False

            weekly_games.append(weekly_game)

        return weekly_games

    def fetch_all_data(self):
        """Fetch all required data from Steam API."""
        print("🔄 Fetching Steam data...")

        # Get player profile
        print("  📋 Fetching player profile...")
        player_response = self.api.get_player_summaries([self.steam_id])
        if 'response' in player_response and 'players' in player_response['response']:
            self.player_data = player_response['response']['players'][0] if player_response['response']['players'] else {}

        # Skip fetching owned games - focusing only on recent activity

        # Get recently played games
        print("  ⏰ Fetching recent activity...")
        recent_response = self.api.get_recently_played_games(self.steam_id)
        if 'response' in recent_response:
            self.recent_games_data = recent_response['response']

        # Calculate weekly playtime deltas
        print("  📊 Calculating weekly playtime...")
        previous_data = self.load_previous_data()

        # Handle both old format (recent_activity) and new format (weekly_activity)
        previous_games = None
        if previous_data:
            if 'recent_activity' in previous_data and 'games' in previous_data['recent_activity']:
                # Old format - 2-week data
                previous_games = previous_data['recent_activity']['games']
                print("  📂 Using previous 2-week data for delta calculation")
            elif 'weekly_activity' in previous_data and 'games' in previous_data['weekly_activity']:
                # New format - 1-week data
                previous_games = previous_data['weekly_activity']['games']
                print("  📂 Using previous 1-week data for delta calculation")

        if previous_games:
            current_games = self.recent_games_data.get('games', [])
            weekly_games = self.calculate_weekly_playtime(current_games, previous_games)
            self.weekly_games_data = {
                'games': weekly_games,
                'total_weekly_playtime': sum(game.get('playtime_delta', 0) for game in weekly_games)
            }
        else:
            # No previous data available, use 2-week data as weekly data
            print("  ⚠️  No previous data found, using 2-week data as weekly data")
            current_games = self.recent_games_data.get('games', [])
            weekly_games = []

            for game in current_games:
                weekly_game = game.copy()
                weekly_game['playtime_delta'] = game.get('playtime_2weeks', 0)
                weekly_game['is_returning_game'] = False
                weekly_games.append(weekly_game)

            self.weekly_games_data = {
                'games': weekly_games,
                'total_weekly_playtime': sum(game.get('playtime_delta', 0) for game in weekly_games)
            }

        # Download game icons for recently played games
        if self.recent_games_data.get('games'):
            print("  🖼️  Downloading game icons...")
            self.download_game_icons()

        print("✅ Data fetching complete!")

    def download_game_icons(self):
        """Download game icons for recently played games."""
        # Create image directory if it doesn't exist
        if not os.path.exists(self.image_dir):
            os.makedirs(self.image_dir)
            print(f"    📁 Created directory: {self.image_dir}")

        games = self.recent_games_data.get('games', [])
        downloaded_count = 0
        skipped_count = 0

        for game in games:
            appid = game.get('appid')
            img_icon_url = game.get('img_icon_url')

            if not appid or not img_icon_url:
                continue

            # Create filename based on appid
            filename = f"{appid}.jpg"
            filepath = os.path.join(self.image_dir, filename)

            # Skip if file already exists
            if os.path.exists(filepath):
                skipped_count += 1
                continue

            try:
                # Construct full image URL
                full_url = f"http://media.steampowered.com/steamcommunity/public/images/apps/{appid}/{img_icon_url}.jpg"

                # Download image
                response = requests.get(full_url, timeout=10)
                response.raise_for_status()

                # Save image
                with open(filepath, 'wb') as f:
                    f.write(response.content)

                downloaded_count += 1
                print(f"    ⬇️  Downloaded: {game.get('name', 'Unknown')} ({appid}.jpg)")

                # Small delay to be respectful to Steam's servers
                time.sleep(0.1)

            except requests.RequestException as e:
                print(f"    ❌ Failed to download {game.get('name', 'Unknown')}: {e}")

        print(f"    📊 Downloaded: {downloaded_count} new icons, Skipped: {skipped_count} existing")

    def clean_game_data(self, games: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean game data by removing unwanted playtime fields."""
        cleaned_games = []
        for game in games:
            cleaned_game = game.copy()
            # Remove Mac and Linux playtime data
            cleaned_game.pop('playtime_mac_forever', None)
            cleaned_game.pop('playtime_linux_forever', None)
            cleaned_games.append(cleaned_game)
        return cleaned_games

    def format_playtime(self, minutes: int) -> str:
        """Convert minutes to human-readable format."""
        if minutes == 0:
            return "0 minutes"

        hours = minutes // 60
        remaining_minutes = minutes % 60

        if hours == 0:
            return f"{remaining_minutes} minutes"
        elif remaining_minutes == 0:
            return f"{hours} hours"
        else:
            return f"{hours}h {remaining_minutes}m"

    def get_player_status(self, persona_state: int) -> str:
        """Convert persona state number to readable status."""
        states = {
            0: "Offline",
            1: "Online",
            2: "Busy",
            3: "Away",
            4: "Snooze",
            5: "Looking to trade",
            6: "Looking to play"
        }
        return states.get(persona_state, "Unknown")

    def analyze_gaming_patterns(self):
        """Analyze gaming patterns and generate insights."""
        insights = []

        if not self.weekly_games_data.get('games'):
            insights.append("📊 No gaming activity this week")
            return insights

        weekly_games = self.weekly_games_data['games']
        total_weekly_time = self.weekly_games_data.get('total_weekly_playtime', 0)

        insights.append(f"🎯 You've played {len(weekly_games)} different games this week")
        insights.append(f"⏱️  Total weekly gaming time: {self.format_playtime(total_weekly_time)}")

        if total_weekly_time > 0:
            avg_daily = total_weekly_time / 7
            insights.append(f"📈 Average daily gaming this week: {self.format_playtime(int(avg_daily))}")

        # Find most played game this week
        if weekly_games:
            most_played = max(weekly_games, key=lambda x: x.get('playtime_delta', 0))
            insights.append(f"🏆 Most played this week: {most_played['name']} ({self.format_playtime(most_played.get('playtime_delta', 0))})")

        # Count new vs returning games
        new_games = [game for game in weekly_games if not game.get('is_returning_game', False)]
        returning_games = [game for game in weekly_games if game.get('is_returning_game', False)]

        if new_games:
            insights.append(f"🆕 New games this week: {len(new_games)}")
        if returning_games:
            insights.append(f"🔄 Returning games this week: {len(returning_games)}")

        return insights

    def display_dashboard(self):
        """Display the complete Steam gaming dashboard."""
        print("\n" + "="*80)
        print("🎮 STEAM GAMING DASHBOARD")
        print("="*80)

        # Player Info Section
        if self.player_data:
            print(f"\n👤 PLAYER PROFILE")
            print(f"   Name: {self.player_data.get('personaname', 'Unknown')}")
            print(f"   Status: {self.get_player_status(self.player_data.get('personastate', 0))}")
            if 'lastlogoff' in self.player_data:
                last_online = datetime.fromtimestamp(self.player_data['lastlogoff'])
                print(f"   Last Online: {last_online.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"   Profile: {self.player_data.get('profileurl', 'N/A')}")

        # Gaming Insights
        print(f"\n📊 GAMING INSIGHTS")
        insights = self.analyze_gaming_patterns()
        for insight in insights:
            print(f"   {insight}")

        # Weekly Games (This Week) - Main Focus
        print(f"\n📅 THIS WEEK'S GAMING ACTIVITY")
        active_games = [
            game for game in self.weekly_games_data.get('games', [])
            if game.get('playtime_delta', 0) > 0
        ]

        if active_games:
            print(f"   {'Game Name':<35} {'This Week':<15} {'Total Time':<15} {'Type':<10}")
            print(f"   {'-'*35} {'-'*15} {'-'*15} {'-'*10}")

            for game in sorted(active_games, key=lambda x: x.get('playtime_delta', 0), reverse=True):
                name = game['name'][:32] + "..." if len(game['name']) > 35 else game['name']
                weekly_time = self.format_playtime(game.get('playtime_delta', 0))
                total_time = self.format_playtime(game.get('playtime_forever', 0))
                game_type = "🔄 Return" if game.get('is_returning_game', False) else "🆕 New"
                print(f"   {name:<35} {weekly_time:<15} {total_time:<15} {game_type:<10}")
        else:
            print("   No games played this week")

        print("\n" + "="*80)

    def export_to_json(self, filename: Optional[str] = None):
        """Export weekly activity data to JSON file for further analysis."""
        # Create default filename with today's date if none provided
        if filename is None:
            today = datetime.now().strftime("%Y-%m-%d")
            filename = f"{self.export_dir}/steam_dashboard_{today}.json"

        # Create steam_export directory if it doesn't exist
        export_dir = os.path.dirname(filename)
        if export_dir and not os.path.exists(export_dir):
            os.makedirs(export_dir)
            print(f"📁 Created directory: {export_dir}")

        # Filter weekly games to only include those with playtime_delta > 0
        filtered_weekly_data = self.weekly_games_data.copy()
        if 'games' in filtered_weekly_data:
            # Filter games with playtime_delta > 0 and clean the data
            active_games = [
                game for game in filtered_weekly_data['games']
                if game.get('playtime_delta', 0) > 0
            ]
            filtered_weekly_data['games'] = self.clean_game_data(active_games)
            # Recalculate total weekly playtime for active games only
            filtered_weekly_data['total_weekly_playtime'] = sum(
                game.get('playtime_delta', 0) for game in active_games
            )

        export_data = {
            'timestamp': datetime.now().isoformat(),
            'weekly_activity': filtered_weekly_data
        }

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)

        print(f"📄 Weekly activity data exported to {filename}")


def main():
    """Main function to run the Steam dashboard."""
    parser = argparse.ArgumentParser(description='Steam Gaming Dashboard')
    parser.add_argument('--api-key', required=True, help='Your Steam Web API key')
    parser.add_argument('--steam-id', required=True, help='Your 64-bit Steam ID')
    parser.add_argument('--export', action='store_true', help='Export data to JSON file')
    parser.add_argument('--output', type=str, help='Custom output filename for export')

    args = parser.parse_args()

    # Create dashboard instance
    dashboard = SteamDashboard(args.api_key, args.steam_id)

    # Fetch all data
    dashboard.fetch_all_data()

    # Display dashboard
    dashboard.display_dashboard()

    # Export if requested
    if args.export:
        dashboard.export_to_json(args.output)


if __name__ == "__main__":
    main()
