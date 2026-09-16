/**
 * The Library of the Void — the room itself.
 *
 * WHY THIS IS NOT THREE.JS
 * ────────────────────────
 * The project already has a real 3D engine and a real city in it, so reaching
 * for one here would have been the easy call. It would also have been the wrong
 * one: this is a backdrop behind a page of text, on a phone, and the thing it
 * has to do is suggest depth — not survive being walked through. An SVG
 * corridor and four drifting gradients cost a few kilobytes and no draw calls,
 * and they never have to load.
 *
 * The room is built the way a one-point perspective drawing is built: a single
 * vanishing point slightly above centre, every shelf line aimed at it, and the
 * uprights spaced so the gaps shrink geometrically. Nothing here is simulated.
 * It is a drawing, and the drawing is enough.
 *
 * WHAT MAKES IT FEEL LARGE
 * ────────────────────────
 * What is NOT drawn. The corridor fades to black well before it would reach
 * the vanishing point, the shelves run past the edge of the screen on both
 * sides, and the darkest part of the image is the middle — where a visitor
 * looks first and is given nothing. Depth here is an absence, not a detail.
 */

import { useMemo } from 'react';

/** Where every line in the room is aimed, as a fraction of the box. */
const VP = { x: 0.5, y: 0.42 };

export function LibraryAtmosphere({ dim = false }: { dim?: boolean }) {
  /*
   * The dust is generated once and never again.
   *
   * Regenerating it on a re-render would make every mote jump the moment a
   * search was typed — the one thing in the room that must not react to the
   * interface.
   */
  const dust = useMemo(() => {
    let s = 0x5eed17;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return Array.from({ length: 34 }, () => ({
      left: rnd() * 100,
      top: rnd() * 100,
      size: 1 + rnd() * 2.2,
      // Slow. Dust in still air does not travel, it hesitates.
      duration: 16 + rnd() * 26,
      delay: -rnd() * 30,
      drift: (rnd() - 0.5) * 34,
      opacity: 0.1 + rnd() * 0.3,
    }));
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ opacity: dim ? 0.35 : 1, transition: 'opacity .6s' }}>

      <style>{`
        @keyframes voidDust {
          0%   { transform: translate3d(0,0,0); }
          100% { transform: translate3d(var(--dx), -34px, 0); }
        }
        @keyframes voidBreath {
          0%,100% { opacity: .5; transform: scale(1); }
          50%     { opacity: .85; transform: scale(1.12); }
        }
        @keyframes voidFog {
          0%   { transform: translate3d(-6%, 0, 0); }
          100% { transform: translate3d(6%, -3%, 0); }
        }
        /* Someone who has asked not to be moved is not moved. */
        @media (prefers-reduced-motion: reduce) {
          .void-anim { animation: none !important; }
        }
      `}</style>

      {/* The far end of the corridor: the only light source in the room. */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(60% 46% at ${VP.x * 100}% ${VP.y * 100}%,
          rgba(56,120,160,0.20) 0%, rgba(38,58,110,0.12) 34%, rgba(6,8,16,0) 72%)`,
      }} />

      <Corridor />

      {/*
        * Fog: two very wide, very soft gradients crossing each other slowly.
        *
        * One would read as a moving object. Two at different speeds read as
        * air, because the eye cannot follow either of them.
        */}
      <div className="absolute void-anim" style={{
        left: '-25%', right: '-25%', top: '8%', height: '58%',
        background: 'radial-gradient(50% 50% at 50% 50%, rgba(90,140,200,0.075), rgba(0,0,0,0) 70%)',
        filter: 'blur(26px)',
        animation: 'voidFog 41s ease-in-out infinite alternate',
      }} />
      <div className="absolute void-anim" style={{
        left: '-30%', right: '-30%', top: '34%', height: '62%',
        background: 'radial-gradient(50% 50% at 50% 50%, rgba(128,92,190,0.065), rgba(0,0,0,0) 70%)',
        filter: 'blur(34px)',
        animation: 'voidFog 67s ease-in-out infinite alternate-reverse',
      }} />

      {/* The light at the vanishing point, breathing. */}
      <div className="absolute void-anim rounded-full" style={{
        left: `${VP.x * 100}%`, top: `${VP.y * 100}%`,
        width: 150, height: 150, marginLeft: -75, marginTop: -75,
        background: 'radial-gradient(50% 50% at 50% 50%, rgba(120,200,235,0.16), rgba(0,0,0,0) 70%)',
        animation: 'voidBreath 11s ease-in-out infinite',
      }} />

      {dust.map((d, i) => (
        <span key={i} className="absolute void-anim rounded-full" style={{
          left: `${d.left}%`, top: `${d.top}%`,
          width: d.size, height: d.size,
          background: 'rgba(190,225,255,0.9)',
          opacity: d.opacity,
          ['--dx' as string]: `${d.drift}px`,
          animation: `voidDust ${d.duration}s linear ${d.delay}s infinite`,
        }} />
      ))}

      {/*
        * The dark, last.
        *
        * Over everything else, so the corridor, the fog and the dust are all
        * swallowed towards the middle rather than each fading on its own. This
        * is the layer that does most of the work: it is what the visitor cannot
        * see that makes the room large.
        */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(74% 62% at ${VP.x * 100}% ${VP.y * 100}%,
          rgba(4,6,12,0) 0%, rgba(4,6,12,0.28) 55%, rgba(4,6,12,0.86) 100%)`,
      }} />
    </div>
  );
}

