import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

// Apply theme from localStorage before React mounts to avoid FOUC.
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

function applyTheme(mode: string) {
  const safe = (mode === 'void-neon' || mode === 'minimal-glass') ? mode : 'void-neon';
  document.documentElement.setAttribute('data-theme', safe);
}

export function ThemeProvider() {
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';

  // Apply synchronously during render (prevents any paint with wrong theme)
  applyTheme(themeMode);

  useLayoutEffect(() => {
    applyTheme(themeMode);
    document.documentElement.classList.add('theme-transitioning');
    const timer = setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 250);
    return () => clearTimeout(timer);
  }, [themeMode]);

  return null;
}
