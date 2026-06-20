interface Props {
  size?: number;
  active?: boolean;
  color?: string;
}

// Clean minimal game controller — no portal ring
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
      {/* Controller body + grip handles */}
      <path
        d="M6.6 5 H13.4 C14.2 5 15.5 6 15.5 7.2 V12.3 C15.5 13.4 14.8 13.8 14.1 13.8 H12.1 V16 H7.9 V13.8 H5.9 C5.2 13.8 4.5 13.4 4.5 12.3 V7.2 C4.5 6 5.4 5 6.6 5 Z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity={active ? 0.9 : 0.55}
      />

      {/* D-pad — horizontal */}
      <line
        x1="6.2" y1="9.8" x2="8.9" y2="9.8"
        stroke={color} strokeWidth="0.95" strokeLinecap="round"
        opacity={active ? 0.95 : 0.65}
      />
      {/* D-pad — vertical */}
      <line
        x1="7.55" y1="8.45" x2="7.55" y2="11.15"
        stroke={color} strokeWidth="0.95" strokeLinecap="round"
        opacity={active ? 0.95 : 0.65}
      />

      {/* Face buttons — triangle of 3 */}
      <circle cx="12.8" cy="7.9"  r="0.72" fill={color} opacity={active ? 0.9 : 0.6} />
      <circle cx="13.9" cy="9.4"  r="0.72" fill={color} opacity={active ? 0.9 : 0.6} />
      <circle cx="12.8" cy="10.9" r="0.72" fill={color} opacity={active ? 0.9 : 0.6} />

      {/* Select / start dots */}
      <circle cx="9.5"  cy="7.5" r="0.45" fill={color} opacity={active ? 0.55 : 0.28} />
      <circle cx="10.7" cy="7.5" r="0.45" fill={color} opacity={active ? 0.55 : 0.28} />
    </svg>
  );
}
