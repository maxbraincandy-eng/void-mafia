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
      {/* ── Medal 🥇 ── */}

      {/* Ribbon — left stripe */}
      <line x1="8.8" y1="2.5" x2="8.8" y2="8.5"
        stroke={color} strokeWidth="2.0" strokeLinecap="round"
        opacity={active ? 0.72 : 0.42} />
      {/* Ribbon — right stripe */}
      <line x1="11.2" y1="2.5" x2="11.2" y2="8.5"
        stroke={color} strokeWidth="2.0" strokeLinecap="round"
        opacity={active ? 0.72 : 0.42} />
      {/* Clasp bar */}
      <rect x="8" y="7.8" width="4" height="1.2" rx="0.45"
        fill={color} opacity={active ? 0.55 : 0.28} />

      {/* Medal outer circle */}
      <circle cx="10" cy="13.5" r="4.5"
        stroke={color} strokeWidth="1.2" fill="none"
        opacity={active ? 0.95 : 0.58} />
      {/* Medal inner depth ring */}
      <circle cx="10" cy="13.5" r="2.9"
        stroke={color} strokeWidth="0.45" fill="none"
        opacity={active ? 0.42 : 0.17} />

      {/* "1" numeral inside medal */}
      {/* Vertical stroke */}
      <line x1="10" y1="11.7" x2="10" y2="15.3"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
        opacity={active ? 1 : 0.7} />
      {/* Approach stroke top-left */}
      <line x1="9.1" y1="12.4" x2="10" y2="11.7"
        stroke={color} strokeWidth="1.05" strokeLinecap="round"
        opacity={active ? 0.88 : 0.5} />
      {/* Base underline */}
      <line x1="8.7" y1="15.3" x2="11.3" y2="15.3"
        stroke={color} strokeWidth="0.9" strokeLinecap="round"
        opacity={active ? 0.8 : 0.45} />
    </svg>
  );
}
