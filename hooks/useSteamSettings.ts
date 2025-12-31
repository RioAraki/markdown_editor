'use client';

import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'steam-settings';

export interface SteamSettings {
  apiKey: string;
  steamId: string;
}

export function useSteamSettings() {
  const [settings, setSettings] = useState<SteamSettings>({
    apiKey: '',
    steamId: '',
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      } catch (err) {
        console.error('Failed to parse Steam settings:', err);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: SteamSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  };

  return {
    settings,
    saveSettings,
    isLoaded,
    isConfigured: isLoaded && settings.apiKey && settings.steamId,
  };
}
