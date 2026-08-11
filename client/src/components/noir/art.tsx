// ── ნუარი — animated backdrops ────────────────────────────────────────
// Eight hand-built SVG set pieces. No stock art, no emoji: silhouettes, light
// cones and weather, in the same spirit as the Merge Evolution organisms.
//
// PERFORMANCE
// Everything moves via CSS transforms/opacity on grouped elements, never via
// per-frame JS and never one animation per particle: rain is two <g> groups
// sliding on a loop, not forty independent lines. That keeps a full-screen
// animated scene at compositor cost while the player reads text over it.
//
// DETERMINISM
// Particle positions come from a seeded PRNG memoised per backdrop, so a
// re-render (every keystroke of the typewriter) never reshuffles the scene.
import { memo, useMemo } from 'react';
import type { Backdrop } from './types';

/** Tiny deterministic PRNG — same seed, same city, every render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;

/** Shared keyframes. Injected once per scene rather than per element. */
const KEYFRAMES = `
@keyframes nr-fall   { from { transform: translateY(-50%); } to { transform: translateY(0%); } }
@keyframes nr-drift  { from { transform: translateX(-12%); } to { transform: translateX(12%); } }
@keyframes nr-sweep  { from { transform: translateX(-40%); } to { transform: translateX(140%); } }
@keyframes nr-spin   { from { transform: rotate(0deg); }    to { transform: rotate(360deg); } }
@keyframes nr-swing  { 0%,100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
@keyframes nr-flick  { 0%,92%,100% { opacity: 1; } 94% { opacity: .35; } 96% { opacity: .9; } 98% { opacity: .5; } }
@keyframes nr-pulse  { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes nr-rise   { from { transform: translateY(6%); opacity: 0; } 40% { opacity: .5; } to { transform: translateY(-14%); opacity: 0; } }
@keyframes nr-shimmer{ 0%,100% { opacity: .25; transform: scaleY(1); } 50% { opacity: .55; transform: scaleY(1.12); } }
@media (prefers-reduced-motion: reduce) {
  .nr-anim { animation: none !important; }
}
`;

/** Colour identity per location — the whole mood in three stops. */
const PALETTE: Record<Backdrop, { sky: [string, string]; key: string; fill: string }> = {
  rain_street:    { sky: ['#0a1020', '#05070f'], key: '#ff2d55', fill: '#050710' },
  bar:            { sky: ['#2a1608', '#0d0805'], key: '#ffb020', fill: '#0d0805' },
  office:         { sky: ['#141020', '#07050c'], key: '#ffd58a', fill: '#07050c' },
  docks:          { sky: ['#081824', '#03080e'], key: '#4dd4c4', fill: '#03080e' },
  car:            { sky: ['#060a16', '#03050c'], key: '#8fb3ff', fill: '#03050c' },
  alley:          { sky: ['#0b0e14', '#04050a'], key: '#ffd45a', fill: '#04050a' },
  room:           { sky: ['#0e1018', '#05060b'], key: '#9fb0c8', fill: '#05060b' },
  interrogation:  { sky: ['#101418', '#06080a'], key: '#eaf2ff', fill: '#06080a' },
};

/** How a picked choice punches the scene. */
export type Beat = 'calm' | 'tense' | 'violent' | 'clever';

export const NoirBackdrop = memo(function NoirBackdrop({
  kind, height = 210,
}: { kind: Backdrop; height?: number }) {
  const pal = PALETTE[kind];
  const ids = useMemo(() => ({
    sky: nid('nrsky'), key: nid('nrkey'), cone: nid('nrcone'),
    fade: nid('nrfade'), glow: nid('nrglow'),
  }), []);

  // Seeded per backdrop so each location has its own stable scatter.
  const seed = useMemo(() => {
    const r = rng([...kind].reduce((n, c) => n + c.charCodeAt(0), 7));
    return { r, vals: Array.from({ length: 64 }, () => r()) };
  }, [kind]);

  return (
    <svg viewBox="0 0 400 210" width="100%" height={height} preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }} aria-hidden="true">
      <style>{KEYFRAMES}</style>
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.sky[0]} />
          <stop offset="100%" stopColor={pal.sky[1]} />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0%" stopColor={pal.key} stopOpacity="0.55" />
          <stop offset="100%" stopColor={pal.key} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ids.cone} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.key} stopOpacity="0.34" />
          <stop offset="100%" stopColor={pal.key} stopOpacity="0" />
        </linearGradient>
        {/* Bottom fade so the text panel below never fights the artwork. */}
        <linearGradient id={ids.fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stopColor={pal.fill} stopOpacity="0" />
          <stop offset="100%" stopColor={pal.fill} stopOpacity="0.95" />
        </linearGradient>
      </defs>

      <rect width="400" height="210" fill={`url(#${ids.sky})`} />
      <Scene kind={kind} pal={pal} ids={ids} vals={seed.vals} />
      <rect width="400" height="210" fill={`url(#${ids.fade})`} />
    </svg>
  );
});

