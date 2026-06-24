import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  // Audio
  sfxEnabled: boolean;
  musicEnabled: boolean;
  notificationSounds: boolean;
  sfxVolume: number;

  // Game
  autoReady: boolean;
  showRoleAnimation: boolean;
  timerStyle: 'bar' | 'countdown';
  showChatTimestamps: boolean;
  defaultLastWill: string;

  // Privacy
  friendRequestsFrom: 'everyone' | 'nobody';
  dmsFrom: 'everyone' | 'friends' | 'nobody';
  showOnlineStatus: boolean;

  // Notifications
  notifyGameInvites: boolean;
  notifyFriendRequests: boolean;
  notifyDMs: boolean;

  // Accessibility
  reduceAnimations: boolean;
  largeText: boolean;

  // Design
  themeMode: 'void-neon' | 'minimal-glass';
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const DEFAULTS: Settings = {
  sfxEnabled: true,
  musicEnabled: false,
  notificationSounds: true,
  sfxVolume: 80,
  autoReady: false,
  showRoleAnimation: true,
  timerStyle: 'bar',
  showChatTimestamps: false,
  defaultLastWill: '',
  friendRequestsFrom: 'everyone',
  dmsFrom: 'everyone',
  showOnlineStatus: true,
  notifyGameInvites: true,
  notifyFriendRequests: true,
  notifyDMs: true,
  reduceAnimations: false,
  largeText: false,
  themeMode: 'void-neon',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    {
      name: 'void-mafia-settings',
      version: 4,
      migrate: (stored: any, fromVersion: number) => {
        if (fromVersion < 2) {
          return { ...DEFAULTS, ...stored, sfxEnabled: true, musicEnabled: false, sfxVolume: Math.max(stored?.sfxVolume ?? 0, 80) };
        }
        if (fromVersion < 3) {
          return { ...DEFAULTS, ...stored, musicEnabled: false };
        }
        if (fromVersion < 4) {
          return { ...DEFAULTS, ...stored, themeMode: stored?.themeMode ?? 'void-neon' };
        }
        return stored as SettingsStore;
      },
    },
  ),
);
