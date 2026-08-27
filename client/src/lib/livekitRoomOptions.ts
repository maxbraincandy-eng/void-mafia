/**
 * How a LiveKit room should be configured, by what kind of room it is.
 *
 * ADAPTIVE STREAM IS OFF, AND NOT FOR THE REASON YOU WOULD GUESS
 * ─────────────────────────────────────────────────────────────
 * Adaptive stream sizes a video subscription to the `<video>` element showing
 * it, and pauses it when that element scrolls away. It learns both of those
 * things from elements registered by `track.attach(el)`.
 *
 * This app never calls it. `livekitVoice.ts` takes `track.mediaStreamTrack`,
 * wraps it in a `MediaStream` of its own and hands that to React, which sets it
 * as `srcObject`. Sensible, and it means LiveKit is never told which element —
 * if any — a remote video ended up in.
 *
 * So adaptive stream had no elements to observe, which cost nothing until the
 * app was backgrounded. `RemoteVideoTrack.handleAppVisibilityChanged` fires on
 * every `document.visibilitychange` and recomputes visibility as
 * `elementInfos.some(info => info.visible)` — over an empty array, which is
 * `false`. The publication then tells the SFU `disabled: true` and the video
 * stops. Nothing ever turns it back on, because there are no elements left to
 * become visible again: switch apps once, come back, and the picture is gone
 * for the rest of the session.
 *
 * It was doing no work and holding a loaded gun. Off.
 *
 * If remote video is ever attached through `track.attach(el)` instead, this is
 * worth revisiting — that is the version of adaptive stream that actually saves
 * a phone from decoding twenty tiles it cannot see.
 *
 * WHY A BROADCAST IS CONFIGURED APART
 * ───────────────────────────────────
 * The reported symptom was "sharp on my phone, blurry on theirs", and most of
 * that gap is not a bug at all: a host's self-view is the raw camera track,
 * painted straight from the capture with no encoder anywhere in the path. It
 * cannot look worse. Everybody else is watching an encode of it, and the encode
 * was running at LiveKit's unset defaults — 720p capture, and a bitrate derived
 * from that. On a phone screen filled by one video, that is visibly soft.
 *
 * So a broadcast captures and publishes higher than a voice tile does. The gap
 * to the self-view will never fully close; there is a lot of room between 720p
 * at 1.7 Mbps and 1080p at 3.
 *
 * WHY THIS IS ITS OWN FILE
 * ────────────────────────
 * It is a policy decision, and policy decisions are worth being able to assert
 * about. `livekitVoice.ts` reaches for the browser the moment it is imported;
 * this is a function from a string to an object, with a test beside it.
 */

import { VideoPresets, type RoomOptions } from 'livekit-client';

/**
 * A broadcast room, by name.
 *
 * Mirrors `roomFor` on the server — `live_<sessionId>` — which is derived and
 * never stored, so this reads the same rule rather than duplicating state.
 */
export function isBroadcastRoom(roomId: string): boolean {
  return roomId.startsWith('live_');
}

export function roomOptionsFor(roomId: string): RoomOptions {
  const base: RoomOptions = {
    // See the note above: with no attached elements this only ever disabled
    // video, it never sized it.
    adaptiveStream: false,
    /*
     * Dynacast stays on everywhere. It pauses simulcast layers nobody is
     * subscribed to, so a host with no viewers is not encoding three
     * resolutions into an empty room off their battery — and the decision is
     * the server's, made from real subscriber demand, so a viewer moved down a
     * layer by congestion still gets the one they were moved to.
     */
    dynacast: true,
  };

  // A voice tile is a face the size of a stamp. LiveKit's defaults are already
  // more than that needs, and twenty of them share one phone's encoder.
  if (!isBroadcastRoom(roomId)) return base;

  return {
    ...base,
    /*
     * Asked for, not demanded: `resolution` reaches getUserMedia as an ideal,
     * so a phone that cannot manage 1080 hands back what it has. The previous
     * behaviour was LiveKit's unset default of 720p.
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