interface SceneProps {
  kind: Backdrop;
  pal: { sky: [string, string]; key: string; fill: string };
  ids: Record<string, string>;
  vals: number[];
}

function Scene({ kind, pal, ids, vals }: SceneProps) {
  switch (kind) {
    // ── a wet street under a neon sign ──
    case 'rain_street': return (
      <>
        {/* skyline: two silhouette bands for depth */}
        <path d="M0 132 h34 v-40 h26 v26 h30 v-52 h40 v44 h28 v-30 h34 v38 h30 v-22 h44 v34 h32 v-18 h38 v50 H0z"
          fill="#0a0e1a" opacity="0.95" />
        <path d="M0 148 h46 v-26 h32 v18 h40 v-32 h36 v28 h44 v-16 h40 v24 h46 v-20 h40 v46 H0z"
          fill="#070a12" />
        {/* neon sign + its bleed onto the wet road */}
        <ellipse cx="300" cy="118" rx="72" ry="44" fill={`url(#${ids.glow})`} className="nr-anim"
          style={{ animation: 'nr-pulse 3.6s ease-in-out infinite' }} />
        <rect x="276" y="104" width="48" height="7" rx="3" fill={pal.key} opacity="0.9" className="nr-anim"
          style={{ animation: 'nr-flick 5s linear infinite' }} />
        <Rain vals={vals} />
        {/* road + reflected smear of the sign */}
        <rect y="168" width="400" height="42" fill="#04060c" />
        <ellipse cx="300" cy="180" rx="46" ry="8" fill={pal.key} opacity="0.18" className="nr-anim"
          style={{ animation: 'nr-shimmer 2.8s ease-in-out infinite' }} />
      </>
    );

    // ── smoke, bottles and a slow ceiling fan ──
    case 'bar': return (
      <>
        <rect y="118" width="400" height="92" fill="#0f0906" />
        {/* back-bar bottles */}
        {vals.slice(0, 16).map((v, i) => (
          <rect key={i} x={22 + i * 23} y={96 - v * 26} width="7" height={26 + v * 26} rx="3"
            fill={i % 3 === 0 ? '#3a2410' : '#241608'} opacity="0.9" />
        ))}
        <rect y="118" width="400" height="5" fill="#4a2f14" opacity="0.8" />
        {/* hanging lamp + its cone */}
        <line x1="200" y1="0" x2="200" y2="30" stroke="#2a1c0e" strokeWidth="2" />
        <ellipse cx="200" cy="34" rx="16" ry="7" fill="#3a2610" />
        <path d="M184 36 L128 210 H272 L216 36 Z" fill={`url(#${ids.cone})`} />
        {/* ceiling fan seen edge-on, turning slowly */}
        <g style={{ transformOrigin: '80px 26px', animation: 'nr-spin 9s linear infinite' }} className="nr-anim">
          <ellipse cx="80" cy="26" rx="34" ry="4" fill="#1a1008" opacity="0.85" />
        </g>
        <Smoke vals={vals} tint="#c8a06a" />
      </>
    );

    // ── one desk lamp, dust, and blinds ──
    case 'office': return (
      <>
        {/* blind slats across the back wall */}
        {Array.from({ length: 11 }, (_, i) => (
          <rect key={i} y={10 + i * 13} width="400" height="5" fill={pal.key} opacity="0.06" />
        ))}
        {/* desk */}
        <rect y="158" width="400" height="52" fill="#0b0810" />
        <rect y="156" width="400" height="4" fill="#1d1626" />
        {/* lamp: shade, bulb glow, cone falling on the desk */}
        <path d="M232 62 h56 l14 26 h-84 z" fill="#171122" />
        <ellipse cx="260" cy="92" rx="16" ry="6" fill={pal.key} opacity="0.85" className="nr-anim"
          style={{ animation: 'nr-pulse 5s ease-in-out infinite' }} />
        <path d="M244 92 L196 158 H324 L276 92 Z" fill={`url(#${ids.cone})`} />
        <ellipse cx="260" cy="158" rx="70" ry="11" fill={pal.key} opacity="0.16" />
        <Dust vals={vals} tint={pal.key} />
      </>
    );

    // ── cranes, fog banks, black water ──
    case 'docks': return (
      <>
        {/* crane silhouettes */}
        {[40, 150, 268, 350].map((x, i) => (
          <g key={x} opacity={0.85 - i * 0.12}>
            <rect x={x} y={44 + i * 8} width="4" height={92 - i * 8} fill="#0a1a22" />
            <rect x={x - 30} y={44 + i * 8} width="74" height="4" fill="#0a1a22" />
            <line x1={x + 26} y1={48 + i * 8} x2={x + 26} y2={72 + i * 8} stroke="#0a1a22" strokeWidth="2" />
          </g>
        ))}
        {/* a light on the far mole, blinking */}
        <circle cx="366" cy="52" r="3" fill={pal.key} className="nr-anim"
          style={{ animation: 'nr-pulse 2.2s ease-in-out infinite' }} />
        {/* water */}
        <rect y="140" width="400" height="70" fill="#020a10" />
        {vals.slice(20, 30).map((v, i) => (
          <rect key={i} x={v * 380} y={150 + i * 6} width={26 + v * 40} height="1.5" rx="1"
            fill={pal.key} opacity="0.16" className="nr-anim"
            style={{ animation: `nr-shimmer ${2.4 + v * 2}s ease-in-out ${v * 2}s infinite` }} />
        ))}
        <Fog vals={vals} />
      </>
    );

    // ── inside a moving car ──
    // Rebuilt: the first version was a dark box. Everything that says "moving
    // car" — a receding road, a horizon, the hood — has to be legible when the
    // sweeping lights happen to be off-screen mid-animation.
    case 'car': return (
      <>
        {/* what's beyond the glass: horizon, road narrowing to a vanishing point */}
        <rect y="86" width="400" height="42" fill="#0a1020" />
        <path d="M150 128 L196 86 L212 86 L262 128 Z" fill="#0d1424" />
        <path d="M96 158 L192 86 L216 86 L318 158 Z" fill="#080d18" />
        {/* centre line, dashes shrinking with distance */}
        {[[200, 92, 3, 4], [200, 102, 4, 6], [199, 116, 6, 9], [198, 136, 9, 14]].map(([x, y, w, h], i) => (
          <rect key={i} x={x - w / 2} y={y} width={w} height={h} rx="1" fill="#8fb3ff" opacity="0.16" />
        ))}
        {/* distant tail lights, and street lamps standing still at the roadside */}
        <circle cx="192" cy="94" r="2" fill="#ff2d55" opacity="0.5" />
        <circle cx="208" cy="94" r="2" fill="#ff2d55" opacity="0.5" />
        {[[132, 104], [96, 116], [40, 136], [268, 104], [304, 116], [360, 136]].map(([x, y], i) => (
          <g key={i} opacity="0.5">
            <rect x={x} y={y - 26} width="1.5" height="26" fill="#141c2c" />
            <circle cx={x + 0.75} cy={y - 27} r="2.2" fill={pal.key} opacity="0.7" />
          </g>
        ))}
        {/* lights sweeping past — three offset groups read as continuous traffic */}
        {[0, 1, 2].map(i => (
          <g key={i} className="nr-anim" style={{ animation: `nr-sweep ${2.6 + i * 0.9}s linear ${i * 0.8}s infinite` }}>
            <ellipse cx="0" cy={98 + i * 16} rx="30" ry="8" fill={pal.key} opacity={0.16 - i * 0.035} />
          </g>
        ))}
        <RainOnGlass vals={vals} />
        {/* cabin: roof, A-pillars and mirror press in around the glass */}
        <path d="M0 0 h400 v40 q-200 30 -400 0 z" fill="#04060c" />
        <path d="M0 0 v210 h48 q-16 -118 0 -210 z" fill="#04060c" />
        <path d="M400 0 v210 h-48 q16 -118 0 -210 z" fill="#04060c" />
        <rect x="176" y="34" width="48" height="13" rx="4" fill="#070a12" />
        {/* hood, then dashboard with its instrument glow */}
        <path d="M48 172 q152 -26 304 0 v38 H48 z" fill="#060911" />
        <path d="M0 186 q200 -20 400 0 v24 H0 z" fill="#03050a" />
        <ellipse cx="130" cy="192" rx="18" ry="6" fill={pal.key} opacity="0.22" className="nr-anim"
          style={{ animation: 'nr-pulse 4s ease-in-out infinite' }} />
        <ellipse cx="176" cy="194" rx="10" ry="4" fill="#ff2d55" opacity="0.18" />
      </>
    );

    // ── one lamp, wet brick, steam ──
    case 'alley': return (
      <>
        {/* converging walls */}
        <path d="M0 0 h128 L150 210 H0 z" fill="#0a0c12" />
        <path d="M400 0 h-128 L250 210 H400 z" fill="#0a0c12" />
        {/* brick courses, faintly */}
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i} opacity="0.5">
            <rect y={16 + i * 22} width="126" height="1" fill="#141822" />
            <rect x="274" y={16 + i * 22} width="126" height="1" fill="#141822" />
          </g>
        ))}
        {/* the lamp, flickering, and its cone */}
        <rect x="126" y="42" width="18" height="4" fill="#1a1e28" />
        <circle cx="146" cy="48" r="5" fill={pal.key} className="nr-anim"
          style={{ animation: 'nr-flick 4.2s linear infinite' }} />
        <path d="M132 52 L96 210 H208 L160 52 Z" fill={`url(#${ids.cone})`} className="nr-anim"
          style={{ animation: 'nr-flick 4.2s linear infinite' }} />
        {/* puddle catching it */}
        <ellipse cx="156" cy="196" rx="44" ry="8" fill={pal.key} opacity="0.14" className="nr-anim"
          style={{ animation: 'nr-shimmer 3.2s ease-in-out infinite' }} />
        <Smoke vals={vals} tint="#8a97ad" />
      </>
    );

    // ── a cramped room, blinds slicing the light ──
    case 'room': return (
      <>
        <rect y="150" width="400" height="60" fill="#070810" />
        {/* window */}
        <rect x="228" y="24" width="132" height="104" rx="3" fill="#121826" />
        <rect x="228" y="24" width="132" height="104" rx="3" fill="none" stroke="#1e2636" strokeWidth="2" />
        <line x1="294" y1="24" x2="294" y2="128" stroke="#1e2636" strokeWidth="2" />
        {/* blind slats over the glass */}
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="228" y={28 + i * 13} width="132" height="6" fill="#0b0f18" opacity="0.9" />
        ))}
        {/* the light those slats throw across the floor */}
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M228 ${34 + i * 13} L120 ${168 + i * 5} L166 ${172 + i * 5} L360 ${38 + i * 13} z`}
            fill={pal.key} opacity="0.045" />
        ))}
        <Dust vals={vals} tint={pal.key} />
      </>
    );

    // ── a bulb, a table, and a mirror that is not a mirror ──
    case 'interrogation': return (
      <>
        {/* the one-way glass */}
        <rect x="24" y="34" width="130" height="76" rx="2" fill="#0c1014" stroke="#182028" strokeWidth="2" />
        <rect x="24" y="34" width="130" height="76" rx="2" fill={pal.key} opacity="0.03" />
        {/* bulb on a flex, swinging — the cone swings with it */}
        <g style={{ transformOrigin: '270px 0px', animation: 'nr-swing 4.4s ease-in-out infinite' }} className="nr-anim">
          <line x1="270" y1="0" x2="270" y2="46" stroke="#141a20" strokeWidth="2" />
          <circle cx="270" cy="52" r="7" fill={pal.key} opacity="0.95" />
          <ellipse cx="270" cy="52" rx="30" ry="24" fill={`url(#${ids.glow})`} />
          <path d="M256 56 L206 190 H334 L284 56 Z" fill={`url(#${ids.cone})`} />
        </g>
        {/* table */}
        <rect y="176" width="400" height="34" fill="#0a0d11" />
        <rect y="174" width="400" height="3" fill="#1a2129" />
        <ellipse cx="270" cy="178" rx="66" ry="9" fill={pal.key} opacity="0.14" />
        <Dust vals={vals} tint={pal.key} />
      </>
    );
  }
}

