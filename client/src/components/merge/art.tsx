// ── Merge Evolution — art set ─────────────────────────────────────────
// Every mark here is hand-built SVG: no emoji, no icon font, no stock asset.
// The look is a futuristic wet-lab — glass, plasma, DNA and neural tissue —
// so gradients are layered (deep core → hot rim → outer bloom) and everything
// gets a soft glow rather than a flat fill.
//
// `hue` threads the Appearance upgrade through the whole set: buying it shifts
// the organism and its resources together instead of recolouring one sprite.
import { memo } from 'react';

export const HUES = [188, 276, 152, 32, 348, 210, 62, 300] as const;   // cyan, violet, jade, amber, rose, azure, gold, magenta
export const hueOf = (lvl = 0) => HUES[Math.min(HUES.length - 1, Math.max(0, lvl))];
const c = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;

// ── Evolution Core: twelve stages, each a different organism ───────────
// Stages 0–5 are the original lab organisms (cell → ultimate). 6–11 carry the
// progression past the old ceiling and deliberately break silhouette rather
// than just growing: superposed phases, a bodiless swarm, a star, a tesseract
// projection, an accretion disc, and finally a horizon around a dark interior.
export const EvolutionCore = memo(function EvolutionCore({
  stage = 0, hue = 188, size = 240, pulse = 1,
}: { stage?: number; hue?: number; size?: number; pulse?: number }) {
  const g = nid('c'), glow = nid('g'), rim = nid('r');
  const h = hue, h2 = (hue + 40) % 360;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={g} cx="42%" cy="34%">
          <stop offset="0%" stopColor={c(h, 100, 88)} />
          <stop offset="38%" stopColor={c(h, 92, 62)} />
          <stop offset="78%" stopColor={c(h2, 84, 34)} />
          <stop offset="100%" stopColor={c(h2, 76, 16)} />
        </radialGradient>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor={c(h, 100, 70, 0.55)} />
          <stop offset="55%" stopColor={c(h, 100, 60, 0.16)} />
          <stop offset="100%" stopColor={c(h, 100, 60, 0)} />
        </radialGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c(h, 100, 92, 0.95)} />
          <stop offset="100%" stopColor={c(h2, 100, 70, 0.1)} />
        </linearGradient>
      </defs>

      {/* outer bloom — scales with the pulse so the whole thing breathes */}
      <circle cx="100" cy="100" r={96 * pulse} fill={`url(#${glow})`} />

      {stage === 0 && (
        <g>
          <circle cx="100" cy="100" r="42" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="42" fill="none" stroke={`url(#${rim})`} strokeWidth="2.5" />
          <ellipse cx="86" cy="84" rx="14" ry="10" fill={c(h, 100, 95, 0.5)} transform="rotate(-25 86 84)" />
          <circle cx="108" cy="110" r="9" fill={c(h2, 90, 30, 0.85)} />
          <circle cx="108" cy="110" r="9" fill="none" stroke={c(h, 100, 88, 0.6)} strokeWidth="1.2" />
        </g>
      )}

      {stage === 1 && (
        <g>
          <circle cx="100" cy="100" r="52" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="52" fill="none" stroke={`url(#${rim})`} strokeWidth="2.5" />
          {/* organelles */}
          {[[84, 82, 11], [118, 92, 8], [96, 122, 9], [120, 118, 6]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={c(h2, 88, 26, 0.8)} stroke={c(h, 100, 85, 0.5)} strokeWidth="1" />
          ))}
          <ellipse cx="82" cy="78" rx="16" ry="11" fill={c(h, 100, 96, 0.45)} transform="rotate(-25 82 78)" />
        </g>
      )}

      {stage === 2 && (
        <g>
          {/* neural core: a nucleus with radiating axons */}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const x1 = 100 + Math.cos(a) * 34, y1 = 100 + Math.sin(a) * 34;
            const x2 = 100 + Math.cos(a) * 78, y2 = 100 + Math.sin(a) * 78;
            const mx = 100 + Math.cos(a + 0.28) * 58, my = 100 + Math.sin(a + 0.28) * 58;
            return (
              <g key={i}>
                <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={c(h, 95, 66, 0.55)} strokeWidth="2" strokeLinecap="round" />
                <circle cx={x2} cy={y2} r="4" fill={c(h, 100, 82)} />
              </g>
            );
          })}
          <circle cx="100" cy="100" r="36" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="36" fill="none" stroke={`url(#${rim})`} strokeWidth="2.5" />
        </g>
      )}

      {stage === 3 && (
        <g>
          {/* brain network: nodes wired to each other */}
          {(() => {
            const N = 9;
            const pts = Array.from({ length: N }, (_, i) => {
              const a = (i / N) * Math.PI * 2 + 0.3;
              const r = i % 2 ? 68 : 44;
              return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const;
            });
            return (
              <>
                {pts.map(([x, y], i) => pts.slice(i + 1).map(([x2, y2], j) => {
                  const d = Math.hypot(x - x2, y - y2);
                  if (d > 62) return null;
                  return <line key={`${i}-${j}`} x1={x} y1={y} x2={x2} y2={y2} stroke={c(h, 92, 62, 0.32)} strokeWidth="1.4" />;
                }))}
                <circle cx="100" cy="100" r="26" fill={`url(#${g})`} />
                {pts.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r="7" fill={c(h2, 90, 30)} stroke={c(h, 100, 84, 0.8)} strokeWidth="1.4" />
                    <circle cx={x} cy={y} r="2.6" fill={c(h, 100, 92)} />
                  </g>
                ))}
              </>
            );
          })()}
        </g>
      )}

      {stage === 4 && (
        <g>
          {/* digital consciousness: lattice shell around a bright mind */}
          {Array.from({ length: 6 }, (_, i) => (
            <ellipse key={i} cx="100" cy="100" rx="74" ry="30"
              fill="none" stroke={c(h, 95, 68, 0.3)} strokeWidth="1.4"
              transform={`rotate(${i * 30} 100 100)`} />
          ))}
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <circle key={i} cx={100 + Math.cos(a) * 74} cy={100 + Math.sin(a) * 74} r="2.6" fill={c(h, 100, 88)} />;
          })}
          <circle cx="100" cy="100" r="40" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="40" fill="none" stroke={`url(#${rim})`} strokeWidth="2" />
          {/* circuitry across the mind */}
          <path d="M78 100 h14 v-14 h16 v22 h14" fill="none" stroke={c(h, 100, 94, 0.75)} strokeWidth="2" strokeLinecap="round" />
          <path d="M84 116 h20 v10" fill="none" stroke={c(h, 100, 94, 0.5)} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}

      {stage === 5 && (
        <g>
          {/* ultimate: everything at once, haloed */}
          {Array.from({ length: 3 }, (_, k) => (
            <circle key={k} cx="100" cy="100" r={62 + k * 12} fill="none"
              stroke={c((h + k * 24) % 360, 100, 72, 0.34 - k * 0.09)} strokeWidth={2 - k * 0.4}
              strokeDasharray={k ? '6 10' : undefined} />
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x = 100 + Math.cos(a) * 52, y = 100 + Math.sin(a) * 52;
            return (
              <g key={i}>
                <line x1="100" y1="100" x2={x} y2={y} stroke={c(h, 100, 78, 0.4)} strokeWidth="1.6" />
                <circle cx={x} cy={y} r="5.5" fill={c((h + i * 12) % 360, 100, 70)} />
              </g>
            );
          })}
          <circle cx="100" cy="100" r="34" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="34" fill="none" stroke={c(h, 100, 96, 0.9)} strokeWidth="2.5" />
          <circle cx="100" cy="100" r="14" fill={c(h, 100, 97, 0.95)} />
        </g>
      )}

      {stage === 6 && (
        <g>
          {/* Quantum Mind — the same mind in three superposed phases */}
          {[-1, 0, 1].map((k, i) => (
            <g key={i} opacity={k === 0 ? 1 : 0.42} transform={`translate(${k * 11} ${k * -6})`}>
              <circle cx="100" cy="100" r="32" fill={`url(#${g})`} />
              <circle cx="100" cy="100" r="32" fill="none" stroke={c(h, 100, 92, k === 0 ? 0.9 : 0.4)} strokeWidth="1.8" />
            </g>
          ))}
          {/* probability shells */}
          {[46, 60, 74].map((r, i) => (
            <ellipse key={i} cx="100" cy="100" rx={r} ry={r * 0.44} fill="none"
              stroke={c(h, 95, 70, 0.3 - i * 0.06)} strokeWidth="1.4"
              transform={`rotate(${i * 60} 100 100)`} />
          ))}
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2 + 0.5;
            return <circle key={i} cx={100 + Math.cos(a) * 66} cy={100 + Math.sin(a) * 30} r="2.8" fill={c(h, 100, 92)} />;
          })}
        </g>
      )}

      {stage === 7 && (
        <g>
          {/* Collective Intelligence — a swarm of minds, no single body */}
          {(() => {
            const N = 14;
            const pts = Array.from({ length: N }, (_, i) => {
              const a = (i / N) * Math.PI * 2 + 0.2;
              const r = 26 + (i % 3) * 22;
              return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const;
            });
            return (
              <>
                {pts.map(([x, y], i) => pts.slice(i + 1).map(([x2, y2], j) => {
                  if (Math.hypot(x - x2, y - y2) > 40) return null;
                  return <line key={`${i}-${j}`} x1={x} y1={y} x2={x2} y2={y2} stroke={c(h, 92, 66, 0.35)} strokeWidth="1.2" />;
                }))}
                {pts.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r={i % 3 === 0 ? 9 : 6} fill={`url(#${g})`} />
                    <circle cx={x} cy={y} r={i % 3 === 0 ? 9 : 6} fill="none" stroke={c(h, 100, 88, 0.7)} strokeWidth="1.2" />
                  </g>
                ))}
              </>
            );
          })()}
        </g>
      )}

      {stage === 8 && (
        <g>
          {/* Stellar Entity — a star with a corona */}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const len = i % 2 ? 88 : 68;
            return <line key={i} x1={100 + Math.cos(a) * 40} y1={100 + Math.sin(a) * 40}
              x2={100 + Math.cos(a) * len} y2={100 + Math.sin(a) * len}
              stroke={c((h + 20) % 360, 100, 72, i % 2 ? 0.5 : 0.3)} strokeWidth={i % 2 ? 2.4 : 1.4} strokeLinecap="round" />;
          })}
          <circle cx="100" cy="100" r="52" fill={c(h, 100, 62, 0.2)} />
          <circle cx="100" cy="100" r="38" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="38" fill="none" stroke={c(h, 100, 96, 0.9)} strokeWidth="2" />
          <circle cx="100" cy="100" r="18" fill={c(h, 100, 98, 0.95)} />
        </g>
      )}

      {stage === 9 && (
        <g>
          {/* Dimensional Being — a tesseract projection */}
          {[70, 44].map((r, k) => (
            <g key={k} transform={`rotate(${k * 22} 100 100)`}>
              <rect x={100 - r} y={100 - r} width={r * 2} height={r * 2} rx="6"
                fill="none" stroke={c(h, 95, 72, 0.55 - k * 0.15)} strokeWidth="1.8" />
            </g>
          ))}
          {/* struts joining the two cubes */}
          {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy], i) => (
            <line key={i} x1={100 + sx * 70} y1={100 + sy * 70} x2={100 + sx * 41} y2={100 + sy * 41}
              stroke={c(h, 95, 78, 0.4)} strokeWidth="1.4" />
          ))}
          <circle cx="100" cy="100" r="26" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="26" fill="none" stroke={c(h, 100, 94, 0.85)} strokeWidth="2" />
          {[[-70, -70], [70, -70], [70, 70], [-70, 70]].map(([dx, dy], i) => (
            <circle key={i} cx={100 + dx} cy={100 + dy} r="3.4" fill={c(h, 100, 90)} />
          ))}
        </g>
      )}

      {stage === 10 && (
        <g>
          {/* Cosmic Architect — an accretion disc of built structures */}
          <ellipse cx="100" cy="100" rx="88" ry="26" fill="none" stroke={c(h, 95, 66, 0.34)} strokeWidth="7" />
          <ellipse cx="100" cy="100" rx="88" ry="26" fill="none" stroke={c(h, 100, 88, 0.5)} strokeWidth="1.4" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const x = 100 + Math.cos(a) * 88, y = 100 + Math.sin(a) * 26;
            return (
              <g key={i}>
                <rect x={x - 4} y={y - 7} width="8" height="14" rx="2" fill={c((h + i * 14) % 360, 95, 70)} />
                <rect x={x - 1.4} y={y - 12} width="2.8" height="6" fill={c(h, 100, 92)} />
              </g>
            );
          })}
          <circle cx="100" cy="100" r="34" fill={`url(#${g})`} />
          <circle cx="100" cy="100" r="34" fill="none" stroke={c(h, 100, 95, 0.9)} strokeWidth="2.2" />
          {/* polar jets */}
          {[-1, 1].map(s2 => (
            <path key={s2} d={`M100 ${100 + s2 * 34} L96 ${100 + s2 * 86} h8z`} fill={c(h, 100, 88, 0.55)} />
          ))}
        </g>
      )}

      {stage >= 11 && (
        <g>
          {/* Singularity — a dark core, an event horizon, matter falling in */}
          {Array.from({ length: 5 }, (_, k) => (
            <circle key={k} cx="100" cy="100" r={44 + k * 12} fill="none"
              stroke={c((h + k * 12) % 360, 100, 70, 0.3 - k * 0.05)} strokeWidth={1.6}
              strokeDasharray={`${2 + k * 4} ${8 + k * 3}`} />
          ))}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const r0 = 92, r1 = 42;
            const mx = 100 + Math.cos(a + 0.7) * 68, my = 100 + Math.sin(a + 0.7) * 68;
            return <path key={i}
              d={`M${100 + Math.cos(a) * r0} ${100 + Math.sin(a) * r0} Q${mx} ${my} ${100 + Math.cos(a + 1.5) * r1} ${100 + Math.sin(a + 1.5) * r1}`}
              fill="none" stroke={c((h + i * 8) % 360, 100, 76, 0.6)} strokeWidth="2" strokeLinecap="round" />;
          })}
          {/* the horizon itself: bright rim, black interior */}
          <circle cx="100" cy="100" r="40" fill="none" stroke={c(h, 100, 97)} strokeWidth="4" />
          <circle cx="100" cy="100" r="38" fill="#04060c" />
          <circle cx="100" cy="100" r="38" fill="none" stroke={c(h, 100, 90, 0.5)} strokeWidth="1.2" />
        </g>
      )}
    </svg>
  );
});

