/**
 * How a LiveKit room should be configured, by what kind of room it is.
 *
 * WHY THE VIEWERS SAW A WORSE PICTURE THAN THE HOST
 * ────────────────────────────────────────────────
 * Every room in the app was built with one config: `adaptiveStream: true`.
 * Adaptive stream picks a simulcast layer to match the size of the `<video>`
 * element on screen, and it starts low and climbs. That is exactly right for a
 * mafia table — twenty faces in tiles the size of a stamp, and pushing 720p to
 * each of them would melt the phone. It is exactly wrong for a broadcast: one
 * video, full screen, the only thing anybody came to look at.
 *
 * The host never noticed, and could not have. Their self-view is the raw camera
 * track painted straight from the capture, with no encoder anywhere in the
 * path — it always looks perfect. Everybody else was watching whichever layer
 * the sizing heuristic had settled on. Hence "sharp on mine, blurry on theirs",
 * with nothing broken anywhere to point at.
 *
 * WHY THIS IS ITS OWN FILE
 * ────────────────────────
 * It is a policy decision, and policy decisions are worth being able to assert
 * about. `livekitVoice.ts` reaches for the browser the moment it is imported;
 * this is a function from a string to an object, and there is a test that a
 * broadcast does not get the tile-grid settings by accident.
 */

import { VideoPresets, type RoomOptions } from 'livekit-client';

/**
 * A broadcast room, by name.
 *
 * Mirrors `roomFor` on the server — `live_<sessionId>` — which is derived and
 * never stored, so this is reading the same rule rather than duplicating state.
 */
export function isBroadcastRoom(roomId: string): boolean {
  return roomId.startsWith('live_');
}

export function roomOptionsFor(roomId: string): RoomOptions {
  if (!isBroadcastRoom(roomId)) {
    // A grid of small tiles, which is what adaptive stream is FOR.
    return { adaptiveStream: true, dynacast: true };
  }

  return {
    /*
     * Off, so a viewer subscribes to the top layer immediately and stays there.
     *
     * This also removes the ramp-up: adaptive stream subscribes low, measures
     * the element, and climbs, which is a second or two of a soft picture at
     * exactly the moment somebody has just arrived and is deciding whether the
     * stream is worth watching.
     *
     * The SFU still has its own bandwidth estimation and will move a viewer who
     * cannot keep up down a layer. What it will no longer do is decide, on its
     * own, that a full-screen video wants 360p.
     */
    adaptiveStream: false,
    /*
     * Stays ON. It pauses layers nobody is subscribed to, so a host with no
     * viewers is not encoding three resolutions into an empty room off their
     * battery — and the pause decision is the server's, made from real
     * subscriber demand, so a viewer downgraded by congestion still gets the
     * layer they were moved to.
     */
    dynacast: true,
    /*
     * Asked for, not demanded: `resolution` reaches getUserMedia as an ideal,
     * so a phone that cannot do 1080 hands back what it has. The old behaviour
     * was LiveKit's 720p default, which capped the top layer.
     */
    videoCaptureDefaults: { resolution: VideoPresets.h1080.resolution },
    publishDefaults: {
      videoEncoding: VideoPresets.h1080.encoding,
      // Two rungs under the top one, so somebody on a train still gets a
      // picture — just not this picture.
      videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
      simulcast: true,
      /*
       * A talking head is mostly a still frame. When the connection tightens,
       * dropped frames are barely visible and dropped resolution is the exact
       * thing being complained about — so drop the frames.
       */
      degradationPreference: 'maintain-resolution',
    },
  };
}
