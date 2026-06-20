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
      {/* Subtle circular frame */}
      <circle cx="10" cy="10" r="8.8" stroke={color} strokeWidth="0.6" opacity={active ? 0.38 : 0.15} />

      {/* ── Crossed swords ⚔️ ── */}

      {/* Sword 1: NW tip (5,5) → SE pommel (15,15) */}
      <line x1="5" y1="5" x2="15" y2="15"
        stroke={color} strokeWidth="1.1" strokeLinecap="round"
        opacity={active ? 0.88 : 0.58} />
      {/* Crossguard 1 — perpendicular at ~30% from tip, centred at (8,8) */}
      <line x1="6.6" y1="9.4" x2="9.4" y2="6.6"
        stroke={color} strokeWidth="1.65" strokeLinecap="round"
        opacity={active ? 1 : 0.72} />
      {/* Pommel 1 — SE */}
      <circle cx="14.5" cy="14.5" r="1.15" fill={color} opacity={active ? 1 : 0.65} />

      {/* Sword 2: NE tip (15,5) → SW pommel (5,15) */}
      <line x1="15" y1="5" x2="5" y2="15"
        stroke={color} strokeWidth="1.1" strokeLinecap="round"
        opacity={active ? 0.88 : 0.58} />
      {/* Crossguard 2 — perpendicular at ~30% from tip, centred at (12,8) */}
      <line x1="10.6" y1="6.6" x2="13.4" y2="9.4"
        stroke={color} strokeWidth="1.65" strokeLinecap="round"
        opacity={active ? 1 : 0.72} />
      {/* Pommel 2 — SW */}
      <circle cx="5.5" cy="14.5" r="1.15" fill={color} opacity={active ? 1 : 0.65} />

      {/* Active: glow dot at crossing point */}
      {active && <circle cx="10" cy="10" r="1.0" fill={color} opacity="0.5" />}
    </svg>
  );
}