// ── Resources ─────────────────────────────────────────────────────────
function Frame({ tier, size, children }: { tier: number; size: number; children: React.ReactNode }) {
  const col = ['#6b7280', '#4dd4c4', '#4d9fff', '#a371f7', '#ffb020', '#ff4d6d', '#ffd45a'][Math.min(6, tier)];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`fr${tier}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.5" />
          <stop offset="100%" stopColor={col} stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d="M32 3 58 17v30L32 61 6 47V17z" fill={`url(#fr${tier})`} stroke={col} strokeWidth="1.6" strokeOpacity="0.85" />
      {tier >= 5 && <path d="M32 3 58 17v30L32 61 6 47V17z" fill="none" stroke={col} strokeWidth="3" strokeOpacity="0.28" />}
      {children}
    </svg>
  );
}

/** DNA Fragment — a single broken rung. */
export const DnaFragment = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={1} size={size}>
    <path d="M24 22 Q32 30 24 40" fill="none" stroke="#8fe3ff" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M40 24 Q32 32 40 42" fill="none" stroke="#5ab8e0" strokeWidth="2.6" strokeLinecap="round" />
    <line x1="25" y1="28" x2="38" y2="30" stroke="#cfefff" strokeWidth="2" strokeLinecap="round" />
    <line x1="26" y1="36" x2="39" y2="37" stroke="#cfefff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
  </Frame>
));

