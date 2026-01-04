'use client';

import React, { useState } from 'react';
import { useSteamContext } from '@/contexts/SteamContext';
import { formatDisplayDate } from '@/lib/dateUtils';
import { Gamepad2, Clock, Trophy, RotateCw, Edit2, Save, X, Award } from 'lucide-react';
import { format } from 'date-fns';

interface GameEdit {
  appid: number;
  trophy: string;
  comment: string;
}

export function SteamDashboard() {
  const { selectedDate, currentData, isLoading, refreshData } = useSteamContext();
  const [editingGame, setEditingGame] = useState<number | null>(null);
  const [editData, setEditData] = useState<GameEdit | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const getTrophyColor = (trophy?: string) => {
    switch (trophy) {
      case 'Platinum':
        return 'text-cyan-600 bg-cyan-50 border border-cyan-200';
      case 'Gold':
        return 'text-yellow-600 bg-yellow-50';
      case 'Silver':
        return 'text-gray-500 bg-gray-100';
      case 'Bronze':
        return 'text-orange-700 bg-orange-50';
      default:
        return 'text-gray-400 bg-gray-50';
    }
  };

  const getTrophyIcon = (trophy?: string) => {
    return <Award className="w-4 h-4" />;
  };

  const handleEditStart = (game: any) => {
    setEditingGame(game.appid);
    setEditData({
      appid: game.appid,
      trophy: game.trophy || '',
      comment: game.comment || '',
    });
  };

  const handleEditCancel = () => {
    setEditingGame(null);
    setEditData(null);
  };

  const handleEditSave = async () => {
    if (!editData || !selectedDate) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/steam/${selectedDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appid: editData.appid,
          trophy: editData.trophy || null,
          comment: editData.comment || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update game');
      }

      // Refresh data to show updated values
      await refreshData();
      setEditingGame(null);
      setEditData(null);
    } catch (err) {
      console.error('Error updating game:', err);
      alert('Failed to update game');
    } finally {
      setIsSaving(false);
    }
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
            <div className="space-y-4">
              {activeGames
                .sort((a, b) => (b.playtime_delta || 0) - (a.playtime_delta || 0))
                .map((game) => (
                  <div
                    key={game.appid}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {/* Game Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center flex-1">
                        {game.img_icon_url && (
                          <img
                            src={`/steam_img/${game.appid}.jpg`}
                            alt={game.name}
                            className="w-12 h-12 rounded mr-3"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="text-base font-semibold text-gray-900">{game.name}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-gray-600">
                              This week: <span className="font-medium text-gray-900">{formatPlaytime(game.playtime_delta || 0)}</span>
                            </span>
                            <span className="text-sm text-gray-500">
                              Total: {formatTotalPlaytime(game.playtime_forever)}
                            </span>
                            {game.is_returning_game ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <RotateCw className="w-3 h-3 mr-1" />
                                Returning
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                New
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Edit Button */}
                      {editingGame !== game.appid && (
                        <button
                          onClick={() => handleEditStart(game)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit trophy and comment"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Trophy and Comment Display/Edit */}
                    {editingGame === game.appid && editData ? (
                      <div className="space-y-3 mt-3 pt-3 border-t border-gray-200">
                        {/* Trophy Edit */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Trophy
                          </label>
                          <select
                            value={editData.trophy}
                            onChange={(e) => setEditData({ ...editData, trophy: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">None</option>
                            <option value="Platinum">Platinum</option>
                            <option value="Gold">Gold</option>
                            <option value="Silver">Silver</option>
                            <option value="Bronze">Bronze</option>
                          </select>
                        </div>

                        {/* Comment Edit */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Comment
                          </label>
                          <textarea
                            value={editData.comment}
                            onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
                            placeholder="Add your thoughts about this game..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                          />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleEditCancel}
                            disabled={isSaving}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                          >
                            <X className="w-4 h-4 inline mr-1" />
                            Cancel
                          </button>
                          <button
                            onClick={handleEditSave}
                            disabled={isSaving}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Save className="w-4 h-4 inline mr-1" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                        {/* Trophy Display */}
                        {game.trophy && (
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-medium ${getTrophyColor(game.trophy)}`}>
                              {getTrophyIcon(game.trophy)}
                              <span className="ml-1">{game.trophy}</span>
                            </span>
                          </div>
                        )}

                        {/* Comment Display */}
                        {game.comment && (
                          <div className="text-sm text-gray-700 bg-gray-50 rounded-md p-3">
                            {game.comment}
                          </div>
                        )}

                        {/* Placeholder when no trophy/comment */}
                        {!game.trophy && !game.comment && (
                          <div className="text-sm text-gray-400 italic">
                            No trophy or comment yet. Click edit to add one.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
