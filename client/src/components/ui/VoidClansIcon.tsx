interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

export function VoidClansIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
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

      {/* ── Crossed swords ⚔️ ── */}

      {/* Sword 1: NW tip → SE pommel */}
      <line x1="5.5" y1="5.5" x2="14.5" y2="14.5"
        stroke={color} strokeWidth="1.0" strokeLinecap="round"
        opacity={active ? 0.85 : 0.55} />
      {/* Crossguard 1 — perpendicular at ~30% from tip */}
      <line x1="6.1" y1="8.9" x2="8.9" y2="6.1"
        stroke={color} strokeWidth="1.4" strokeLinecap="round"
        opacity={active ? 1 : 0.68} />
      {/* Pommel 1 — SE */}
      <circle cx="14" cy="14" r="1.1" fill={color} opacity={active ? 0.95 : 0.62} />

      {/* Sword 2: NE tip → SW pommel */}
      <line x1="14.5" y1="5.5" x2="5.5" y2="14.5"
        stroke={color} strokeWidth="1.0" strokeLinecap="round"
        opacity={active ? 0.85 : 0.55} />
      {/* Crossguard 2 — perpendicular at ~30% from tip */}
      <line x1="11.1" y1="6.1" x2="13.9" y2="8.9"
        stroke={color} strokeWidth="1.4" strokeLinecap="round"
        opacity={active ? 1 : 0.68} />
      {/* Pommel 2 — SW */}
      <circle cx="6" cy="14" r="1.1" fill={color} opacity={active ? 0.95 : 0.62} />

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
