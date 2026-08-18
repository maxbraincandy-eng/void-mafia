/**
 * Where things actually are in the sky, right now, from where you are standing.
 *
 * Everything here is plain arithmetic on the clock and your latitude — no
 * network, no catalogue server, no API key. Point the phone up and the maths
 * has to already know the answer.
 *
 * Accuracy: planets land within about an arcminute of the truth for the inner
 * ones and a few arcminutes for Uranus and Neptune, the Moon within a couple of
 * arcminutes, the Sun within a few arcseconds. Worth putting that next to the
 * error that actually matters here: a phone's magnetometer is off by two to
 * five DEGREES indoors, which is sixty to three hundred times larger. Chasing
 * VSOP87's full series would be polishing the one term nobody can see.
 *
 * Sources: the JPL "Keplerian Elements for Approximate Positions of the Major
 * Planets" table (valid 1800–2050) and Meeus, *Astronomical Algorithms*, for
 * the Sun (ch. 25), the Moon (ch. 47) and the coordinate rotations (ch. 13).
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Julian Date from a JS Date. */
export function julianDate(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0. */
export function centuries(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap to (−180, 180]. */
function norm180(x: number): number {
  const r = norm360(x);
  return r > 180 ? r - 360 : r;
}

// ── Keplerian elements ───────────────────────────────────────────────────────
// a (AU), e, I (deg), L (deg), ϖ longitude-of-perihelion (deg), Ω (deg),
// each followed by its rate per Julian century.
interface Elements {
  a: number; aDot: number;
  e: number; eDot: number;
  I: number; IDot: number;
  L: number; LDot: number;
  peri: number; periDot: number;
  node: number; nodeDot: number;
  /** Extra terms Jupiter outward needs to stay honest across the range. */
  b?: number; c?: number; s?: number; f?: number;
}

export type PlanetId =
  | 'mercury' | 'venus' | 'earth' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

const ELEMENTS: Record<PlanetId, Elements> = {
  mercury: { a: 0.38709927, aDot: 0.00000037, e: 0.20563593, eDot: 0.00001906, I: 7.00497902, IDot: -0.00594749, L: 252.25032350, LDot: 149472.67411175, peri: 77.45779628, periDot: 0.16047689, node: 48.33076593, nodeDot: -0.12534081 },
  venus:   { a: 0.72333566, aDot: 0.00000390, e: 0.00677672, eDot: -0.00004107, I: 3.39467605, IDot: -0.00078890, L: 181.97909950, LDot: 58517.81538729, peri: 131.60246718, periDot: 0.00268329, node: 76.67984255, nodeDot: -0.27769418 },
  earth:   { a: 1.00000261, aDot: 0.00000562, e: 0.01671123, eDot: -0.00004392, I: -0.00001531, IDot: -0.01294668, L: 100.46457166, LDot: 35999.37244981, peri: 102.93768193, periDot: 0.32327364, node: 0.0, nodeDot: 0.0 },
  mars:    { a: 1.52371034, aDot: 0.00001847, e: 0.09339410, eDot: 0.00007882, I: 1.84969142, IDot: -0.00813131, L: -4.55343205, LDot: 19140.30268499, peri: -23.94362959, periDot: 0.44441088, node: 49.55953891, nodeDot: -0.29257343 },
  jupiter: { a: 5.20288700, aDot: -0.00011607, e: 0.04838624, eDot: -0.00013253, I: 1.30439695, IDot: -0.00183714, L: 34.39644051, LDot: 3034.74612775, peri: 14.72847983, periDot: 0.21252668, node: 100.47390909, nodeDot: 0.20469106, b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000 },
  saturn:  { a: 9.53667594, aDot: -0.00125060, e: 0.05386179, eDot: -0.00050991, I: 2.48599187, IDot: 0.00193609, L: 49.95424423, LDot: 1222.49362201, peri: 92.59887831, periDot: -0.41897216, node: 113.66242448, nodeDot: -0.28867794, b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000 },
  uranus:  { a: 19.18916464, aDot: -0.00196176, e: 0.04725744, eDot: -0.00004397, I: 0.77263783, IDot: -0.00242939, L: 313.23810451, LDot: 428.48202785, peri: 170.95427630, periDot: 0.40805281, node: 74.01692503, nodeDot: 0.04240589, b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000 },
  neptune: { a: 30.06992276, aDot: 0.00026291, e: 0.00859048, eDot: 0.00005105, I: 1.77004347, IDot: 0.00035372, L: -55.12002969, LDot: 218.45945325, peri: 44.96476227, periDot: -0.32241464, node: 131.78422574, nodeDot: -0.00508664, b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000 },
};

/** A position in space, in AU, on the J2000 ecliptic. */
export interface Vec3 { x: number; y: number; z: number }

/**
 * Kepler's equation, solved by Newton–Raphson.
 *
 * Six iterations is comfortable: it converges quadratically and every orbit
 * here has e < 0.21, so the first guess is already close.
 */
function eccentricAnomaly(M: number, e: number): number {
  const Mr = norm180(M) * DEG;
  let E = Mr + e * Math.sin(Mr);
  for (let i = 0; i < 8; i++) {
    const dM = Mr - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Heliocentric position on the J2000 ecliptic, in AU. */
export function heliocentric(planet: PlanetId, jd: number): Vec3 {
  const T = centuries(jd);
  const el = ELEMENTS[planet];

  const a = el.a + el.aDot * T;
  const e = el.e + el.eDot * T;
  const I = (el.I + el.IDot * T) * DEG;
  const L = el.L + el.LDot * T;
  const peri = el.peri + el.periDot * T;
  const node = (el.node + el.nodeDot * T) * DEG;

  let M = L - peri;
  // Jupiter outward drift measurably over two centuries without these.
  if (el.b !== undefined) {
    M += el.b * T * T + (el.c ?? 0) * Math.cos((el.f ?? 0) * T * DEG)
       + (el.s ?? 0) * Math.sin((el.f ?? 0) * T * DEG);
  }
  const E = eccentricAnomaly(M, e);

  // In the orbital plane, x toward perihelion.
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const w = (peri - (el.node + el.nodeDot * T)) * DEG;  // argument of perihelion
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const cosO = Math.cos(node), sinO = Math.sin(node);
  const cosI = Math.cos(I), sinI = Math.sin(I);

  return {
    x: (cosw * cosO - sinw * sinO * cosI) * xv + (-sinw * cosO - cosw * sinO * cosI) * yv,
    y: (cosw * sinO + sinw * cosO * cosI) * xv + (-sinw * sinO + cosw * cosO * cosI) * yv,
    z: (sinw * sinI) * xv + (cosw * sinI) * yv,
  };
}

/**
 * Precession from J2000 to the equinox of date. IAU 1976, Meeus ch. 21.
 *
 * Everything in this file is computed in J2000 and precessed here, once. That
 * is not a style preference — the first version mixed frames, because Meeus'
 * Sun and Moon series are referred to the equinox OF DATE while the Keplerian
 * planet table is J2000, and the Sun came out 22 arcminutes from where Earth's
 * own orbit put it. The error was invisible in 2000 and grows by 50 arcseconds
 * a year, so it would have looked like nothing for a while and then like a
 * broken compass. One frame, converted once.
 */
export function precess(ra: number, dec: number, jd: number): { ra: number; dec: number } {
  const T = centuries(jd);
  const sec = 1 / 3600;
  const zeta  = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * sec * DEG;
  const z     = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * sec * DEG;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * sec * DEG;

  const a0 = ra * 15 * DEG, d0 = dec * DEG;
  const A = Math.cos(d0) * Math.sin(a0 + zeta);
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(theta) * Math.sin(d0);
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(theta) * Math.sin(d0);
  return {
    ra: norm360(Math.atan2(A, B) * RAD + z * RAD) / 15,
    dec: Math.asin(Math.max(-1, Math.min(1, C))) * RAD,
  };
}

/**
 * General precession in ecliptic longitude since J2000, in degrees.
 *
 * Meeus' Sun and Moon come out referred to the equinox of date; subtracting
 * this puts them back on J2000 so they can travel with the planets.
 */
function precessionInLongitude(T: number): number {
  return 1.396971 * T + 0.0003086 * T * T;
}

/** Right ascension (hours) and declination (degrees), plus distance in AU. */
export interface Equatorial { ra: number; dec: number; dist: number }

const OBLIQUITY = 23.43928 * DEG;

/** Ecliptic rectangular (AU) → equatorial RA/Dec. */
export function eclipticToEquatorial(v: Vec3): Equatorial {
  const cosE = Math.cos(OBLIQUITY), sinE = Math.sin(OBLIQUITY);
  const xe = v.x;
  const ye = v.y * cosE - v.z * sinE;
  const ze = v.y * sinE + v.z * cosE;
  const dist = Math.sqrt(xe * xe + ye * ye + ze * ze);
  return {
    ra: norm360(Math.atan2(ye, xe) * RAD) / 15,
    dec: Math.asin(ze / dist) * RAD,
    dist,
  };
}

/**
 * Geocentric position of a planet, corrected for light travel time.
 *
 * Saturn's light is 70–90 minutes old by the time it arrives, and the planet
 * moves a noticeable fraction of an arcminute in that time. One iteration is
 * enough — the correction to the correction is microarcseconds.
 */
export function planetEquatorial(planet: PlanetId, jd: number): Equatorial {
  const earth = heliocentric('earth', jd);
  let p = heliocentric(planet, jd);
  let d = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z);
  const lightDays = d / 173.1446;          // AU per day
  p = heliocentric(planet, jd - lightDays);
  d = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z);
  return eclipticToEquatorial({ x: p.x - earth.x, y: p.y - earth.y, z: p.z - earth.z });
}

/** The Sun, seen from Earth. Meeus ch. 25, low precision. */
export function sunEquatorial(jd: number): Equatorial {
  const T = centuries(jd);
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
          + 0.000289 * Math.sin(3 * M);
  // L0 is referred to the mean equinox of date; take it back to J2000 so it
  // shares a frame with the planets.
  const lambda = (L0 + C - precessionInLongitude(T)) * DEG;
  const e = 0.016708634 - 0.000042037 * T;
  const v = M + C * DEG;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v));
  return eclipticToEquatorial({
    x: R * Math.cos(lambda),
    y: R * Math.sin(lambda),
    z: 0,
  });
}

