import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

// CSS variable values per theme — applied directly to html element style
// so they work even if CSS cascade is broken or overridden.
const THEME_VARS: Record<string, Record<string, string>> = {
  'void-neon': {
    '--bg-main': '#03000d',
    '--glass-bg': 'rgba(10, 5, 32, 0.7)',
    '--glass-border': 'rgba(0, 245, 255, 0.08)',
    '--glass-blur': 'blur(20px)',
    '--panel-bg': 'linear-gradient(180deg, rgba(8,4,22,0.99) 0%, rgba(5,2,15,0.99) 100%)',
    '--panel-border': 'rgba(138, 43, 226, 0.12)',
    '--vm-nav-bg': 'rgba(3,0,13,0.97)',
    '--vm-nav-border': 'rgba(255,255,255,0.06)',
    '--vm-surface-bg': 'rgba(10, 6, 28, 0.92)',
    '--vm-surface-border': 'rgba(255,255,255,0.06)',
    '--vm-page-gradient': 'linear-gradient(160deg, #0c0525 0%, #050311 50%)',
    '--vm-orb-1': 'rgba(155,0,255,0.10)',
    '--vm-orb-2': 'rgba(0,245,255,0.08)',
    '--vm-tab-active-bg': 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))',
    '--vm-tab-active-border': 'rgba(155,0,255,0.45)',
    '--vm-toggle-on': 'linear-gradient(90deg, #9b00ff, #00e5ff)',
    '--vm-toggle-on-border': 'rgba(155,0,255,0.4)',
    '--vm-toggle-on-shadow': '0 0 8px rgba(155,0,255,0.25)',
    '--vm-panel-left-accent': 'linear-gradient(180deg, transparent 0%, rgba(138,43,226,0.35) 30%, rgba(0,229,255,0.2) 70%, transparent 100%)',
    '--vm-avatar-bg': 'linear-gradient(135deg, rgba(138,43,226,0.4), rgba(0,229,255,0.15))',
    '--vm-avatar-border': 'rgba(138,43,226,0.25)',
    '--vm-level-pip': 'linear-gradient(135deg, #9b00ff, #00e5ff)',
    '--vm-level-pip-shadow': 'rgba(155,0,255,0.5)',
    '--vm-fab-off': 'linear-gradient(145deg, #7c3aed, #4f46e5)',
    '--vm-fab-on': 'linear-gradient(145deg, #c026d3, #7c3aed, #0ea5e9)',
    '--vm-community-gradient': 'linear-gradient(135deg, #c084fc, #00f5ff)',
    '--vm-games-color': '#f59e0b',
    '--vm-notif-bg': 'rgba(155,0,255,0.10)',
    '--vm-notif-border': 'rgba(155,0,255,0.30)',
    '--vm-tab-community': '#9b00ff',
    '--vm-tab-games': '#f59e0b',
    '--vm-tab-clans': '#ef4444',
    '--vm-tab-leaderboard': '#facc15',
    '--vm-tab-profile': '#00e5ff',
    '--radius-card': '16px',
    '--radius-button': '12px',
  },
  'minimal-glass': {
    '--bg-main': '#0f1629',
    '--glass-bg': 'rgba(255, 255, 255, 0.09)',
    '--glass-border': 'rgba(255, 255, 255, 0.16)',
    '--glass-blur': 'blur(36px)',
    '--panel-bg': 'rgba(255, 255, 255, 0.06)',
    '--panel-border': 'rgba(255, 255, 255, 0.14)',
    '--vm-nav-bg': 'rgba(255, 255, 255, 0.05)',
    '--vm-nav-border': 'rgba(255, 255, 255, 0.16)',
    '--vm-surface-bg': 'rgba(255,255,255,0.08)',
    '--vm-surface-border': 'rgba(255,255,255,0.14)',
    '--vm-page-gradient': 'linear-gradient(160deg, #111428 0%, #0a0e1e 50%)',
    '--vm-orb-1': 'rgba(139,92,246,0.18)',
    '--vm-orb-2': 'rgba(34,211,238,0.12)',
    '--vm-tab-active-bg': 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(34,211,238,0.12))',
    '--vm-tab-active-border': 'rgba(139,92,246,0.40)',
    '--vm-toggle-on': 'linear-gradient(90deg, #8b5cf6, #22d3ee)',
    '--vm-toggle-on-border': 'rgba(139,92,246,0.4)',
    '--vm-toggle-on-shadow': '0 0 8px rgba(139,92,246,0.25)',
    '--vm-panel-left-accent': 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.30) 30%, rgba(34,211,238,0.15) 70%, transparent 100%)',
    '--vm-avatar-bg': 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(34,211,238,0.12))',
    '--vm-avatar-border': 'rgba(139,92,246,0.22)',
    '--vm-level-pip': 'linear-gradient(135deg, #8b5cf6, #22d3ee)',
    '--vm-level-pip-shadow': 'rgba(139,92,246,0.4)',
    '--vm-fab-off': 'linear-gradient(145deg, #6d28d9, #4c1d95)',
    '--vm-fab-on': 'linear-gradient(145deg, #8b5cf6, #6d28d9, #0891b2)',
    '--vm-community-gradient': 'linear-gradient(135deg, #a78bfa, #22d3ee)',
    '--vm-games-color': '#a78bfa',
    '--vm-notif-bg': 'rgba(139,92,246,0.10)',
    '--vm-notif-border': 'rgba(139,92,246,0.30)',
    '--vm-tab-community': '#8b5cf6',
    '--vm-tab-games': '#fbbf24',
    '--vm-tab-clans': '#f87171',
    '--vm-tab-leaderboard': '#fde68a',
    '--vm-tab-profile': '#67e8f9',
    '--radius-card': '22px',
    '--radius-button': '16px',
  },
};

// Apply theme from localStorage before React mounts to avoid FOUC.
(function applyEarly() {
  try {
    const raw = localStorage.getItem('void-mafia-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode = parsed?.state?.themeMode;
      if (mode === 'void-neon' || mode === 'minimal-glass') {
        applyVarsToDOM(mode);
        return;
      }
    }
  } catch {}
  applyVarsToDOM('minimal-glass'); // default for first open (no saved choice)
})();

function applyVarsToDOM(mode: string) {
  const safe = (mode === 'void-neon' || mode === 'minimal-glass') ? mode : 'void-neon';
  const el = document.documentElement;
  el.setAttribute('data-theme', safe);
  // Directly set CSS vars on the element's inline style so they cascade
  // regardless of stylesheet load order or specificity issues.
  const vars = THEME_VARS[safe] ?? THEME_VARS['void-neon'];
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}

export function ThemeProvider() {
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'minimal-glass';

  applyVarsToDOM(themeMode);

  useLayoutEffect(() => {
    applyVarsToDOM(themeMode);
    document.documentElement.classList.add('theme-transitioning');
    const timer = setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 250);
    return () => clearTimeout(timer);
  }, [themeMode]);

  return null;
}
