interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

export function VoidLeaderboardIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
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
      {/* Outer portal ring */}
      <circle cx="10" cy="10" r="8.8" stroke={color} strokeWidth="1.1" opacity={active ? 1 : 0.55} />
      {/* Inner depth ring */}
      <circle cx="10" cy="10" r="6.8" stroke={color} strokeWidth="0.5" opacity={active ? 0.38 : 0.16} />
      {/* Cardinal tick marks */}
      <line x1="10" y1="0.8"  x2="10" y2="2.4"  stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="10" y1="17.6" x2="10" y2="19.2" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="0.8"  y1="10" x2="2.4"  y2="10" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />
      <line x1="17.6" y1="10" x2="19.2" y2="10" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity={active ? 0.9 : 0.28} />

      {/* ── Medal 🥇 ── */}

      {/* Ribbon — left stripe */}
      <line x1="8.8" y1="3" x2="8.8" y2="8"
        stroke={color} strokeWidth="1.9" strokeLinecap="round"
        opacity={active ? 0.68 : 0.38} />
      {/* Ribbon — right stripe */}
      <line x1="11.2" y1="3" x2="11.2" y2="8"
        stroke={color} strokeWidth="1.9" strokeLinecap="round"
        opacity={active ? 0.68 : 0.38} />
      {/* Clasp connecting ribbon to medal */}
      <rect x="8.2" y="7.6" width="3.6" height="1.0" rx="0.4"
        fill={color} opacity={active ? 0.52 : 0.26} />

      {/* Medal outer circle */}
      <circle cx="10" cy="12.5" r="4"
        stroke={color} strokeWidth="1.1" fill="none"
        opacity={active ? 0.95 : 0.58} />
      {/* Medal inner depth ring */}
      <circle cx="10" cy="12.5" r="2.6"
        stroke={color} strokeWidth="0.45" fill="none"
        opacity={active ? 0.42 : 0.18} />

      {/* "1" numeral */}
      {/* Vertical stroke */}
      <line x1="10" y1="10.9" x2="10" y2="14.1"
        stroke={color} strokeWidth="1.45" strokeLinecap="round"
        opacity={active ? 1 : 0.68} />
      {/* Approach stroke (top-left to top of "1") */}
      <line x1="9.1" y1="11.5" x2="10" y2="10.9"
        stroke={color} strokeWidth="1.0" strokeLinecap="round"
        opacity={active ? 0.85 : 0.48} />
      {/* Base underline */}
      <line x1="8.8" y1="14.1" x2="11.2" y2="14.1"
        stroke={color} strokeWidth="0.9" strokeLinecap="round"
        opacity={active ? 0.78 : 0.44} />

      {/* Active accent dots */}
      {active && (
        <>
          <circle cx="10" cy="1.6"  r="0.6" fill={color} opacity="0.85" />
          <circle cx="10" cy="18.4" r="0.6" fill={color} opacity="0.85" />
        </>
      )}
    </svg>
  );
}