/** DNA Cell — the full double helix, coiled. */
export const DnaCell = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={2} size={size}>
    <path d="M23 16 Q41 26 23 36 Q41 46 23 56" fill="none" stroke="#6ff0d8" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M41 16 Q23 26 41 36 Q23 46 41 56" fill="none" stroke="#33c7b0" strokeWidth="2.6" strokeLinecap="round" />
    {[20, 30, 40, 50].map((y, i) => (
      <line key={i} x1="25" y1={y} x2="39" y2={y} stroke="#d6fff6" strokeWidth="1.8" strokeLinecap="round" opacity={0.85 - i * 0.12} />
    ))}
  </Frame>
));

/** Advanced DNA — helix inside a containment ring. */
export const AdvancedDna = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={3} size={size}>
    <circle cx="32" cy="34" r="17" fill="none" stroke="#4d9fff" strokeWidth="1.6" strokeOpacity="0.6" strokeDasharray="4 5" />
    <path d="M26 20 Q40 28 26 36 Q40 44 26 50" fill="none" stroke="#9ecbff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M38 20 Q24 28 38 36 Q24 44 38 50" fill="none" stroke="#4d9fff" strokeWidth="2.4" strokeLinecap="round" />
    {[24, 33, 42].map((y, i) => <circle key={i} cx="32" cy={y} r="2.4" fill="#e6f2ff" />)}
  </Frame>
));

