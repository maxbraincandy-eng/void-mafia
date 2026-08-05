/**
 * Void Mafia design tokens — the single source of truth for surface, colour,
 * spacing, radius and type across the app.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The app grew to 37 feature areas, 450 files and 3,974 inline `style={{}}`
 * blocks, and a count of the literals in those blocks turned up 667 distinct
 * hex colours: six different golds, three cyans, four reds. Nothing was wrong
 * individually; together they read as 37 products rather than one.
 *
 * Worse, it was a correctness bug and not only a taste one. The app ships three
 * themes (void-neon, minimal-glass, graphite) driven by CSS variables on
 * <html>, and `minimal-glass` is the DEFAULT for a first-time open. A hardcoded
 * `#9b00ff` cannot respond to that, so every inline-styled screen stayed neon
 * purple while the chrome around it went calm slate. Tokens are how those
 * screens rejoin the theme.
 *
 * HOW TO USE
 * ──────────
 *   import { T } from '@/design/tokens';
 *   <div style={{ background: T.surface.card, color: T.text.muted,
 *                 borderRadius: T.radius.lg, padding: T.space.md }} />
 *
 * Colour tokens are `var(--vm-…)` strings, so they re-resolve the moment the
 * theme changes — no re-render needed. Scale tokens (space, radius, type) are
 * plain numbers because they are theme-invariant and often need arithmetic.
 *
 * ADDING A COLOUR
 * ───────────────
 * Don't. Reach for the nearest semantic token first. If a genuinely new role
 * appears, add it to all three themes in ThemeProvider.tsx AND to the :root
 * fallback in styles/globals.css — a token defined in only one theme silently
 * disappears in the other two.
 */

/** Theme-reactive colour. Resolves through the CSS variable set on <html>. */
const v = (name: string) => `var(--vm-${name})`;

export const T = {
  /** Text, darkest-to-lightest by prominence. Four steps is enough; a fifth
   *  always turns out to be one of these four under a different name. */
  text: {
    /** Headings, numbers, anything the eye should land on first. */
    primary: v('text'),
    /** Body copy and labels that carry meaning. */
    secondary: v('text-2'),
    /** Supporting detail — timestamps, counts, hints. */
    muted: v('text-3'),
    /** Decorative or disabled. Do not put information here alone. */
    faint: v('text-4'),
    /** On a filled accent/danger button, where the surface is the colour. */
    onAccent: v('text-on-accent'),
    /** On a gold fill — gold is a light surface in all three themes, so this
     *  stays dark rather than following the theme's text colour. */
    onGold: v('text-on-gold'),
  },

  /** Surfaces, in stacking order. Each step reads as physically closer. */
  surface: {
    /** The page itself. */
    page: v('bg-page'),
    /** The page colour at ~90% — for sticky headers and blurred bars that must
     *  read as the page while content slides beneath them. A plain rgba here
     *  would pick a side between the light and dark themes. */
    pageBlur: v('bg-page-blur'),
    /** Standard card / panel sitting on the page. */
    card: v('surface-1'),
    /** A card raised above another card — modals, active rows. */
    raised: v('surface-2'),
    /** Recessed: inputs, wells, progress tracks. */
    sunken: v('surface-3'),
    /** Hairline divider or card border. */
    line: v('hairline'),
    /** A border that needs to be seen, not merely felt. */
    lineStrong: v('hairline-strong'),
  },

  /** Brand and status colour. `soft` is the low-alpha tint for backgrounds and
   *  borders; the base is for text, icons and fills. */
  color: {
    accent: v('accent'), accentSoft: v('accent-soft'),
    accent2: v('accent-2'), accent2Soft: v('accent-2-soft'),
    success: v('success'), successSoft: v('success-soft'),
    warn: v('warn'), warnSoft: v('warn-soft'),
    danger: v('danger'), dangerSoft: v('danger-soft'),
    /** Currency, rank, reward. The six golds in the old code are all this. */
    gold: v('gold'), goldSoft: v('gold-soft'),
  },

  /** Ready-made gradients so every screen's hero fill matches. */
  gradient: {
    accent: v('grad-accent'),
    gold: v('grad-gold'),
    success: v('grad-success'),
    danger: v('grad-danger'),
  },

  /** Glow / elevation. Neon themes lean on glow, calm themes on shadow — the
   *  token hides which, so a screen doesn't have to pick sides. */
  shadow: {
    card: v('shadow-card'),
    raised: v('shadow-raised'),
    glowAccent: v('glow-accent'),
    glowGold: v('glow-gold'),
    glowDanger: v('glow-danger'),
  },

  /** Spacing, 4-based with the 6 and 10 the codebase actually leans on kept.
   *  Numbers, not strings, because half of these get arithmetic done to them. */
  space: {
    xxs: 2, xs: 4, sm: 6, md: 8, lg: 10, xl: 12,
    '2xl': 16, '3xl': 20, '4xl': 24, '5xl': 32,
  },

  /** Corner radius. The old code used 12 / 14 / 10 / 20 / 8 / 16 / 22 more or
   *  less interchangeably; these five cover every one of those cases. */
  radius: {
    sm: 8, md: 12, lg: 16, xl: 20,
    /** Pills and circles. */
    full: 999,
  },

  /** Type scale. Kept dense at the small end on purpose: Georgian sets wider
   *  than Latin at the same size, so the UI genuinely lives at 11–15px. */
  font: {
    micro: 10, caption: 11, small: 12, body: 13,
    subhead: 15, title: 18, headline: 22, display: 28,
  },

  /** Weight, so `fontWeight: 900` stops appearing next to `fontWeight: 800`. */
  weight: {
    normal: 500, medium: 600, bold: 700, heavy: 800,
  },

  /** Motion. One duration per intent — the app currently has fourteen. */
  motion: {
    /** Press feedback, hover, toggles. */
    fast: 0.12,
    /** The default: panels, fades, list items. */
    base: 0.24,
    /** Entrances that should feel deliberate. */
    slow: 0.42,
    /** Standard easing pair. */
    ease: [0.22, 1, 0.36, 1] as const,
  },
} as const;

/** Alpha-blend a token-independent overlay onto whatever is beneath it. Use for
 *  hover/press states so they work on every theme without a second token. */
export const overlay = {
  hover: 'rgba(255,255,255,0.05)',
  press: 'rgba(255,255,255,0.09)',
  /** Behind a sheet or dialog — the page should still be legible underneath. */
  scrim: 'rgba(0,0,0,0.62)',
  /** Behind a full-screen cinematic moment, where the page must get out of the
   *  way entirely (chest openings, evolution). */
  scrimHeavy: 'rgba(0,0,0,0.90)',
} as const;

/** Shorthand for the border every card in the app should have. */
export const hairline = `1px solid ${T.surface.line}`;

/** The card recipe, since it was being retyped in ~40 places. */
export const cardStyle = {
  background: T.surface.card,
  border: hairline,
  borderRadius: T.radius.lg,
  boxShadow: T.shadow.card,
} as const;
