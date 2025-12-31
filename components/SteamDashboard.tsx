'use client';

import React from 'react';
import { useSteamContext } from '@/contexts/SteamContext';
import { formatDisplayDate } from '@/lib/dateUtils';
import { Gamepad2, Clock, Trophy, RotateCw } from 'lucide-react';
import { format } from 'date-fns';

export function SteamDashboard() {
  const { selectedDate, currentData, isLoading } = useSteamContext();

  const formatPlaytime = (minutes: number) => {
    if (minutes === 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const formatTotalPlaytime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h` : `${minutes}m`;
  };

  if (!selectedDate) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p>Select a week to view gaming activity</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!currentData || !currentData.weekly_activity) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const { weekly_activity } = currentData;
  const activeGames = weekly_activity.games.filter(game => game.playtime_delta && game.playtime_delta > 0);
  const newGames = activeGames.filter(game => !game.is_returning_game);
  const returningGames = activeGames.filter(game => game.is_returning_game);
  const avgDaily = weekly_activity.total_weekly_playtime / 7;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">
          {formatDisplayDate(selectedDate)}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Week of {selectedDate}
          {currentData.timestamp && (
            <span className="ml-2">
              • Last updated {format(new Date(currentData.timestamp), 'MMM d, yyyy')}
            </span>
          )}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Time</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  {formatTotalPlaytime(weekly_activity.total_weekly_playtime)}
                </p>
              </div>
              <Clock className="w-8 h-8 text-blue-600 opacity-50" />
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Games Played</p>
                <p className="text-2xl font-bold text-green-900 mt-1">
                  {activeGames.length}
                </p>
              </div>
              <Gamepad2 className="w-8 h-8 text-green-600 opacity-50" />
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Daily Average</p>
                <p className="text-2xl font-bold text-purple-900 mt-1">
                  {formatPlaytime(Math.round(avgDaily))}
                </p>
              </div>
              <Trophy className="w-8 h-8 text-purple-600 opacity-50" />
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">New Games</p>
                <p className="text-2xl font-bold text-orange-900 mt-1">
                  {newGames.length}
                </p>
              </div>
              <RotateCw className="w-8 h-8 text-orange-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Games List */}
        {activeGames.length > 0 ? (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Games This Week</h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Game
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      This Week
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeGames
                    .sort((a, b) => (b.playtime_delta || 0) - (a.playtime_delta || 0))
                    .map((game) => (
                      <tr key={game.appid} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            {game.img_icon_url && (
                              <img
                                src={`/steam_img/${game.appid}.jpg`}
                                alt={game.name}
                                className="w-8 h-8 rounded mr-3"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <span className="text-sm font-medium text-gray-900">{game.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {formatPlaytime(game.playtime_delta || 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatTotalPlaytime(game.playtime_forever)}
                        </td>
                        <td className="px-4 py-3">
                          {game.is_returning_game ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <RotateCw className="w-3 h-3 mr-1" />
                              Returning
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              New
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Gamepad2 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No games played this week</p>
          </div>
        )}
      </div>
    </div>
  );
}
