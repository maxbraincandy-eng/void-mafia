/**
 * The stars you can actually pick out, and the figures they draw.
 *
 * Deliberately small: about seventy stars down to roughly magnitude 3, which is
 * every star that carries a constellation line plus the ones bright enough to
 * name from a city. A full catalogue would be megabytes and, under the light
 * pollution anyone using a phone is standing in, would draw thousands of stars
 * that are not there to be seen.
 *
 * Coordinates are J2000 — RA in hours, declination in degrees — and are
 * precessed to date by the same single step everything else goes through.
 */

export interface Star {
  /** Short key, used by the constellation lines. */
  k: string;
  /** Proper name, shown when you tap it. */
  name: string;
  /** Right ascension, J2000, in hours. */
  ra: number;
  /** Declination, J2000, in degrees. */
  dec: number;
  /** Apparent visual magnitude. */
  mag: number;
  /** B−V colour index; drives the drawn tint. */
  bv: number;
}

const h = (hh: number, mm: number) => hh + mm / 60;
const d = (deg: number, min: number) => (deg < 0 || Object.is(deg, -0) ? deg - min / 60 : deg + min / 60);

export const STARS: Star[] = [
  { k: 'sirius',   name: 'Sirius',        ra: h(6, 45.1),  dec: d(-16, 43), mag: -1.46, bv: 0.00 },
  { k: 'canopus',  name: 'Canopus',       ra: h(6, 24.0),  dec: d(-52, 42), mag: -0.74, bv: 0.15 },
  { k: 'rigilkent',name: 'Alpha Centauri',ra: h(14, 39.6), dec: d(-60, 50), mag: -0.27, bv: 0.71 },
  { k: 'arcturus', name: 'Arcturus',      ra: h(14, 15.7), dec: d(19, 11),  mag: -0.05, bv: 1.23 },
  { k: 'vega',     name: 'Vega',          ra: h(18, 36.9), dec: d(38, 47),  mag: 0.03,  bv: 0.00 },
  { k: 'capella',  name: 'Capella',       ra: h(5, 16.7),  dec: d(46, 0),   mag: 0.08,  bv: 0.80 },
  { k: 'rigel',    name: 'Rigel',         ra: h(5, 14.5),  dec: d(-8, 12),  mag: 0.13,  bv: -0.03 },
  { k: 'procyon',  name: 'Procyon',       ra: h(7, 39.3),  dec: d(5, 14),   mag: 0.34,  bv: 0.42 },
  { k: 'achernar', name: 'Achernar',      ra: h(1, 37.7),  dec: d(-57, 14), mag: 0.46,  bv: -0.16 },
  { k: 'betelgeuse', name: 'Betelgeuse',  ra: h(5, 55.2),  dec: d(7, 24),   mag: 0.50,  bv: 1.85 },
  { k: 'hadar',    name: 'Hadar',         ra: h(14, 3.8),  dec: d(-60, 22), mag: 0.61,  bv: -0.23 },
  { k: 'altair',   name: 'Altair',        ra: h(19, 50.8), dec: d(8, 52),   mag: 0.77,  bv: 0.22 },
  { k: 'acrux',    name: 'Acrux',         ra: h(12, 26.6), dec: d(-63, 6),  mag: 0.77,  bv: -0.24 },
  { k: 'aldebaran',name: 'Aldebaran',     ra: h(4, 35.9),  dec: d(16, 31),  mag: 0.85,  bv: 1.54 },
  { k: 'antares',  name: 'Antares',       ra: h(16, 29.4), dec: d(-26, 26), mag: 1.09,  bv: 1.83 },
  { k: 'spica',    name: 'Spica',         ra: h(13, 25.2), dec: d(-11, 10), mag: 1.04,  bv: -0.23 },
  { k: 'pollux',   name: 'Pollux',        ra: h(7, 45.3),  dec: d(28, 2),   mag: 1.14,  bv: 1.00 },
  { k: 'fomalhaut',name: 'Fomalhaut',     ra: h(22, 57.6), dec: d(-29, 37), mag: 1.16,  bv: 0.09 },
  { k: 'deneb',    name: 'Deneb',         ra: h(20, 41.4), dec: d(45, 17),  mag: 1.25,  bv: 0.09 },
  { k: 'mimosa',   name: 'Mimosa',        ra: h(12, 47.7), dec: d(-59, 41), mag: 1.25,  bv: -0.24 },
  { k: 'regulus',  name: 'Regulus',       ra: h(10, 8.4),  dec: d(11, 58),  mag: 1.35,  bv: -0.11 },
  { k: 'adhara',   name: 'Adhara',        ra: h(6, 58.6),  dec: d(-28, 58), mag: 1.50,  bv: -0.21 },
  { k: 'castor',   name: 'Castor',        ra: h(7, 34.6),  dec: d(31, 53),  mag: 1.58,  bv: 0.03 },
  { k: 'gacrux',   name: 'Gacrux',        ra: h(12, 31.2), dec: d(-57, 7),  mag: 1.59,  bv: 1.59 },
  { k: 'shaula',   name: 'Shaula',        ra: h(17, 33.6), dec: d(-37, 6),  mag: 1.62,  bv: -0.22 },
  { k: 'bellatrix',name: 'Bellatrix',     ra: h(5, 25.1),  dec: d(6, 21),   mag: 1.64,  bv: -0.22 },
  { k: 'elnath',   name: 'Elnath',        ra: h(5, 26.3),  dec: d(28, 36),  mag: 1.65,  bv: -0.13 },
  { k: 'miaplacidus', name: 'Miaplacidus',ra: h(9, 13.2),  dec: d(-69, 43), mag: 1.67,  bv: 0.07 },
  { k: 'alnilam',  name: 'Alnilam',       ra: h(5, 36.2),  dec: d(-1, 12),  mag: 1.69,  bv: -0.18 },
  { k: 'alnair',   name: 'Alnair',        ra: h(22, 8.2),  dec: d(-46, 58), mag: 1.74,  bv: -0.13 },
  { k: 'alnitak',  name: 'Alnitak',       ra: h(5, 40.8),  dec: d(-1, 57),  mag: 1.77,  bv: -0.20 },
  { k: 'alioth',   name: 'Alioth',        ra: h(12, 54.0), dec: d(55, 58),  mag: 1.77,  bv: -0.02 },
  { k: 'dubhe',    name: 'Dubhe',         ra: h(11, 3.7),  dec: d(61, 45),  mag: 1.79,  bv: 1.07 },
  { k: 'mirfak',   name: 'Mirfak',        ra: h(3, 24.3),  dec: d(49, 52),  mag: 1.79,  bv: 0.48 },
  { k: 'kausaus',  name: 'Kaus Australis',ra: h(18, 24.2), dec: d(-34, 23), mag: 1.85,  bv: -0.03 },
  { k: 'alkaid',   name: 'Alkaid',        ra: h(13, 47.5), dec: d(49, 19),  mag: 1.86,  bv: -0.19 },
  { k: 'avior',    name: 'Avior',         ra: h(8, 22.5),  dec: d(-59, 31), mag: 1.86,  bv: 1.20 },
  { k: 'atria',    name: 'Atria',         ra: h(16, 48.7), dec: d(-69, 2),  mag: 1.91,  bv: 1.44 },
  { k: 'alhena',   name: 'Alhena',        ra: h(6, 37.7),  dec: d(16, 24),  mag: 1.93,  bv: 0.00 },
  { k: 'peacock',  name: 'Peacock',       ra: h(20, 25.6), dec: d(-56, 44), mag: 1.94,  bv: -0.12 },
  { k: 'polaris',  name: 'Polaris',       ra: h(2, 31.8),  dec: d(89, 16),  mag: 1.98,  bv: 0.60 },
  { k: 'mirzam',   name: 'Mirzam',        ra: h(6, 22.7),  dec: d(-17, 57), mag: 1.98,  bv: -0.24 },
  { k: 'alphard',  name: 'Alphard',       ra: h(9, 27.6),  dec: d(-8, 40),  mag: 1.98,  bv: 1.44 },
  { k: 'algieba',  name: 'Algieba',       ra: h(10, 20.0), dec: d(19, 50),  mag: 2.01,  bv: 1.13 },
  { k: 'hamal',    name: 'Hamal',         ra: h(2, 7.2),   dec: d(23, 28),  mag: 2.00,  bv: 1.15 },
  { k: 'diphda',   name: 'Diphda',        ra: h(0, 43.6),  dec: d(-17, 59), mag: 2.04,  bv: 1.02 },
  { k: 'nunki',    name: 'Nunki',         ra: h(18, 55.3), dec: d(-26, 18), mag: 2.05,  bv: -0.22 },
  { k: 'menkent',  name: 'Menkent',       ra: h(14, 6.7),  dec: d(-36, 22), mag: 2.06,  bv: 1.01 },
  { k: 'mizar',    name: 'Mizar',         ra: h(13, 23.9), dec: d(54, 56),  mag: 2.23,  bv: 0.06 },
  { k: 'alpheratz',name: 'Alpheratz',     ra: h(0, 8.4),   dec: d(29, 5),   mag: 2.06,  bv: -0.11 },
  { k: 'saiph',    name: 'Saiph',         ra: h(5, 47.8),  dec: d(-9, 40),  mag: 2.09,  bv: -0.17 },
  { k: 'mirach',   name: 'Mirach',        ra: h(1, 9.7),   dec: d(35, 37),  mag: 2.06,  bv: 1.58 },
  { k: 'denebola', name: 'Denebola',      ra: h(11, 49.1), dec: d(14, 34),  mag: 2.14,  bv: 0.09 },
  { k: 'schedar',  name: 'Schedar',       ra: h(0, 40.5),  dec: d(56, 32),  mag: 2.23,  bv: 1.17 },
  { k: 'caph',     name: 'Caph',          ra: h(0, 9.2),   dec: d(59, 9),   mag: 2.27,  bv: 0.38 },
  { k: 'gammacas', name: 'Navi',          ra: h(0, 56.7),  dec: d(60, 43),  mag: 2.15,  bv: -0.15 },
  { k: 'ruchbah',  name: 'Ruchbah',       ra: h(1, 25.8),  dec: d(60, 14),  mag: 2.68,  bv: 0.16 },
  { k: 'segin',    name: 'Segin',         ra: h(1, 54.4),  dec: d(63, 40),  mag: 3.35,  bv: -0.15 },
  { k: 'almach',   name: 'Almach',        ra: h(2, 3.9),   dec: d(42, 20),  mag: 2.10,  bv: 1.37 },
  { k: 'algol',    name: 'Algol',         ra: h(3, 8.2),   dec: d(40, 57),  mag: 2.09,  bv: -0.05 },
  { k: 'alcyone',  name: 'Alcyone',       ra: h(3, 47.5),  dec: d(24, 7),   mag: 2.87,  bv: -0.09 },
  { k: 'rasalhague', name: 'Rasalhague',  ra: h(17, 34.9), dec: d(12, 34),  mag: 2.08,  bv: 0.16 },
  { k: 'sabik',    name: 'Sabik',         ra: h(17, 10.4), dec: d(-15, 43), mag: 2.43,  bv: 0.06 },
  { k: 'albireo',  name: 'Albireo',       ra: h(19, 30.7), dec: d(27, 58),  mag: 3.05,  bv: 1.09 },
  { k: 'sadr',     name: 'Sadr',          ra: h(20, 22.2), dec: d(40, 15),  mag: 2.23,  bv: 0.68 },
  { k: 'gienahcyg',name: 'Gienah',        ra: h(20, 46.2), dec: d(33, 58),  mag: 2.46,  bv: 1.02 },
  { k: 'delphinus',name: 'Rotanev',       ra: h(20, 37.5), dec: d(14, 36),  mag: 3.63,  bv: 0.44 },
  { k: 'enif',     name: 'Enif',          ra: h(21, 44.2), dec: d(9, 53),   mag: 2.38,  bv: 1.53 },
  { k: 'markab',   name: 'Markab',        ra: h(23, 4.8),  dec: d(15, 12),  mag: 2.48,  bv: -0.04 },
  { k: 'scheat',   name: 'Scheat',        ra: h(23, 3.8),  dec: d(28, 5),   mag: 2.42,  bv: 1.67 },
  { k: 'algenib',  name: 'Algenib',       ra: h(0, 13.2),  dec: d(15, 11),  mag: 2.83,  bv: -0.19 },
  { k: 'menkar',   name: 'Menkar',        ra: h(3, 2.3),   dec: d(4, 6),    mag: 2.53,  bv: 1.63 },
  { k: 'merak',    name: 'Merak',         ra: h(11, 1.8),  dec: d(56, 23),  mag: 2.37,  bv: 0.03 },
  { k: 'phecda',   name: 'Phecda',        ra: h(11, 53.8), dec: d(53, 42),  mag: 2.44,  bv: 0.04 },
  { k: 'megrez',   name: 'Megrez',        ra: h(12, 15.4), dec: d(57, 2),   mag: 3.31,  bv: 0.08 },
  { k: 'kochab',   name: 'Kochab',        ra: h(14, 50.7), dec: d(74, 9),   mag: 2.08,  bv: 1.47 },
];

