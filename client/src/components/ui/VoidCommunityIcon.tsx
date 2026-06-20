interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

// Void Crystal ◈ — community / connection / Void world
export function VoidCommunityIcon({ size = 18, active = false, color = 'currentColor' }: Props) {
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
      {/* Outer diamond */}
      <path
        d="M10 1.5 L18.5 10 L10 18.5 L1.5 10 Z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity={active ? 0.95 : 0.55}
      />

      {/* Crystal cross — horizontal facet */}
      <line
        x1="1.5" y1="10" x2="18.5" y2="10"
        stroke={color} strokeWidth="0.45" strokeLinecap="round"
        opacity={active ? 0.55 : 0.2}
      />
      {/* Crystal cross — vertical facet */}
      <line
        x1="10" y1="1.5" x2="10" y2="18.5"
        stroke={color} strokeWidth="0.45" strokeLinecap="round"
        opacity={active ? 0.55 : 0.2}
      />

      {/* Inner diamond — depth ring */}
      <path
        d="M10 5.5 L14.5 10 L10 14.5 L5.5 10 Z"
        stroke={color}
        strokeWidth="0.5"
        strokeLinejoin="round"
        opacity={active ? 0.42 : 0.16}
      />

      {/* Center gem node */}
      <circle cx="10" cy="10" r="1.1" fill={color} opacity={active ? 0.9 : 0.55} />
    </svg>
  );
}
