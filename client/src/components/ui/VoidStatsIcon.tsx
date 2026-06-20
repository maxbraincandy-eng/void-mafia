interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

// Rising bar chart — stats / leaderboard / top rankings
export function VoidStatsIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
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
      {/* Baseline */}
      <line
        x1="3.5" y1="16.5" x2="16.5" y2="16.5"
        stroke={color} strokeWidth="0.8" strokeLinecap="round"
        opacity={active ? 0.55 : 0.22}
      />

      {/* Bar 1 — shortest (left) */}
      <rect
        x="4" y="11.5" width="3" height="5"
        rx="0.6"
        stroke={color} strokeWidth="1.2"
        opacity={active ? 0.95 : 0.55}
      />

      {/* Bar 2 — medium (center) */}
      <rect
        x="8.5" y="7.5" width="3" height="9"
        rx="0.6"
        stroke={color} strokeWidth="1.2"
        opacity={active ? 0.95 : 0.55}
      />

      {/* Bar 3 — tallest (right) */}
      <rect
        x="13" y="4" width="3" height="12.5"
        rx="0.6"
        stroke={color} strokeWidth="1.2"
        opacity={active ? 0.95 : 0.55}
      />

      {/* Upward arrow tip above bar 3 */}
      <path
        d="M13.5 3 L14.5 1.5 L15.5 3"
        stroke={color} strokeWidth="0.85" strokeLinecap="round" strokeLinejoin="round"
        opacity={active ? 0.8 : 0.3}
      />
    </svg>
  );
}