export const STAR_BY_KEY: Record<string, Star> =
  Object.fromEntries(STARS.map(s => [s.k, s]));

/**
 * The figures, as pairs of star keys.
 *
 * Only the shapes people actually recognise. A line drawn between two stars
 * that nobody joins in their head is noise on the screen.
 */
export interface Constellation { name: string; lines: [string, string][] }

export const CONSTELLATIONS: Constellation[] = [
  {
    name: 'ორიონი',
    lines: [
      ['betelgeuse', 'bellatrix'], ['bellatrix', 'mintaka_alias'], ['betelgeuse', 'alnitak'],
      ['alnitak', 'alnilam'], ['alnilam', 'mintaka_alias'],
      ['alnitak', 'saiph'], ['mintaka_alias', 'rigel'], ['saiph', 'rigel'],
    ],
  },
  {
    name: 'დიდი დათვი',
    lines: [
      ['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'],
      ['megrez', 'dubhe'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid'],
    ],
  },
  {
    name: 'კასიოპეა',
    lines: [['caph', 'schedar'], ['schedar', 'gammacas'], ['gammacas', 'ruchbah'], ['ruchbah', 'segin']],
  },
  {
    name: 'გედი',
    lines: [['deneb', 'sadr'], ['sadr', 'albireo'], ['gienahcyg', 'sadr'], ['sadr', 'delphinus_alias']],
  },
  {
    name: 'ჯვარი',
    lines: [['acrux', 'gacrux'], ['mimosa', 'acrux'], ['mimosa', 'gacrux']],
  },
  {
    name: 'ტყუპები',
    lines: [['castor', 'pollux'], ['pollux', 'alhena']],
  },
  {
    name: 'ლომი',
    lines: [['regulus', 'algieba'], ['algieba', 'denebola']],
  },
  {
    name: 'პეგასი',
    lines: [['alpheratz', 'scheat'], ['scheat', 'markab'], ['markab', 'algenib'], ['algenib', 'alpheratz'],
            ['alpheratz', 'mirach'], ['mirach', 'almach'], ['markab', 'enif']],
  },
  {
    name: 'კურო',
    lines: [['aldebaran', 'elnath'], ['aldebaran', 'alcyone']],
  },
  {
    name: 'დიდი ძაღლი',
    lines: [['sirius', 'mirzam'], ['sirius', 'adhara']],
  },
  {
    name: 'მორიელი',
    lines: [['antares', 'sabik'], ['antares', 'shaula']],
  },
  {
    name: 'პატარა დათვი',
    lines: [['polaris', 'kochab']],
  },
];

/**
 * Orion's belt and Cygnus need two stars that carry no proper name in this
 * list. Rather than invent entries, the lines above point at these aliases and
 * they are resolved here — so a typo in a line is a missing line, never a
 * silently mis-drawn one.
 */
export const EXTRA_STARS: Star[] = [
  { k: 'mintaka_alias', name: 'Mintaka', ra: h(5, 32.0), dec: d(0, -18), mag: 2.23, bv: -0.18 },
  { k: 'delphinus_alias', name: 'Eta Cygni', ra: h(19, 56.3), dec: d(35, 5), mag: 3.89, bv: 1.02 },
];

/** Every star the renderer should draw, figures included. */
export const ALL_STARS: Star[] = [...STARS, ...EXTRA_STARS];

/** B−V to an approximate RGB, so hot stars look blue and cool ones orange. */
export function starColour(bv: number): [number, number, number] {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  // A smooth ramp through the colours the eye actually assigns to stars.
  if (t < 0) return [0.62 + t * 0.3, 0.74 + t * 0.2, 1.0];
  if (t < 0.4) return [1 - t * 0.15, 1 - t * 0.05, 1 - t * 0.25];
  if (t < 0.8) return [1, 0.96 - (t - 0.4) * 0.2, 0.9 - (t - 0.4) * 0.5];
  return [1, 0.86 - (t - 0.8) * 0.18, 0.7 - (t - 0.8) * 0.3];
}