// ── weather / atmosphere primitives ───────────────────────────────────
// Each is ONE animated group holding many static children, so a hundred
// raindrops cost a single compositor animation.

function Rain({ vals }: { vals: number[] }) {
  const drops = vals.slice(0, 34);
  return (
    <>
      {[0, 1].map(layer => (
        <g key={layer} className="nr-anim"
          style={{ animation: `nr-fall ${layer ? 0.9 : 1.35}s linear infinite` }}
          opacity={layer ? 0.4 : 0.26}>
          {/* drawn twice, stacked, so the loop is seamless */}
          {[0, 1].map(copy => drops.map((v, i) => (
            <line key={`${copy}-${i}`}
              x1={v * 400} y1={copy * 210 - 210 + (i * 13) % 210}
              x2={v * 400 - 4} y2={copy * 210 - 210 + (i * 13) % 210 + (layer ? 16 : 11)}
              stroke="#9fc4ff" strokeWidth={layer ? 1.1 : 0.7} strokeLinecap="round" />
          )))}
        </g>
      ))}
    </>
  );
}

function RainOnGlass({ vals }: { vals: number[] }) {
  return (
    <g opacity="0.3">
      {vals.slice(30, 52).map((v, i) => (
        <circle key={i} cx={40 + v * 320} cy={20 + ((i * 29) % 140)} r={0.8 + v * 1.6}
          fill="#9fc4ff" className="nr-anim"
          style={{ animation: `nr-pulse ${2 + v * 3}s ease-in-out ${v * 2}s infinite` }} />
      ))}
    </g>
  );
}