/**
 * The Moon. Meeus ch. 47, carrying the terms that matter above an arcminute.
 *
 * The Moon is the one object where a small angular error is obvious, because
 * it is half a degree wide and you can see it drift against a landmark. The
 * terms below hold it to roughly a couple of arcminutes.
 */
export function moonEquatorial(jd: number): Equatorial {
  const T = centuries(jd);
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);      // mean longitude
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) * DEG;  // elongation
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * DEG;   // sun anomaly
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T) * DEG;  // moon anomaly
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T) * DEG;   // argument of latitude

  const lon = Lp
    + 6.288774 * Math.sin(Mp)
    + 1.274027 * Math.sin(2 * D - Mp)
    + 0.658314 * Math.sin(2 * D)
    + 0.213618 * Math.sin(2 * Mp)
    - 0.185116 * Math.sin(M)
    - 0.114332 * Math.sin(2 * F)
    + 0.058793 * Math.sin(2 * D - 2 * Mp)
    + 0.057066 * Math.sin(2 * D - M - Mp)
    + 0.053322 * Math.sin(2 * D + Mp)
    + 0.045758 * Math.sin(2 * D - M)
    - 0.040923 * Math.sin(M - Mp)
    - 0.034720 * Math.sin(D)
    - 0.030383 * Math.sin(M + Mp)
    + 0.015327 * Math.sin(2 * D - 2 * F)
    - 0.012528 * Math.sin(Mp + 2 * F)
    + 0.010980 * Math.sin(Mp - 2 * F)
    + 0.010675 * Math.sin(4 * D - Mp)
    + 0.010034 * Math.sin(3 * Mp)
    + 0.008548 * Math.sin(4 * D - 2 * Mp);

  const lat =
      5.128122 * Math.sin(F)
    + 0.280602 * Math.sin(Mp + F)
    + 0.277693 * Math.sin(Mp - F)
    + 0.173237 * Math.sin(2 * D - F)
    + 0.055413 * Math.sin(2 * D - Mp + F)
    + 0.046271 * Math.sin(2 * D - Mp - F)
    + 0.032573 * Math.sin(2 * D + F)
    + 0.017198 * Math.sin(2 * Mp + F)
    + 0.009266 * Math.sin(2 * D + Mp - F)
    + 0.008822 * Math.sin(2 * Mp - F)
    + 0.008216 * Math.sin(2 * D - M - F);

  // Distance in km → AU, so everything downstream speaks one unit.
  const distKm = 385000.56
    - 20905.355 * Math.cos(Mp)
    - 3699.111 * Math.cos(2 * D - Mp)
    - 2955.968 * Math.cos(2 * D)
    - 569.925 * Math.cos(2 * Mp)
    + 246.158 * Math.cos(2 * D - 2 * Mp)
    - 204.586 * Math.cos(2 * D - M)
    - 170.733 * Math.cos(2 * D + Mp)
    - 152.138 * Math.cos(2 * D - M - Mp)
    - 129.620 * Math.cos(D)
    + 108.743 * Math.cos(M - Mp);

  const r = distKm / 149597870.7;
  const l = (lon - precessionInLongitude(T)) * DEG, b = lat * DEG;
  return eclipticToEquatorial({
    x: r * Math.cos(b) * Math.cos(l),
    y: r * Math.cos(b) * Math.sin(l),
    z: r * Math.sin(b),
  });
}

