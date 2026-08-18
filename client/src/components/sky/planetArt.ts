/**
 * Planet surfaces, drawn rather than downloaded.
 *
 * Real NASA maps would be several megabytes each and would have to come over
 * the network the first time someone opened this — outdoors, on mobile data, at
 * night. These are generated on a canvas at load: a couple of milliseconds
 * apiece, nothing to fetch, nothing to cache, and they hold up at the size a
 * phone screen gives a planet.
 *
 * They are honest impressions, not photographs: Jupiter gets banding and a red
 * spot, Mars gets rust and ice caps, the Moon gets maria and craters. Anyone
 * comparing against a telescope image will see the difference, and the app says
 * as much where it matters.
 */

export interface Palette { bands: string[]; spot?: string; pole?: string }

const PALETTES: Record<string, Palette> = {
  mercury: { bands: ['#8c8279', '#6f665f', '#a09488', '#7b736b'] },
  venus:   { bands: ['#e8d3a8', '#d8bf8c', '#f0e0bc', '#cbb079'] },
  mars:    { bands: ['#c1502e', '#a8442a', '#d4703f', '#8f3a24'], pole: '#e8e4de' },
  jupiter: { bands: ['#e0cba8', '#c19a6b', '#f0e2c8', '#a9825c', '#dcc39c', '#b08a63'], spot: '#c1553a' },
  saturn:  { bands: ['#e8d9b0', '#d6c191', '#f2e8cb', '#c9b078', '#ddc99e'] },
  uranus:  { bands: ['#a8dbe0', '#8ecfd6', '#bfe6ea', '#7cc4cc'] },
  neptune: { bands: ['#3b6fd4', '#2f5cbb', '#5185e0', '#274ea3'] },
  moon:    { bands: ['#b9b6b0', '#8f8c88', '#c9c6c0', '#a3a09b'] },
  sun:     { bands: ['#fff3b0', '#ffd75e', '#ffe98a', '#ffc93c'] },
};

/** Deterministic noise, so a planet looks the same every time you open it. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * An equirectangular surface map.
 *
 * Bands run in latitude, which is what makes a gas giant read as a gas giant;
 * the rocky bodies get the same machinery with near-identical band colours, so
 * they come out mottled instead of striped.
 */