/** Neural Core — dendrites around a bright nucleus. */
export const NeuralCoreIcon = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={4} size={size}>
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return <line key={i} x1={32 + Math.cos(a) * 8} y1={34 + Math.sin(a) * 8}
        x2={32 + Math.cos(a) * 19} y2={34 + Math.sin(a) * 19}
        stroke="#c9a6ff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />;
    })}
    <circle cx="32" cy="34" r="9" fill="#a371f7" />
    <circle cx="32" cy="34" r="9" fill="none" stroke="#e9d5ff" strokeWidth="1.6" />
    <circle cx="29" cy="31" r="2.6" fill="#f6ecff" opacity="0.9" />
  </Frame>
));

/** Neural Particle — a spark with a motion trail. */
export const NeuralParticle = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={3} size={size}>
    <path d="M18 44 Q30 36 44 22" fill="none" stroke="#ffd08a" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    <circle cx="44" cy="22" r="6" fill="#ffb020" />
    <circle cx="44" cy="22" r="10" fill="none" stroke="#ffd08a" strokeWidth="1.4" opacity="0.5" />
    <circle cx="42" cy="20" r="2" fill="#fff3d8" />
    <circle cx="26" cy="39" r="2.4" fill="#ffd08a" opacity="0.7" />
  </Frame>
));