function Smoke({ vals, tint }: { vals: number[]; tint: string }) {
  // Small and faint on purpose. The first pass used 40-86px blobs at 16% and
  // they read as grey clouds parked in front of the set, hiding the bottles
  // behind the bar. Smoke should be something you notice second, not first.
  return (
    // Flat and wide, not round: at ry 5-10 these still read as discrete grey
    // blobs floating in front of the set. Haze lies in strata.
    <g opacity="0.055">
      {vals.slice(8, 16).map((v, i) => (
        <ellipse key={i} cx={50 + v * 300} cy={48 + v * 80} rx={34 + v * 46} ry={2 + v * 2.5}
          fill={tint} className="nr-anim"
          style={{ animation: `nr-drift ${10 + v * 9}s ease-in-out ${v * 5}s infinite alternate` }} />
      ))}
    </g>
  );
}

function Fog({ vals }: { vals: number[] }) {
  return (
    // Thin horizontal banks that sit BELOW the crane tops — the first version
    // was tall enough to erase the skyline it was supposed to sit in front of.
    <g opacity="0.13">
      {vals.slice(2, 8).map((v, i) => (
        <ellipse key={i} cx={v * 400} cy={132 + i * 11} rx={90 + v * 70} ry={4 + v * 3}
          fill="#cfe6ee" className="nr-anim"
          style={{ animation: `nr-drift ${13 + v * 10}s ease-in-out ${v * 5}s infinite alternate` }} />
      ))}
    </g>
  );
}

function Dust({ vals, tint }: { vals: number[]; tint: string }) {
  return (
    <g opacity="0.5">
      {vals.slice(12, 34).map((v, i) => (
        <circle key={i} cx={60 + v * 300} cy={40 + ((i * 37) % 150)} r={0.7 + v}
          fill={tint} opacity="0.4" className="nr-anim"
          style={{ animation: `nr-rise ${7 + v * 9}s linear ${v * 7}s infinite` }} />
      ))}
    </g>
  );
}

/** Full-bleed colour wash used as feedback when a choice lands. */
export const BEAT_FLASH: Record<Beat, string> = {
  calm: 'rgba(120,180,255,0.10)',
  tense: 'rgba(255,180,60,0.16)',
  violent: 'rgba(255,45,85,0.26)',
  clever: 'rgba(160,120,255,0.18)',
};