export function surfaceTexture(id: string, size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size / 2;
  const g = c.getContext('2d')!;
  const pal = PALETTES[id] ?? PALETTES.moon;
  const rand = rng(id.split('').reduce((a, ch) => a + ch.charCodeAt(0) * 7919, 17));
  const gassy = ['jupiter', 'saturn', 'uranus', 'neptune'].includes(id);

  // Base bands.
  const rows = gassy ? 26 : 9;
  for (let i = 0; i < rows; i++) {
    const y0 = (i / rows) * c.height, y1 = ((i + 1) / rows) * c.height;
    g.fillStyle = pal.bands[Math.floor(rand() * pal.bands.length)];
    g.fillRect(0, y0 - 1, c.width, y1 - y0 + 2);
  }

  // Soften the band edges the way turbulence would.
  if (gassy) {
    for (let i = 0; i < 700; i++) {
      const y = rand() * c.height;
      const hgt = 2 + rand() * 9;
      g.globalAlpha = 0.05 + rand() * 0.16;
      g.fillStyle = pal.bands[Math.floor(rand() * pal.bands.length)];
      const w = 40 + rand() * 260;
      g.beginPath();
      g.ellipse(rand() * c.width, y, w, hgt, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else {
    // Rocky worlds: blotches, then craters for the airless ones.
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.05 + rand() * 0.18;
      g.fillStyle = pal.bands[Math.floor(rand() * pal.bands.length)];
      const r = 3 + rand() * 26;
      g.beginPath();
      g.arc(rand() * c.width, rand() * c.height, r, 0, Math.PI * 2);
      g.fill();
    }
    if (id === 'moon' || id === 'mercury') {
      for (let i = 0; i < 260; i++) {
        const x = rand() * c.width, y = rand() * c.height, r = 1.5 + rand() * 9;
        g.globalAlpha = 0.35;
        g.fillStyle = '#5f5c58';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.30;
        g.fillStyle = '#e6e3dd';
        g.beginPath(); g.arc(x - r * 0.22, y - r * 0.22, r * 0.72, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  if (pal.spot) {
    // Jupiter's storm: an oval two bands south of the equator.
    g.globalAlpha = 0.85;
    g.fillStyle = pal.spot;
    g.beginPath();
    g.ellipse(c.width * 0.63, c.height * 0.62, c.width * 0.075, c.height * 0.055, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.35;
    g.strokeStyle = '#8f3320'; g.lineWidth = 3;
    g.stroke();
    g.globalAlpha = 1;
  }

  if (pal.pole) {
    // Mars' caps, at both ends of the map.
    g.fillStyle = pal.pole;
    for (const y of [0, c.height]) {
      g.globalAlpha = 0.9;
      g.beginPath();
      g.ellipse(c.width * 0.5, y, c.width * 0.19, c.height * 0.085, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  return c;
}

/**
 * Saturn's rings, as a strip that gets wrapped onto an annulus.
 *
 * The gaps are the real ones and in the right places: the Cassini division at
 * about 88% of the way out through the bright rings, the fainter Encke gap
 * near the outer edge. Without them it reads as a solid hoop, which is the one
 * thing Saturn's rings visibly are not.
 */
export function ringTexture(width = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width; c.height = 8;
  const g = c.getContext('2d')!;
  const rand = rng(4242);

  // x runs from the inner edge of the C ring to the outer edge of the A ring.
  for (let x = 0; x < width; x++) {
    const t = x / width;
    let alpha: number;
    let tint: number;
    if (t < 0.18) { alpha = 0.16 + rand() * 0.05; tint = 0.62; }        // C ring, thin and dark
    else if (t < 0.62) { alpha = 0.78 + rand() * 0.16; tint = 1.0; }     // B ring, the bright one
    else if (t < 0.66) { alpha = 0.06; tint = 0.5; }                     // Cassini division
    else if (t < 0.95) { alpha = 0.55 + rand() * 0.14; tint = 0.88; }    // A ring
    else if (t < 0.965) { alpha = 0.10; tint = 0.6; }                    // Encke gap
    else { alpha = 0.45; tint = 0.8; }
    // Fine ringlet structure, so it does not look airbrushed.
    alpha *= 0.86 + 0.14 * Math.sin(t * 420 + rand() * 0.5);
    const v = Math.round(226 * tint), v2 = Math.round(205 * tint), v3 = Math.round(160 * tint);
    g.fillStyle = `rgba(${v},${v2},${v3},${alpha.toFixed(3)})`;
    g.fillRect(x, 0, 1, c.height);
  }
  return c;
}

/** A soft round dot, used for every star and for unresolved planets. */
export function glowSprite(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * The moons worth drawing, with their real orbital radii and periods.
 *
 * Positions are circular orbits from a fixed epoch, not a satellite ephemeris:
 * the spacing, the sizes and the speeds are right, so the arrangement changes
 * night to night and looks like the real system, but which side of the planet
 * a given moon is on tonight is not something to bet on. The screen says so.
 */
export interface MoonDef { name: string; radiusKm: number; orbitKm: number; periodDays: number; tint: string }

export const MOONS: Record<string, MoonDef[]> = {
  jupiter: [
    { name: 'Io',       radiusKm: 1821, orbitKm: 421700,  periodDays: 1.769,  tint: '#e8d98a' },
    { name: 'Europa',   radiusKm: 1561, orbitKm: 671100,  periodDays: 3.551,  tint: '#d8cfc0' },
    { name: 'Ganymede', radiusKm: 2634, orbitKm: 1070400, periodDays: 7.155,  tint: '#a89b8c' },
    { name: 'Callisto', radiusKm: 2410, orbitKm: 1882700, periodDays: 16.689, tint: '#7d7268' },
  ],
  saturn: [
    { name: 'Tethys', radiusKm: 531,  orbitKm: 294700,  periodDays: 1.888,  tint: '#cfcac0' },
    { name: 'Dione',  radiusKm: 561,  orbitKm: 377400,  periodDays: 2.737,  tint: '#c8c3ba' },
    { name: 'Rhea',   radiusKm: 764,  orbitKm: 527000,  periodDays: 4.518,  tint: '#c2bcb2' },
    { name: 'Titan',  radiusKm: 2575, orbitKm: 1221900, periodDays: 15.945, tint: '#e0a95c' },
    { name: 'Iapetus',radiusKm: 735,  orbitKm: 3560800, periodDays: 79.32,  tint: '#9a8f80' },
  ],
  mars: [
    { name: 'Phobos', radiusKm: 11, orbitKm: 9377,  periodDays: 0.319, tint: '#8a8078' },
    { name: 'Deimos', radiusKm: 6,  orbitKm: 23460, periodDays: 1.263, tint: '#8a8078' },
  ],
  neptune: [
    { name: 'Triton', radiusKm: 1353, orbitKm: 354800, periodDays: 5.877, tint: '#cfd8d8' },
  ],
  uranus: [
    { name: 'Titania', radiusKm: 789, orbitKm: 435900, periodDays: 8.706, tint: '#b9c4c6' },
    { name: 'Oberon',  radiusKm: 761, orbitKm: 583500, periodDays: 13.46, tint: '#a9b3b5' },
  ],
};