/** Greenwich mean sidereal time, in hours. */
export function gmst(jd: number): number {
  const T = centuries(jd);
  const theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - (T * T * T) / 38710000;
  return norm360(theta) / 15;
}

/** Local sidereal time, in hours. `lonDeg` is east-positive. */
export function lst(jd: number, lonDeg: number): number {
  return (gmst(jd) + lonDeg / 15 + 24) % 24;
}

/** Altitude above the horizon and azimuth measured from north, eastward. */
export interface Horizon { alt: number; az: number }

export function equatorialToHorizon(eq: Equatorial, jd: number, latDeg: number, lonDeg: number): Horizon {
  // Sidereal time is an of-date quantity, so the coordinates meeting it here
  // have to be of-date too. This is the one place that conversion happens, for
  // planets, Sun, Moon and the J2000 star catalogue alike.
  const now = precess(eq.ra, eq.dec, jd);
  const H = ((lst(jd, lonDeg) - now.ra) * 15) * DEG;   // hour angle
  const dec = now.dec * DEG, lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(H),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H),
  );
  return { alt: alt * RAD, az: norm360(az * RAD) };
}

/**
 * A unit vector for the renderer: −Z is north, +X is east, +Y is up.
 *
 * That is the frame three.js's device-orientation convention already works in,
 * so the sky and the phone agree without a second set of rotations to get
 * wrong.
 */
