import { DEG, RAD } from './astro';

/**
 * The Milky Way, in the place it actually is.
 *
 * WHY GENERATE IT RATHER THAN SHIP A PHOTOGRAPH
 * ─────────────────────────────────────────────
 * A panorama would be megabytes, and it would have to be warped onto the sky
 * sphere and rotated with it — a lot of machinery for something whose SHAPE is
 * a one-line definition. The Milky Way is the disc of our own galaxy seen from
 * inside it, so on the sky it is simply the plane b = 0 in galactic
 * coordinates, and its brightness falls off with |b| and rises toward the
 * galactic centre. Both of those are formulas.
 *
 * The consequence that matters: this is not decoration placed for effect. Point
 * the phone at Sagittarius in July and the bright part is there, because the
 * galactic centre is there. Point it at Auriga in winter and the faint outer
 * arm is there. It agrees with the real sky because it is derived from the same
 * geometry the real sky is.
 *
 * WHY POINTS AND NOT A TEXTURED BAND
 * ──────────────────────────────────
 * What the eye reads as "the Milky Way" is unresolved starlight — thousands of
 * stars too faint to separate. Drawing it as thousands of faint points is
 * therefore closer to the truth than a smooth band, and it behaves correctly
 * when you zoom: a band would blur, this resolves into more grain.
 */

/** Galactic north pole and the node, J2000. */
const NGP_RA = 192.85948 * DEG;      // 12h 51m 26.28s
const NGP_DEC = 27.12825 * DEG;      // +27° 07' 41.7"
const L_NCP = 122.93192 * DEG;       // galactic longitude of the celestial pole

/** Galactic (l, b) in degrees → equatorial RA (hours) and Dec (degrees), J2000. */
export function galacticToEquatorial(lDeg: number, bDeg: number): { ra: number; dec: number } {
  const l = lDeg * DEG, b = bDeg * DEG;
  const sinDec = Math.sin(b) * Math.sin(NGP_DEC) + Math.cos(b) * Math.cos(NGP_DEC) * Math.cos(L_NCP - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const y = Math.cos(b) * Math.sin(L_NCP - l);
  const x = Math.sin(b) * Math.cos(NGP_DEC) - Math.cos(b) * Math.sin(NGP_DEC) * Math.cos(L_NCP - l);
  let ra = Math.atan2(y, x) + NGP_RA;
  if (ra < 0) ra += 2 * Math.PI;
  if (ra >= 2 * Math.PI) ra -= 2 * Math.PI;
  return { ra: (ra * RAD) / 15, dec: dec * RAD };
}

export interface Grain { ra: number; dec: number; bright: number }

/**
 * Deterministic — the same sky every night rather than a field that reshuffles
 * itself between frames, which is what a fresh Math.random() would give.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * How bright the band is at a given galactic longitude.
 *
 * Brightest toward the centre (l = 0, Sagittarius), a real secondary rise
 * toward Cygnus (l ≈ 80) where we look along the Orion–Cygnus arm, and thinnest
 * toward the anticentre (l = 180, Auriga) where we are looking out of the
 * galaxy. The Great Rift — the dust lane that splits the band from Cygnus to
 * Sagittarius — is the notch near b = 0 over that range, and it is the single
 * most recognisable feature of a dark-sky Milky Way.
 */
function bandBrightness(l: number, b: number): number {
  const centre = Math.exp(-((((l + 180) % 360) - 180) ** 2) / (2 * 55 ** 2));
  const cygnus = 0.55 * Math.exp(-(((l - 80 + 540) % 360 - 180) ** 2) / (2 * 22 ** 2));
  const base = 0.22;
  const along = base + 0.95 * centre + cygnus;

  // Thickness: the disc is thin, and thinner toward the anticentre.
  const scaleHeight = 4.5 + 3.5 * centre;
  const across = Math.exp(-(b * b) / (2 * scaleHeight * scaleHeight));

  // The Great Rift: dust in front of the bulge, roughly l = 350…80, |b| < 5.
  const inRift = ((l + 10 + 360) % 360) < 90;
  const rift = inRift ? 1 - 0.72 * Math.exp(-(b * b) / (2 * 2.6 * 2.6)) : 1;

  return along * across * rift;
}

/**
 * A field of unresolved starlight along the galactic plane.
 *
 * `count` is the number of grains; 3000 reads as a band on a phone without
 * costing more than a few milliseconds to place once at start-up.
 */
export function milkyWayGrains(count = 3000): Grain[] {
  const rand = rng(20260819);
  const out: Grain[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const l = rand() * 360;
    // Sample |b| tightly — most of the light is within a few degrees.
    const b = (rand() + rand() + rand() + rand() - 2) * 9;
    const p = bandBrightness(l, b);
    // Rejection sampling, so the density follows the brightness rather than
    // being uniform with a brightness painted on top.
    if (rand() > p) continue;
    const { ra, dec } = galacticToEquatorial(l, b);
    out.push({ ra, dec, bright: Math.min(1, p * (0.55 + rand() * 0.75)) });
  }
  return out;
}
