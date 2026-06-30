/**
 * livekitVoice — reusable LiveKit voice client (module-level singleton).
 *
 * One LiveKit Room at a time. The session lives outside React so it survives
 * component remounts (Lobby → Game transitions), mirroring webrtcService.
 *
 * Flow:
 *   1. fetch a token from the backend (GET /livekit/token)
 *   2. connect with livekit-client using { token, url } from the response
 *   3. remote audio tracks auto-attach to hidden <audio> elements
 *
 * NAT traversal (mobile data ↔ WiFi) is handled by the LiveKit server's
 * ICE/TURN — no app-side TURN config needed.
 */
import {
  Room, RoomEvent, Track, ConnectionState,
  type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant,
} from 'livekit-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export type LiveKitStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LiveKitVoiceState {
  status: LiveKitStatus;
  room: string | null;
  /** User wants their mic on (subject to `dead` lock below). */
  micEnabled: boolean;
  /** Server forced listen-only (dead player) — mic cannot be turned on. */
  dead: boolean;
  participants: number;
  error: string | null;
}

const INITIAL: LiveKitVoiceState = {
  status: 'disconnected', room: null, micEnabled: false, dead: false, participants: 0, error: null,
};

// ── Module-level singleton ─────────────────────────────────────────────
let room: Room | null = null;
let state: LiveKitVoiceState = { ...INITIAL };
let currentRoomId: string | null = null;
let joinSeq = 0; // guards against races between rapid join/leave
const listeners = new Set<(s: LiveKitVoiceState) => void>();
const audioEls = new Map<string, HTMLAudioElement>();

function patch(p: Partial<LiveKitVoiceState>) {
  state = { ...state, ...p };
  listeners.forEach(l => l(state));
}

export function getLiveKitState(): LiveKitVoiceState { return state; }

export function subscribeLiveKit(l: (s: LiveKitVoiceState) => void): () => void {
  listeners.add(l); l(state);
  return () => listeners.delete(l);
}

function mapStatus(cs: ConnectionState): LiveKitStatus {
  switch (cs) {
    case ConnectionState.Connecting:   return 'connecting';
    case ConnectionState.Connected:    return 'connected';
    case ConnectionState.Reconnecting: return 'reconnecting';
    default:                           return 'disconnected';
  }
}

function attachTrack(track: RemoteTrack, id: string) {
  if (track.kind !== Track.Kind.Audio) return;
  const el = track.attach() as HTMLAudioElement;
  el.autoplay = true;
  (el as any).playsInline = true;
  el.style.display = 'none';
  document.body.appendChild(el);
  audioEls.set(id, el);
}

function detachTrack(id: string) {
  const el = audioEls.get(id);
  if (el) { el.remove(); audioEls.delete(id); }
}

function clearAudio() {
  audioEls.forEach(el => el.remove());
  audioEls.clear();
}

function wireRoom(r: Room) {
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    attachTrack(track, p.identity + ':' + pub.trackSid);
  });
  r.on(RoomEvent.TrackUnsubscribed, (_t: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    detachTrack(p.identity + ':' + pub.trackSid);
  });
  r.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
    patch({ status: mapStatus(cs) });
  });
  const updateCount = () => patch({ participants: r.numParticipants });
  r.on(RoomEvent.ParticipantConnected, updateCount);
  r.on(RoomEvent.ParticipantDisconnected, updateCount);
  r.on(RoomEvent.Disconnected, () => { /* status handled by ConnectionStateChanged */ });
}

async function fetchToken(identity: string, roomId: string, canPublish: boolean): Promise<{ token: string; url: string }> {
  const qs = new URLSearchParams({ identity, room: roomId, canPublish: canPublish ? '1' : '0' });
  const res = await fetch(`${SERVER_URL}/livekit/token?${qs.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json.token || !json.url) {
    throw new Error(json?.error || 'Failed to get voice token.');
  }
  return { token: json.token, url: json.url };
}

export interface JoinVoiceOpts {
  /** false → join muted & listen-only (player already dead). */
  alive?: boolean;
}

/**
 * Join the LiveKit room for `roomId` as `identity`. Idempotent for the same
 * room; switching rooms leaves the previous one first. livekit-client handles
 * auto-reconnect internally.
 */
export async function joinLiveKitVoice(identity: string, roomId: string, opts: JoinVoiceOpts = {}): Promise<void> {
  if (currentRoomId === roomId && room && room.state !== ConnectionState.Disconnected) {
    return; // already in this room
  }
  await leaveLiveKitVoice();

  const seq = ++joinSeq;
  const alive = opts.alive !== false;
  currentRoomId = roomId;
  patch({ status: 'connecting', room: roomId, dead: !alive, micEnabled: false, error: null });

  try {
    const { token, url } = await fetchToken(identity, roomId, alive);
    if (seq !== joinSeq) return; // a newer join/leave superseded us

    const r = new Room({ adaptiveStream: true, dynacast: true });
    wireRoom(r);
    await r.connect(url, token);
    if (seq !== joinSeq) { r.disconnect(); return; }

    room = r;
    patch({ status: mapStatus(r.state), participants: r.numParticipants });

    // Alive players publish their mic on by default; dead players stay muted.
    if (alive) {
      await r.localParticipant.setMicrophoneEnabled(true);
      patch({ micEnabled: true });
    }
  } catch (e: any) {
    if (seq === joinSeq) {
      patch({ status: 'disconnected', error: e?.message || 'Voice connection failed.' });
      currentRoomId = null;
    }
    throw e;
  }
}

/** Toggle / set the local mic. Ignored while dead (listen-only). */
export async function setLiveKitMic(enabled: boolean): Promise<void> {
  if (!room) return;
  if (state.dead && enabled) return; // dead players cannot un-mute
  await room.localParticipant.setMicrophoneEnabled(enabled);
  patch({ micEnabled: enabled });
}

export async function toggleLiveKitMic(): Promise<void> {
  await setLiveKitMic(!state.micEnabled);
}

/**
 * Mark the local player dead → force-mute and lock the mic (can still hear).
 * Pass false to revert (e.g. revive / next game).
 */
export async function setLiveKitDead(dead: boolean): Promise<void> {
  patch({ dead });
  if (dead && room) {
    await room.localParticipant.setMicrophoneEnabled(false);
    patch({ micEnabled: false });
  }
}

/** Leave the current room and clean up all remote audio elements. */
export async function leaveLiveKitVoice(): Promise<void> {
  joinSeq++; // cancel any in-flight join
  currentRoomId = null;
  const r = room;
  room = null;
  clearAudio();
  if (r) { try { await r.disconnect(); } catch { /* ignore */ } }
  patch({ ...INITIAL });
}