/** Energy Cell — a charged capsule. */
export const EnergyCell = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={2} size={size}>
    <rect x="24" y="19" width="16" height="30" rx="7" fill="#123" stroke="#5ce1a0" strokeWidth="1.8" />
    <rect x="27" y="30" width="10" height="16" rx="4" fill="#5ce1a0" />
    <rect x="27" y="24" width="10" height="4" rx="2" fill="#5ce1a0" opacity="0.45" />
    <path d="M32 22 l-4 8 h4 l-2 7 6-9 h-4z" fill="#d8ffe9" />
  </Frame>
));

/** Evolution Crystal — faceted, the scarce currency. */
export const EvolutionCrystal = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={5} size={size}>
    <path d="M32 14 44 30 32 54 20 30z" fill="#ff6b8a" opacity="0.92" />
    <path d="M32 14 44 30 32 54z" fill="#ffa8bd" opacity="0.75" />
    <path d="M20 30 h24" stroke="#fff0f4" strokeWidth="1.4" opacity="0.8" />
    <path d="M32 14 v40" stroke="#fff0f4" strokeWidth="1.2" opacity="0.55" />
    <circle cx="27" cy="25" r="2.2" fill="#fff" opacity="0.85" />
  </Frame>
));

/** Evolution Upgrade — the stage currency: an ascending sigil. */
export const UpgradeToken = memo(({ size = 44 }: { size?: number }) => (
  <Frame tier={6} size={size}>
    <path d="M32 13 41 27 h-6 l8 14 h-7 l6 12 -18-18 h7 l-8-13 h7z" fill="#ffd45a" />
    <path d="M32 13 41 27 h-6 l8 14" fill="none" stroke="#fff6d8" strokeWidth="1.2" />
    <circle cx="32" cy="34" r="20" fill="none" stroke="#ffd45a" strokeWidth="1.2" opacity="0.4" strokeDasharray="3 6" />
  </Frame>
));

export const RES_ART: Record<string, React.ComponentType<{ size?: number }>> = {
  frag: DnaFragment, cell: DnaCell, adna: AdvancedDna, ncore: NeuralCoreIcon,
  energyCell: EnergyCell, particle: NeuralParticle, crystal: EvolutionCrystal, upgrade: UpgradeToken,
};

