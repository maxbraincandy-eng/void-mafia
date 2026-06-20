interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

export function VoidGamesIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
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

      {/* Game controller silhouette — body + handle gap */}
      {/* Path: body covers x=6–14, y=7.5–13; handles hang below on left (x=6–8.5) and right (x=11.5–14) */}
      <path
        d="M7.5 7.5H12.5C13.3 7.5 14 8.2 14 9V12.5C14 13.2 13.5 13.5 13 13.5H11.5V15H8.5V13.5H7C6.5 13.5 6 13.2 6 12.5V9C6 8.2 6.7 7.5 7.5 7.5Z"
        stroke={color}
        strokeWidth="0.9"
        fill="none"
        opacity={active ? 0.85 : 0.5}
      />
      {/* D-pad horizontal bar */}
      <line x1="7.2" y1="10.8" x2="9.2" y2="10.8" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity={active ? 0.9 : 0.58} />
      {/* D-pad vertical bar */}
      <line x1="8.2" y1="9.8" x2="8.2" y2="11.8" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity={active ? 0.9 : 0.58} />
      {/* Action buttons — triangle formation */}
      <circle cx="12"   cy="9.5"  r="0.6" fill={color} opacity={active ? 0.9 : 0.55} />
      <circle cx="12.8" cy="10.5" r="0.6" fill={color} opacity={active ? 0.9 : 0.55} />
      <circle cx="12"   cy="11.5" r="0.6" fill={color} opacity={active ? 0.9 : 0.55} />
      {/* Select / start dots */}
      <circle cx="9.5"  cy="9"    r="0.4" fill={color} opacity={active ? 0.55 : 0.28} />
      <circle cx="10.5" cy="9"    r="0.4" fill={color} opacity={active ? 0.55 : 0.28} />

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
