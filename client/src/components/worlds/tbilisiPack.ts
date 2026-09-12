/**
 * Unpacking the district.
 *
 * The other half of `client/tools/osmExtract.mjs`. That script packs; this
 * reads. They are a contract with no schema between them, which is the kind of
 * thing that fails by drawing a plausible but wrong city — a byte out of step
 * and Abanotubani becomes a field of slivers, with nothing to compare against.
 * `tbilisiPack.test.ts` round-trips one against the other for that reason.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

/** Metres per unit in the packed stream. */
const DM = 10;
/** Height is one byte, in steps of this, so it reaches 102 m. */
const HEIGHT_STEP = 0.4;

export interface PackedBuilding {
  /** Footprint in metres, counter-clockwise, relative to the district origin. */
  pts: { x: number; z: number }[];
  height: number;
  kind: number;
}

export interface PackedRoad {
  pts: { x: number; z: number }[];
  width: number;
}

/** base64 → bytes, without pulling in a polyfill for a job atob already does. */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Read little-endian signed 16-bit decimetres.
 *
 * Hand-rolled rather than via DataView: this runs over a hundred thousand
 * coordinates at world build time, and the sign extension is one line.
 */
function readI16(b: Uint8Array, i: number): number {
  const v = b[i]! | (b[i + 1]! << 8);
  return (v & 0x8000) ? v - 0x10000 : v;
}

export function unpackBuildings(bytes: Uint8Array): PackedBuilding[] {
  const out: PackedBuilding[] = [];
  let i = 0;
  while (i + 3 <= bytes.length) {
    const n = bytes[i]!;
    const height = bytes[i + 1]! * HEIGHT_STEP;
    const kind = bytes[i + 2]!;
    i += 3;
    // A truncated stream is a corrupted asset, not a recoverable state: stop
    // rather than emit a building with half a wall.
    if (n < 3 || i + n * 4 > bytes.length) break;
    const pts = new Array<{ x: number; z: number }>(n);
    for (let k = 0; k < n; k++) {
      pts[k] = { x: readI16(bytes, i) / DM, z: readI16(bytes, i + 2) / DM };
      i += 4;
    }
    out.push({ pts, height, kind });
  }
  return out;
}

export function unpackRoads(bytes: Uint8Array): PackedRoad[] {
  const out: PackedRoad[] = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const n = bytes[i]!;
    const width = bytes[i + 1]! / DM;
    i += 2;
    if (n < 2 || i + n * 4 > bytes.length) break;
    const pts = new Array<{ x: number; z: number }>(n);
    for (let k = 0; k < n; k++) {
      pts[k] = { x: readI16(bytes, i) / DM, z: readI16(bytes, i + 2) / DM };
      i += 4;
    }
    out.push({ pts, width });
  }
  return out;
}

/**
 * Water rings.
 *
 * A u16 count rather than the u8 the others use: the Mtkvari's bank through the
 * old town is hundreds of points on its own, and a river truncated at 255 would
 * close itself across the city.
 */
export function unpackWater(bytes: Uint8Array): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const n = bytes[i]! | (bytes[i + 1]! << 8);
    i += 2;
    if (n < 3 || i + n * 4 > bytes.length) break;
    const ring = new Array<{ x: number; z: number }>(n);
    for (let k = 0; k < n; k++) {
      ring[k] = { x: readI16(bytes, i) / DM, z: readI16(bytes, i + 2) / DM };
      i += 4;
    }
    out.push(ring);
  }
  return out;
}

/** The worst a coordinate can be off, by construction. Used by the tests. */
export const QUANT_TOLERANCE_M = 1 / (2 * DM);
export const HEIGHT_TOLERANCE_M = HEIGHT_STEP / 2;
