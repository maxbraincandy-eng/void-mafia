import { useEffect } from 'react';
import { startMenuMusic, stopMenuMusic } from '@/lib/audioEngine';
import { useSettingsStore } from '@/store/settingsStore';

/** Plays mafia ambient music while the component is mounted (main menu). */
export function useMenuMusic() {
  const musicEnabled = useSettingsStore(s => s.musicEnabled);

  useEffect(() => {
    if (musicEnabled) startMenuMusic();
    return () => stopMenuMusic();
  }, [musicEnabled]);
}

/** Legacy alias — kept so RoomsPage import still compiles. */
export const useAmbientDrone = useMenuMusic;
