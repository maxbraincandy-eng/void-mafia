/**
 * Hermes glyph — a winged caduceus (Hermes/Mercury's staff), the messenger-god
 * motif, in the app's cyan→violet gradient. Replaces the placeholder robot.
 */
export function HermesGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="hermesGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00f5ff" />
          <stop offset="1" stopColor="#9b00ff" />
        </linearGradient>
      </defs>
      {/* wings */}
      <path d="M11.4 8.2C8.3 5.9 4.9 5.7 2.4 7.4c3.2-.1 6 1 8.6 2.6" stroke="url(#hermesGrad)" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 8.2C15.7 5.9 19.1 5.7 21.6 7.4c-3.2-.1-6 1-8.6 2.6" stroke="url(#hermesGrad)" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.6 6.1C9.4 4.6 6.7 4.5 4.7 5.6" stroke="url(#hermesGrad)" strokeWidth="1.05" strokeLinecap="round" opacity="0.55" />
      <path d="M12.4 6.1C14.6 4.6 17.3 4.5 19.3 5.6" stroke="url(#hermesGrad)" strokeWidth="1.05" strokeLinecap="round" opacity="0.55" />
      {/* orb finial */}
      <circle cx="12" cy="7.6" r="1.9" fill="url(#hermesGrad)" />
      {/* staff */}
      <line x1="12" y1="9.6" x2="12" y2="20.5" stroke="url(#hermesGrad)" strokeWidth="1.7" strokeLinecap="round" />
      {/* entwined serpents */}
      <path d="M12 11.4c2 1 2 3 0 4s-2 3 0 4" stroke="url(#hermesGrad)" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M12 11.4c-2 1-2 3 0 4s2 3 0 4" stroke="url(#hermesGrad)" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}
