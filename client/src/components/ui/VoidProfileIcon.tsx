interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

/**
 * Void Mafia profile icon — circular portal frame with mafia hat silhouette.
 * Cyberpunk / neon glassmorphism aesthetic. Replaces all ◉ / 👤 profile placeholders.
 */
export function VoidProfileIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        filter: active
          ? `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 9px ${color})`
          : 'none',
        transition: 'filter 0.2s ease',
      }}
    >
      {/* ── Portal outer ring ─────────────────────────────────────────── */}
      <circle
        cx="10" cy="10" r="8.8"
        stroke={color} strokeWidth="1.1"
        opacity={active ? 1 : 0.55}
      />

      {/* ── Inner depth ring ──────────────────────────────────────────── */}
      <circle
        cx="10" cy="10" r="6.8"
        stroke={color} strokeWidth="0.5"
        opacity={active ? 0.38 : 0.16}
      />

      {/* ── Cardinal tick marks (cyberpunk reticle) ───────────────────── */}
      <line x1="10" y1="0.8"  x2="10" y2="2.4"  stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="10" y1="17.6" x2="10" y2="19.2" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="0.8"  y1="10" x2="2.4"  y2="10" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="17.6" y1="10" x2="19.2" y2="10" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />

      {/* ── Mafia top-hat ─────────────────────────────────────────────── */}
      {/* Crown */}
      <rect
        x="7.1" y="3.2" width="5.8" height="4.6" rx="0.5"
        fill={color} opacity={active ? 0.95 : 0.62}
      />
      {/* Hat band stripe */}
      <rect
        x="7.1" y="6.9" width="5.8" height="0.72" rx="0.2"
        fill={color} opacity={active ? 0.28 : 0.14}
      />
      {/* Brim */}
      <rect
        x="4.1" y="7.9" width="11.8" height="1.35" rx="0.45"
        fill={color} opacity={active ? 0.95 : 0.62}
      />

      {/* ── Head silhouette ───────────────────────────────────────────── */}
      <circle
        cx="10" cy="12.3" r="2.45"
        fill={color} opacity={active ? 0.9 : 0.58}
      />

      {/* ── Shoulders (arc clipped naturally by outer circle) ─────────── */}
      <path
        d="M5.4 18.9 Q5.4 15.8 10 15.3 Q14.6 15.8 14.6 18.9"
        fill={color} opacity={active ? 0.85 : 0.52}
      />

      {/* ── Active-only accent dots ───────────────────────────────────── */}
      {active && (
        <>
          <circle cx="10" cy="1.6"  r="0.6" fill={color} opacity="0.85" />
          <circle cx="10" cy="18.4" r="0.6" fill={color} opacity="0.85" />
        </>
      )}
    </svg>
  );
}