export function horizonToVector({ alt, az }: Horizon): Vec3 {
  const a = alt * DEG, z = az * DEG;
  return {
    x: Math.cos(a) * Math.sin(z),
    y: Math.sin(a),
    z: -Math.cos(a) * Math.cos(z),
  };
}

// ── What each body looks like ────────────────────────────────────────────────

/** Equatorial radius in km — for turning distance into an apparent size. */
export const RADIUS_KM: Record<PlanetId | 'sun' | 'moon', number> = {
  sun: 696000, moon: 1737.4,
  mercury: 2439.7, venus: 6051.8, earth: 6371, mars: 3389.5,
  jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622,
};

/** Apparent diameter in arcseconds at a given distance in AU. */
export function angularDiameter(body: PlanetId | 'sun' | 'moon', distAu: number): number {
  const km = distAu * 149597870.7;
  return 2 * Math.atan(RADIUS_KM[body] / km) * RAD * 3600;
}

/**
 * Apparent magnitude, from the standard H/G-style fits (Meeus ch. 41).
 *
 * Used only to decide how brightly to draw a dot, so the phase-angle terms are
 * the abbreviated ones.
 */
export function magnitude(planet: PlanetId, rHelio: number, dGeo: number, phaseDeg: number): number {
  const base = 5 * Math.log10(rHelio * dGeo);
  const i = phaseDeg;
  switch (planet) {
    case 'mercury': return -0.42 + base + 0.0380 * i - 0.000273 * i * i + 0.000002 * i * i * i;
    case 'venus':   return -4.40 + base + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i;
    case 'mars':    return -1.52 + base + 0.016 * i;
    case 'jupiter': return -9.40 + base + 0.005 * i;
    case 'saturn':  return -8.88 + base;   // rings dominate and are handled separately
    case 'uranus':  return -7.19 + base;
    case 'neptune': return -6.87 + base;
    default:        return 0;
  }
}