/**
 * The corridor, in one-point perspective.
 *
 * Drawn in a 100 × 100 viewBox with `preserveAspectRatio="none"` so it stretches
 * to whatever shape the screen is — a corridor that changes proportion with the
 * window is more convincing here than one that letterboxes, because nobody can
 * check the geometry of a room they have never been in.
 */
function Corridor() {
  const { shelves, uprights } = useMemo(() => {
    const vx = VP.x * 100, vy = VP.y * 100;

    /*
     * Shelf lines: from a point on the left and right walls, to the vanishing
     * point. Stopped short of it — a line that actually reaches the vanishing
     * point closes the corridor off, and the corridor must not end.
     */
    /*
     * How far in each line travels before it is gone.
     *
     * This is the number that decides whether the drawing is a corridor or a
     * starburst. At 0.82 every line reached within nine points of the vanishing
     * point, they all met in the middle, and the room became an explosion. At
     * 0.45 the walls stop well short and the centre stays empty — which is
     * where the corridor is, and the only reason it reads as one.
     */
    const stop = 0.45;
    const at = (x: number, y: number) => ({
      x2: x + (vx - x) * stop,
      y2: y + (vy - y) * stop,
      x1: x, y1: y,
    });
    const rows = [-20, -10, -1, 8, 17, 25, 33, 41, 49, 57, 66, 75, 84, 94, 105, 118];
    const shelves = rows.flatMap(y => [at(0, y), at(100, y)]);

    /*
     * Uprights: the vertical divisions between bays, spaced geometrically so
     * they crowd towards the far end. Linear spacing is the giveaway that a
     * perspective drawing was made by a computer that did not mean it.
     */
    const uprights: { x: number; top: number; bottom: number; o: number }[] = [];
    for (let i = 0; i < 5; i++) {
      // Scaled to the same reach as the shelves, or the bays would march on
      // past the end of the wall they divide.
      const t = stop * (1 - Math.pow(0.58, i + 1));
      for (const wall of [0, 100]) {
        const x = wall + (vx - wall) * t;
        uprights.push({
          x,
          top: -20 + (vy - -20) * t,
          bottom: 118 + (vy - 118) * t,
          o: 0.3 * (1 - t / stop),           // fainter the further away
        });
      }
    }
    return { shelves, uprights };
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100"
      preserveAspectRatio="none">
      <defs>
        {/*
          * Every line fades along its own length rather than being clipped.
          * The corridor has to dissolve, not stop.
          */}
        <linearGradient id="voidShelfL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8fc8ea" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7fb4d8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="voidShelfR" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#8fc8ea" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7fb4d8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {shelves.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={`url(#${s.x1 === 0 ? 'voidShelfL' : 'voidShelfR'})`}
          strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
      ))}

      {uprights.map((u, i) => (
        <line key={`u${i}`} x1={u.x} y1={u.top} x2={u.x} y2={u.bottom}
          stroke="#9ed0ef" strokeOpacity={u.o}
          strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