// ── Chests ────────────────────────────────────────────────────────────
/** A lab specimen case rather than a fantasy treasure chest. */
export const Chest = memo(function Chest({
  tier = 'common', size = 96, open = 0,
}: { tier?: 'common' | 'advanced' | 'legendary' | 'social'; size?: number; open?: number }) {
  const skin = {
    common: { body: '#3a4356', edge: '#7d8aa3', glow: '#8fb3ff', gem: '#9fb4d8' },
    advanced: { body: '#1f3f52', edge: '#4dd4c4', glow: '#4dd4c4', gem: '#7ff0e0' },
    legendary: { body: '#3a2140', edge: '#ffd45a', glow: '#ffb020', gem: '#ffe9a8' },
    social: { body: '#3d1f33', edge: '#ff6b8a', glow: '#ff4d6d', gem: '#ffc2d1' },
  }[tier];
  const lid = nid('l'), bd = nid('b');
  const lift = open * 26, tilt = open * -34;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={bd} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin.body} />
          <stop offset="100%" stopColor="#0d1018" />
        </linearGradient>
        <radialGradient id={lid}>
          <stop offset="0%" stopColor={skin.glow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={skin.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* light escaping as it opens */}
      {open > 0.02 && <ellipse cx="60" cy="62" rx={46 * open} ry={30 * open} fill={`url(#${lid})`} />}

      {/* base */}
      <path d="M22 62 h76 v30 a8 8 0 0 1 -8 8 H30 a8 8 0 0 1 -8 -8z" fill={`url(#${bd})`} stroke={skin.edge} strokeWidth="2" />
      {/* containment bands */}
      <line x1="42" y1="62" x2="42" y2="100" stroke={skin.edge} strokeWidth="1.4" opacity="0.5" />
      <line x1="78" y1="62" x2="78" y2="100" stroke={skin.edge} strokeWidth="1.4" opacity="0.5" />
      {/* lock gem */}
      <circle cx="60" cy="78" r="8" fill={skin.gem} opacity={1 - open} />
      <circle cx="60" cy="78" r="12" fill="none" stroke={skin.edge} strokeWidth="1.4" opacity={0.7 * (1 - open)} />

      {/* lid — hinges back as `open` grows */}
      <g transform={`translate(0 ${-lift}) rotate(${tilt} 22 62)`}>
        <path d="M22 62 v-14 a38 14 0 0 1 76 0 v14z" fill={`url(#${bd})`} stroke={skin.edge} strokeWidth="2" />
        <path d="M30 52 a30 9 0 0 1 60 0" fill="none" stroke={skin.gem} strokeWidth="1.6" opacity="0.7" />
        {tier === 'legendary' && <path d="M52 44 60 34 68 44 60 50z" fill={skin.gem} />}
        {tier === 'social' && <path d="M60 48 c-6-8 -14-2 -8 4 l8 8 8-8 c6-6 -2-12 -8-4z" fill={skin.gem} />}
        {tier === 'advanced' && <circle cx="60" cy="44" r="5" fill="none" stroke={skin.gem} strokeWidth="2" />}
      </g>
    </svg>
  );
});

/** Small hex badge used on upgrade rows. */
export const UpgradeGlyph = memo(function UpgradeGlyph({ kind, size = 34 }: { kind: string; size?: number }) {
  const col = { energyCap: '#5ce1a0', chestQuality: '#ffd45a', mergeSpeed: '#4dd4c4', rareChance: '#ff6b8a', appearance: '#a371f7' }[kind] ?? '#8fb3ff';
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ display: 'block' }}>
      <path d="M20 2 36 11v18L20 38 4 29V11z" fill={col} fillOpacity="0.14" stroke={col} strokeWidth="1.6" />
      {kind === 'energyCap' && <path d="M21 10 l-6 12 h5 l-3 9 9-13h-5z" fill={col} />}
      {kind === 'chestQuality' && <><path d="M12 24 h16 v7 H12z" fill={col} fillOpacity="0.7" /><path d="M12 24 a8 4 0 0 1 16 0" fill={col} /></>}
      {kind === 'mergeSpeed' && <><path d="M11 20 h11" stroke={col} strokeWidth="2.4" strokeLinecap="round" /><path d="M20 14 26 20 20 26" fill="none" stroke={col} strokeWidth="2.4" strokeLinecap="round" /></>}
      {kind === 'rareChance' && <path d="M20 10 24 18 32 20 24 22 20 30 16 22 8 20 16 18z" fill={col} />}
      {kind === 'appearance' && <><circle cx="20" cy="20" r="7" fill={col} fillOpacity="0.6" /><circle cx="20" cy="20" r="11" fill="none" stroke={col} strokeWidth="1.4" strokeDasharray="3 4" /></>}
    </svg>
  );
});

/** Drifting motes for the lab background — pure decoration, cheap. */
export const LabMotes = memo(function LabMotes({ hue = 188, count = 26 }: { hue?: number; count?: number }) {
  const pts = Array.from({ length: count }, (_, i) => ({
    x: (i * 37) % 100, y: (i * 61) % 100,
    r: 0.6 + ((i * 13) % 20) / 14,
    d: 7 + ((i * 17) % 90) / 9,
    o: 0.18 + ((i * 7) % 40) / 100,
  }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={c(hue, 100, 78, p.o)}>
          <animate attributeName="cy" values={`${p.y};${(p.y + 100 - 12) % 100};${p.y}`} dur={`${p.d}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values={`${p.o};${p.o * 2.2};${p.o}`} dur={`${p.d / 2}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
});