/** Everything the renderer needs about one body at one instant. */
export interface SkyBody {
  id: PlanetId | 'sun' | 'moon';
  eq: Equatorial;
  horizon: Horizon;
  /** Apparent diameter, arcseconds. */
  size: number;
  mag: number;
  /** Sun–body–Earth angle, which is what makes a crescent. */
  phase: number;
  /** Lit fraction of the disc, 0–1. */
  illum: number;
}

export function computeBodies(date: Date, latDeg: number, lonDeg: number): SkyBody[] {
  const jd = julianDate(date);
  const out: SkyBody[] = [];

  const sun = sunEquatorial(jd);
  out.push({
    id: 'sun', eq: sun, horizon: equatorialToHorizon(sun, jd, latDeg, lonDeg),
    size: angularDiameter('sun', sun.dist), mag: -26.7, phase: 0, illum: 1,
  });

  const moon = moonEquatorial(jd);
  // Phase from the Sun–Moon elongation as seen from here.
  const elong = Math.acos(Math.max(-1, Math.min(1,
    Math.sin(moon.dec * DEG) * Math.sin(sun.dec * DEG) +
    Math.cos(moon.dec * DEG) * Math.cos(sun.dec * DEG) * Math.cos((moon.ra - sun.ra) * 15 * DEG),
  ))) * RAD;
  out.push({
    id: 'moon', eq: moon, horizon: equatorialToHorizon(moon, jd, latDeg, lonDeg),
    size: angularDiameter('moon', moon.dist), mag: -12.7,
    phase: 180 - elong, illum: (1 + Math.cos((180 - elong) * DEG)) / 2,
  });

  const earth = heliocentric('earth', jd);
  const rEarth = Math.hypot(earth.x, earth.y, earth.z);
  for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as PlanetId[]) {
    const eq = planetEquatorial(id, jd);
    const helio = heliocentric(id, jd);
    const r = Math.hypot(helio.x, helio.y, helio.z);
    const d = eq.dist;
    // Law of cosines on the Sun–planet–Earth triangle.
    const cosPhase = (r * r + d * d - rEarth * rEarth) / (2 * r * d);
    const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase))) * RAD;
    out.push({
      id, eq, horizon: equatorialToHorizon(eq, jd, latDeg, lonDeg),
      size: angularDiameter(id, d), mag: magnitude(id, r, d, phase),
      phase, illum: (1 + Math.cos(phase * DEG)) / 2,
    });
  }
  return out;
}

/**
 * Saturn's ring tilt as we see it, in degrees.
 *
 * Zero means edge-on and the rings vanish for a few days; ±27° is wide open.
 * Without this the rings would be drawn at a constant angle and the whole
 * thing would be a picture rather than a view. Meeus ch. 45, main terms.
 */
export function saturnRingTilt(jd: number): number {
  const T = centuries(jd);
  const i = 28.075216 - 0.012998 * T + 0.000004 * T * T;
  const Om = 169.508470 + 1.394681 * T + 0.000412 * T * T;
  const earth = heliocentric('earth', jd);
  const sat = heliocentric('saturn', jd);
  const g = { x: sat.x - earth.x, y: sat.y - earth.y, z: sat.z - earth.z };
  const d = Math.hypot(g.x, g.y, g.z);
  const lambda = Math.atan2(g.y, g.x) * RAD;
  const beta = Math.asin(g.z / d) * RAD;
  const sinB = Math.sin(i * DEG) * Math.cos(beta * DEG) * Math.sin((lambda - Om) * DEG)
             - Math.cos(i * DEG) * Math.sin(beta * DEG);
  return Math.asin(Math.max(-1, Math.min(1, sinB))) * RAD;
}
