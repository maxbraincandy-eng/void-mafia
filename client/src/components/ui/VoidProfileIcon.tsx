interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

// Theatrical neon mask — identity / profile / Mafia persona
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
      {/* Mask face — oval with subtle point at chin */}
      <path
        d="M10 3.5 C7 3.5 4.5 5.8 4.5 9 C4.5 12.2 6.5 15.5 10 16.5 C13.5 15.5 15.5 12.2 15.5 9 C15.5 5.8 13 3.5 10 3.5 Z"
        stroke={color}
        strokeWidth="1.2"
        opacity={active ? 0.95 : 0.55}
      />

      {/* Left eye opening */}
      <ellipse
        cx="7.5" cy="9" rx="1.85" ry="1.2"
        stroke={color} strokeWidth="1.0"
        opacity={active ? 0.9 : 0.6}
      />

      {/* Right eye opening */}
      <ellipse
        cx="12.5" cy="9" rx="1.85" ry="1.2"
        stroke={color} strokeWidth="1.0"
        opacity={active ? 0.9 : 0.6}
      />

      {/* Nose bridge — subtle mask detail */}
      <line
        x1="10" y1="10.5" x2="10" y2="12"
        stroke={color} strokeWidth="0.7" strokeLinecap="round"
        opacity={active ? 0.42 : 0.18}
      />

      {/* Top ornament — small crown gem */}
      <path
        d="M8.8 3.8 L10 2.2 L11.2 3.8"
        stroke={color} strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round"
        opacity={active ? 0.65 : 0.22}
      />
    </svg>
  );
}
