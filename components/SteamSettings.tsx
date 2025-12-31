'use client';

import React, { useState } from 'react';
import { X, Settings as SettingsIcon, RefreshCw, Check } from 'lucide-react';
import { useSteamSettings } from '@/hooks/useSteamSettings';
import { useSteamContext } from '@/contexts/SteamContext';

interface SteamSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SteamSettings({ isOpen, onClose }: SteamSettingsProps) {
  const { settings, saveSettings, isConfigured } = useSteamSettings();
  const { refreshExports } = useSteamContext();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [steamId, setSteamId] = useState(settings.steamId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    setApiKey(settings.apiKey);
    setSteamId(settings.steamId);
  }, [settings]);

  const handleSave = () => {
    saveSettings({ apiKey, steamId });
    setMessage({ type: 'success', text: 'Settings saved!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleGenerate = async () => {
    if (!apiKey || !steamId) {
      setMessage({ type: 'error', text: 'Please configure API key and Steam ID first' });
      return;
    }

    setIsGenerating(true);
    setMessage(null);

    try {
      const response = await fetch('/api/steam/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, steamId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate dashboard');
      }

      const result = await response.json();
      setMessage({
        type: 'success',
        text: `Dashboard generated! ${result.gamesCount} games, ${Math.floor(result.totalPlaytime / 60)}h ${result.totalPlaytime % 60}m total`,
      });

      // Refresh the exports list
      await refreshExports();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate dashboard',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2" />
            Steam Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Steam API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Steam API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://steamcommunity.com/dev/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                steamcommunity.com/dev/apikey
              </a>
            </p>
          </div>

          {/* Steam ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Steam ID (64-bit)
            </label>
            <input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter your Steam ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Find your Steam ID at{' '}
              <a
                href="https://steamid.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                steamid.io
              </a>
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            <Check className="w-4 h-4" />
            Save Settings
          </button>

          {/* Generate Dashboard */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !apiKey || !steamId}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating Dashboard...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Generate Dashboard
                </>
              )}
            </button>
            <p className="mt-2 text-xs text-gray-500 text-center">
              Fetches your Steam gaming activity and creates a new dashboard
            </p>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-3 rounded-md ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <p className="text-sm">{message.text}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
