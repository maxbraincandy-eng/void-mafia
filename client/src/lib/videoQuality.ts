/**
 * Which simulcast layer a video tile actually needs.
 *
 * THE PROBLEM THIS SOLVES
 * ──────────────────────
 * LiveKit's adaptive stream picks a layer from the size of the `<video>` element
 * a track was attached to. This app never attaches: it takes
 * `track.mediaStreamTrack`, wraps it in its own `MediaStream` and hands that to
 * React (see the note at the top of livekitRoomOptions.ts for why adaptive
 * stream is off rather than merely useless here).
 *
 * With nothing sizing the subscription, a subscriber asks for the publisher's
 * top layer. At a twelve-seat table that is eleven 720p streams arriving at
 * once, on a phone, to be painted into tiles 89 points wide. Roughly 18 Mbit/s
 * and ten megapixels a frame to decode, for about six hundred thousand pixels
 * of actual screen. That is the lag, and it causes the blur too: a downlink
 * that cannot keep up drives congestion control, which pushes everybody's
 * *upload* down, so every face gets worse.
 *
 * So the layer is chosen from the box the video is really drawn in, which this
 * app does know — it computes it in fitTile.
 *
 * WHY THE PUBLISHER STILL SENDS 720
 * ─────────────────────────────────
 * Dynacast (on) pauses simulcast layers nobody is subscribed to. A table where
 * every tile asks for `low` means no one is asking for the top layer, so it
 * stops being encoded — the saving lands on the sender's battery as well as the
 * receiver's, without capping what the host's centre stage can be when somebody
 * is watching it on a laptop.
 */

/** The three rungs, in the order LiveKit's `VideoQuality` names them. */
export type WantedQuality = 'low' | 'medium' | 'high';

/*
 * The layer widths this maps onto, from the table room's publish settings:
 *
 *   low    320×180
 *   medium 640×360
 *   high   1280×720
 *
 * A rung is chosen when the tile is wider than the rung below it can fill.
 * Upscaling a little is invisible; downscaling by four is bandwidth and heat
 * spent on pixels that are thrown away before they reach a screen.
 */
const LOW_MAX = 320;
const MEDIUM_MAX = 640;

/**
 * @param cssWidth  the tile's width in CSS pixels, as laid out
 * @param dpr       device pixel ratio — a 89-point tile on a phone is 267 real
 *                  pixels, and asking for 180 lines there would be visibly soft
 */
export function qualityForWidth(cssWidth: number, dpr = 1): WantedQuality {
  // A tile that has not been measured yet must not pin the subscription to the
  // top layer, which is exactly what "0 is falsy so use the default" would do.
  const px = Math.round(Math.max(0, cssWidth || 0) * Math.max(1, dpr || 1));
  if (px <= LOW_MAX) return 'low';
  if (px <= MEDIUM_MAX) return 'medium';
  return 'high';
}

/**
 * What every participant in a table should be sending this viewer.
 *
 * The host is separated out because their tile is the centre stage and is
 * several times the size of a seat — at a laptop it is the one subscription in
 * the room that genuinely wants the top layer.
 */
export function tableQualityPlan(o: {
  seatIds: readonly string[];
  seatWidth: number;
  hostId: string;
  hostWidth: number;
  dpr?: number;
}): Map<string, WantedQuality> {
  const dpr = o.dpr ?? 1;
  const plan = new Map<string, WantedQuality>();
  const seat = qualityForWidth(o.seatWidth, dpr);
  for (const id of o.seatIds) if (id !== o.hostId) plan.set(id, seat);
  plan.set(o.hostId, qualityForWidth(o.hostWidth, dpr));
  return plan;
}
