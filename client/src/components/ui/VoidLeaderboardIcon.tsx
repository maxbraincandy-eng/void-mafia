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

      {/* Podium base line */}
      <line x1="4.5" y1="15" x2="15.5" y2="15" stroke={color} strokeWidth="0.65" strokeLinecap="round" opacity={active ? 0.45 : 0.2} />

      {/* Rank 2 — left bar */}
      <rect x="4.5" y="10.5" width="3" height="4.5" rx="0.4" fill={color} opacity={active ? 0.62 : 0.32} />
      {/* Rank 1 — center bar (tallest) */}
      <rect x="8.5" y="7"    width="3" height="8"   rx="0.4" fill={color} opacity={active ? 0.9 : 0.55} />
      {/* Rank 3 — right bar */}
      <rect x="12.5" y="12" width="3" height="3"   rx="0.4" fill={color} opacity={active ? 0.5 : 0.26} />

      {/* Crown above rank 1 */}
      <path
        d="M8.5 7L9.3 5.2L10 6.5L10.7 5.2L11.5 7"
        stroke={color}
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={active ? 1 : 0.58}
      />

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
