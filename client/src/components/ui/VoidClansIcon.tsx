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

      {/* Shield outer frame */}
      <path
        d="M10 4.5L15 7.5V13C15 15.2 10 16.5 10 16.5C10 16.5 5 15.2 5 13V7.5L10 4.5Z"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
        opacity={active ? 0.85 : 0.5}
      />
      {/* Shield inner depth line */}
      <path
        d="M10 6.2L13.5 8.5V12.5C13.5 14.1 10 15 10 15C10 15 6.5 14.1 6.5 12.5V8.5L10 6.2Z"
        stroke={color}
        strokeWidth="0.45"
        strokeLinejoin="round"
        fill="none"
        opacity={active ? 0.38 : 0.15}
      />

      {/* Bold V — Void / Victory */}
      <path
        d="M7.5 8.5L10 12.8L12.5 8.5"
        stroke={color}
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Node at V apex — targeting reticle */}
      <circle cx="10" cy="12.8" r="0.9" fill={color} opacity={active ? 1 : 0.7} />

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
