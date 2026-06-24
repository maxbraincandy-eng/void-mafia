import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

// Apply theme from localStorage before React mounts to avoid FOUC.
// Zustand-persist stores state under key.state, so we read it directly.
(function applyEarly() {
  try {
    const raw = localStorage.getItem('void-mafia-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode = parsed?.state?.themeMode;
      if (mode === 'void-neon' || mode === 'minimal-glass') {
        document.documentElement.setAttribute('data-theme', mode);
        return;
      }
    }
  } catch {}
  document.documentElement.setAttribute('data-theme', 'void-neon');
})();

export function ThemeProvider() {
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';

  useLayoutEffect(() => {
    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', themeMode);
    const timer = setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 250);
    return () => clearTimeout(timer);
  }, [themeMode]);

  return null;
}
