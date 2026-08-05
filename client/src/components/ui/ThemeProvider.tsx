import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

// CSS variable values per theme — applied directly to html element style
// so they work even if CSS cascade is broken or overridden.
// Each theme defines TWO layers:
//
//   1. Primitive tokens (--vm-text, --vm-surface-1, --vm-accent, …) consumed
//      through `T` in design/tokens.ts. These are what new and migrated screens
//      use, and they are why an inline style can now follow the theme at all.
//   2. Component-scoped vars (--vm-fab-on, --vm-tab-clans, …) that predate the
//      primitives. Left as-is — they work — but new ones should be primitives.
//
// Every key must appear in ALL THREE themes. A key present in only one silently
// resolves to nothing in the others, and the element loses that property.
const THEME_VARS: Record<string, Record<string, string>> = {
  'void-neon': {
    // ── primitives ──
    '--vm-text': '#ffffff',
    '--vm-text-2': 'rgba(255,255,255,0.78)',
    '--vm-text-3': '#7d86a0',
    '--vm-text-4': 'rgba(255,255,255,0.34)',
    '--vm-text-on-accent': '#ffffff',
    '--vm-bg-page': '#03000d',
    '--vm-bg-page-blur': 'rgba(3,0,13,0.90)',
    '--vm-surface-1': 'rgba(10,6,28,0.92)',
    '--vm-surface-2': 'rgba(18,10,42,0.96)',
    '--vm-surface-3': 'rgba(255,255,255,0.04)',
    '--vm-hairline': 'rgba(255,255,255,0.08)',
    '--vm-hairline-strong': 'rgba(255,255,255,0.16)',
    '--vm-accent': '#9b00ff',
    '--vm-accent-soft': 'rgba(155,0,255,0.14)',
    '--vm-accent-2': '#00e5ff',
    '--vm-accent-2-soft': 'rgba(0,229,255,0.12)',
    '--vm-success': '#00ff88',
    '--vm-success-soft': 'rgba(0,255,136,0.13)',
    '--vm-warn': '#f59e0b',
    '--vm-warn-soft': 'rgba(245,158,11,0.14)',
    '--vm-danger': '#ff2d55',
    '--vm-danger-soft': 'rgba(255,45,85,0.14)',
    '--vm-gold': '#facc15',
    '--vm-text-on-gold': '#1a1206',
    '--vm-gold-soft': 'rgba(250,204,21,0.14)',
    '--vm-grad-accent': 'linear-gradient(135deg, #9b00ff, #00e5ff)',
    '--vm-grad-gold': 'linear-gradient(135deg, #facc15, #ffd45a)',
    '--vm-grad-success': 'linear-gradient(135deg, #00ff88, #22c55e)',
    '--vm-grad-danger': 'linear-gradient(135deg, #ff2d55, #ff6b81)',
    '--vm-shadow-card': 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 16px rgba(0,0,0,0.30)',
    '--vm-shadow-raised': 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.55)',
    '--vm-glow-accent': '0 0 20px rgba(155,0,255,0.42)',
    '--vm-glow-gold': '0 0 18px rgba(250,204,21,0.35)',
    '--vm-glow-danger': '0 0 18px rgba(255,45,85,0.38)',
    // ── component-scoped (legacy) ──
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
    // ── primitives ──
    // Surfaces here are translucent white over a navy page, so text sits on a
    // lighter field than in void-neon and the muted step has to be lifted to
    // stay legible — #7d86a0 reads as disabled against 7% white.
    '--vm-text': '#ffffff',
    '--vm-text-2': 'rgba(255,255,255,0.80)',
    '--vm-text-3': '#aeb8cc',
    '--vm-text-4': 'rgba(255,255,255,0.42)',
    '--vm-text-on-accent': '#ffffff',
    '--vm-bg-page': '#0f1629',
    '--vm-bg-page-blur': 'rgba(15,22,41,0.90)',
    '--vm-surface-1': 'rgba(255,255,255,0.07)',
    '--vm-surface-2': 'rgba(255,255,255,0.12)',
    '--vm-surface-3': 'rgba(255,255,255,0.05)',
    '--vm-hairline': 'rgba(255,255,255,0.14)',
    '--vm-hairline-strong': 'rgba(255,255,255,0.24)',
    '--vm-accent': '#a78bfa',
    '--vm-accent-soft': 'rgba(139,92,246,0.18)',
    '--vm-accent-2': '#22d3ee',
    '--vm-accent-2-soft': 'rgba(34,211,238,0.14)',
    '--vm-success': '#34d399',
    '--vm-success-soft': 'rgba(52,211,153,0.15)',
    '--vm-warn': '#fbbf24',
    '--vm-warn-soft': 'rgba(251,191,36,0.15)',
    '--vm-danger': '#f87171',
    '--vm-danger-soft': 'rgba(248,113,113,0.15)',
    '--vm-gold': '#fbbf24',
    '--vm-text-on-gold': '#1a1206',
    '--vm-gold-soft': 'rgba(251,191,36,0.15)',
    '--vm-grad-accent': 'linear-gradient(135deg, #8b5cf6, #22d3ee)',
    '--vm-grad-gold': 'linear-gradient(135deg, #fbbf24, #fde68a)',
    '--vm-grad-success': 'linear-gradient(135deg, #34d399, #10b981)',
    '--vm-grad-danger': 'linear-gradient(135deg, #f87171, #fb7185)',
    // Glass leans on depth rather than glow, so the shadows carry more and the
    // "glow" tokens are deliberately restrained.
    '--vm-shadow-card': 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 20px rgba(0,0,0,0.28)',
    '--vm-shadow-raised': 'inset 0 1px 0 rgba(255,255,255,0.14), 0 16px 48px rgba(0,0,0,0.45)',
    '--vm-glow-accent': '0 0 18px rgba(139,92,246,0.30)',
    '--vm-glow-gold': '0 0 16px rgba(251,191,36,0.26)',
    '--vm-glow-danger': '0 0 16px rgba(248,113,113,0.28)',
    // ── component-scoped (legacy) ──
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
  // A calm, professional graphite theme — neutral slate surfaces, thin light
  // borders, one restrained steel-blue accent, minimal glow. Easy on the eyes.
  'graphite': {
    // ── primitives ──
    // The whole point of graphite is restraint, so the "glow" tokens resolve to
    // ordinary shadows. A screen asking for T.shadow.glowAccent gets emphasis
    // here too — just spoken in this theme's voice instead of neon's.
    '--vm-text': '#e8edf7',
    '--vm-text-2': 'rgba(232,237,247,0.78)',
    '--vm-text-3': '#94a3b8',
    '--vm-text-4': 'rgba(148,163,184,0.55)',
    '--vm-text-on-accent': '#0b0d12',
    '--vm-bg-page': '#0b0d12',
    '--vm-bg-page-blur': 'rgba(11,13,18,0.90)',
    '--vm-surface-1': 'rgba(24,27,35,0.90)',
    '--vm-surface-2': 'rgba(33,37,48,0.96)',
    '--vm-surface-3': 'rgba(255,255,255,0.04)',
    '--vm-hairline': 'rgba(255,255,255,0.08)',
    '--vm-hairline-strong': 'rgba(255,255,255,0.16)',
    '--vm-accent': '#6b8afd',
    '--vm-accent-soft': 'rgba(107,138,253,0.14)',
    '--vm-accent-2': '#94a3b8',
    '--vm-accent-2-soft': 'rgba(148,163,184,0.12)',
    '--vm-success': '#5eb98a',
    '--vm-success-soft': 'rgba(94,185,138,0.14)',
    '--vm-warn': '#d0a95a',
    '--vm-warn-soft': 'rgba(208,169,90,0.14)',
    '--vm-danger': '#d97a7a',
    '--vm-danger-soft': 'rgba(217,122,122,0.14)',
    '--vm-gold': '#d8c47a',
    '--vm-text-on-gold': '#1a1206',
    '--vm-gold-soft': 'rgba(216,196,122,0.14)',
    '--vm-grad-accent': 'linear-gradient(135deg, #6b8afd, #94a3b8)',
    '--vm-grad-gold': 'linear-gradient(135deg, #d8c47a, #e8dcc8)',
    '--vm-grad-success': 'linear-gradient(135deg, #5eb98a, #47946e)',
    '--vm-grad-danger': 'linear-gradient(135deg, #d97a7a, #c26565)',
    '--vm-shadow-card': 'inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 14px rgba(0,0,0,0.40)',
    '--vm-shadow-raised': 'inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 44px rgba(0,0,0,0.60)',
    '--vm-glow-accent': '0 2px 14px rgba(107,138,253,0.22)',
    '--vm-glow-gold': '0 2px 12px rgba(216,196,122,0.18)',
    '--vm-glow-danger': '0 2px 12px rgba(217,122,122,0.20)',
    // ── component-scoped (legacy) ──
    '--bg-main': '#0b0d12',
    '--glass-bg': 'rgba(28, 32, 42, 0.62)',
    '--glass-border': 'rgba(255, 255, 255, 0.10)',
    '--glass-blur': 'blur(28px)',
    '--panel-bg': 'linear-gradient(180deg, rgba(21,24,32,0.98) 0%, rgba(14,16,22,0.98) 100%)',
    '--panel-border': 'rgba(255,255,255,0.08)',
    '--vm-nav-bg': 'rgba(12,14,19,0.96)',
    '--vm-nav-border': 'rgba(255,255,255,0.07)',
    '--vm-surface-bg': 'rgba(24,27,35,0.90)',
    '--vm-surface-border': 'rgba(255,255,255,0.08)',
    '--vm-page-gradient': 'linear-gradient(160deg, #12151c 0%, #0a0c11 62%)',
    '--vm-orb-1': 'rgba(107,138,253,0.08)',
    '--vm-orb-2': 'rgba(148,163,184,0.05)',
    '--vm-tab-active-bg': 'linear-gradient(135deg, rgba(107,138,253,0.20), rgba(148,163,184,0.10))',
    '--vm-tab-active-border': 'rgba(107,138,253,0.42)',
    '--vm-toggle-on': 'linear-gradient(90deg, #6b8afd, #94a3b8)',
    '--vm-toggle-on-border': 'rgba(107,138,253,0.40)',
    '--vm-toggle-on-shadow': '0 0 8px rgba(107,138,253,0.20)',
    '--vm-panel-left-accent': 'linear-gradient(180deg, transparent 0%, rgba(107,138,253,0.28) 30%, rgba(148,163,184,0.12) 70%, transparent 100%)',
    '--vm-avatar-bg': 'linear-gradient(135deg, rgba(107,138,253,0.32), rgba(148,163,184,0.12))',
    '--vm-avatar-border': 'rgba(107,138,253,0.20)',
    '--vm-level-pip': 'linear-gradient(135deg, #6b8afd, #94a3b8)',
    '--vm-level-pip-shadow': 'rgba(107,138,253,0.40)',
    '--vm-fab-off': 'linear-gradient(145deg, #475569, #334155)',
    '--vm-fab-on': 'linear-gradient(145deg, #6b8afd, #475569)',
    '--vm-community-gradient': 'linear-gradient(135deg, #93a4ff, #cbd5e1)',
    '--vm-games-color': '#6b8afd',
    '--vm-notif-bg': 'rgba(107,138,253,0.10)',
    '--vm-notif-border': 'rgba(107,138,253,0.28)',
    '--vm-tab-community': '#7c93ff',
    '--vm-tab-games': '#d0a95a',
    '--vm-tab-clans': '#d97a7a',
    '--vm-tab-leaderboard': '#d8c47a',
    '--vm-tab-profile': '#6bc4c4',
    '--radius-card': '14px',
    '--radius-button': '10px',
  },
};

// Apply theme from localStorage before React mounts to avoid FOUC.
(function applyEarly() {
  try {
    const raw = localStorage.getItem('void-mafia-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode = parsed?.state?.themeMode;
      if (mode && THEME_VARS[mode]) {
        applyVarsToDOM(mode);
        return;
      }
    }
  } catch {}
  applyVarsToDOM('minimal-glass'); // default for first open (no saved choice)
})();

function applyVarsToDOM(mode: string) {
  const safe = THEME_VARS[mode] ? mode : 'minimal-glass';
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
