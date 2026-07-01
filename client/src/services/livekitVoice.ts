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
  /** Phase rule forced the mic off (e.g. not your speaking turn). */
  forceMuted: boolean;
  /** Human-readable reason for the phase force-mute. */
  forceMuteReason: string | null;
  /** Local camera is publishing. */
  cameraOn: boolean;
  participants: number;
  /** Browser blocked remote audio autoplay (mobile) — needs a tap to unlock. */
  audioBlocked: boolean;
  /** Bumped on any video / active-speaker change so React re-reads the getters. */
  rev: number;
  error: string | null;
}

const INITIAL: LiveKitVoiceState = {
  status: 'disconnected', room: null, micEnabled: false, dead: false, forceMuted: false, forceMuteReason: null, cameraOn: false, participants: 0, audioBlocked: false, rev: 0, error: null,
};

// ── Module-level singleton ─────────────────────────────────────────────
let room: Room | null = null;
let state: LiveKitVoiceState = { ...INITIAL };
let currentRoomId: string | null = null;
let joinSeq = 0; // guards against races between rapid join/leave
const listeners = new Set<(s: LiveKitVoiceState) => void>();
const audioEls = new Map<string, HTMLAudioElement>();
// Remote camera video, keyed by participant identity (== player id).
let remoteVideo = new Map<string, MediaStream>();
let localVideoStream: MediaStream | null = null;
let speakingIdentities = new Set<string>();

/** Remote camera streams keyed by participant identity (player id). */
export function getLiveKitRemoteVideo(): Map<string, MediaStream> { return remoteVideo; }
export function getLiveKitLocalVideo(): MediaStream | null { return localVideoStream; }
export function getLiveKitSpeaking(): Set<string> { return speakingIdentities; }

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

function attachTrack(track: RemoteTrack, p: RemoteParticipant, sid: string) {
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach() as HTMLAudioElement;
    el.autoplay = true;
    (el as any).playsInline = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioEls.set(p.identity + ':' + sid, el);
  } else if (track.kind === Track.Kind.Video) {
    // Expose remote camera as a MediaStream for the UI's <video> tiles.
    remoteVideo.set(p.identity, new MediaStream([track.mediaStreamTrack]));
    bumpRev();
  }
}

function detachTrack(track: RemoteTrack, p: RemoteParticipant, sid: string) {
  if (track.kind === Track.Kind.Audio) {
    const el = audioEls.get(p.identity + ':' + sid);
    if (el) { el.remove(); audioEls.delete(p.identity + ':' + sid); }
  } else if (track.kind === Track.Kind.Video) {
    remoteVideo.delete(p.identity);
    bumpRev();
  }
}

function clearMedia() {
  audioEls.forEach(el => el.remove());
  audioEls.clear();
  remoteVideo = new Map();
  localVideoStream = null;
  speakingIdentities = new Set();
}

let _rev = 0;
function bumpRev() { patch({ rev: ++_rev }); }

function wireRoom(r: Room) {
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    attachTrack(track, p, pub.trackSid);
  });
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    detachTrack(track, p, pub.trackSid);
  });
  r.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
    patch({ status: mapStatus(cs) });
  });
  const updateCount = () => patch({ participants: r.numParticipants });
  r.on(RoomEvent.ParticipantConnected, updateCount);
  r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    remoteVideo.delete(p.identity);
    updateCount();
  });
  r.on(RoomEvent.Disconnected, () => { /* status handled by ConnectionStateChanged */ });
  // Mobile browsers (esp. iOS) block remote-audio autoplay until a user gesture.
  r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    patch({ audioBlocked: !r.canPlaybackAudio });
  });
  // Speaking rings.
  r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    speakingIdentities = new Set(speakers.map(s => s.identity));
    bumpRev();
  });
}

/** Unlock remote audio playback. MUST be called from a user gesture (tap). */
export async function startLiveKitAudio(): Promise<void> {
  if (!room) return;
  try { await room.startAudio(); patch({ audioBlocked: !room.canPlaybackAudio }); }
  catch { /* still blocked — user can retry */ }
}

// Cache the server's LiveKit-enabled flag so the UI can mount the voice path
// from runtime config alone (just the 3 LIVEKIT_* env vars — no client rebuild).
let _enabledCache: boolean | null = null;
/** Synchronous cached enabled flag (null until the first probe resolves). */
export function getLiveKitEnabledCached(): boolean | null { return _enabledCache; }
export async function fetchLiveKitEnabled(): Promise<boolean> {
  if (_enabledCache !== null) return _enabledCache;
  try {
    const res = await fetch(`${SERVER_URL}/livekit/status`);
    const json = await res.json();
    _enabledCache = !!json?.enabled;
  } catch { _enabledCache = false; }
  return _enabledCache;
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
    patch({ status: mapStatus(r.state), participants: r.numParticipants, audioBlocked: !r.canPlaybackAudio });

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

/** Toggle / set the local mic. Ignored while dead or phase-force-muted. */
export async function setLiveKitMic(enabled: boolean): Promise<void> {
  if (!room) return;
  if ((state.dead || state.forceMuted) && enabled) return; // locked — cannot un-mute
  await room.localParticipant.setMicrophoneEnabled(enabled);
  patch({ micEnabled: enabled });
}

/**
 * Apply a server phase rule: force-mute (lock mic off) or force-unmute (allow
 * speaking again). Mirrors the Mafia phase voice logic so LiveKit users are
 * only heard when it's their turn. Dead players stay listen-only regardless.
 */
export async function setLiveKitForceMuted(muted: boolean, reason?: string | null): Promise<void> {
  patch({ forceMuted: muted, forceMuteReason: muted ? (reason ?? null) : null });
  if (!room) return;
  if (muted) {
    await room.localParticipant.setMicrophoneEnabled(false);
    patch({ micEnabled: false });
  } else if (!state.dead) {
    // Turn comes around → go live automatically (matches the game's design).
    await room.localParticipant.setMicrophoneEnabled(true);
    patch({ micEnabled: true });
  }
}

export async function toggleLiveKitMic(): Promise<void> {
  await setLiveKitMic(!state.micEnabled);
}

/** Enable/disable the local camera (publishes video to the room). */
export async function setLiveKitCamera(enabled: boolean): Promise<void> {
  if (!room) return;
  await room.localParticipant.setCameraEnabled(enabled);
  if (enabled) {
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack?.mediaStreamTrack;
    localVideoStream = track ? new MediaStream([track]) : null;
  } else {
    localVideoStream = null;
  }
  patch({ cameraOn: enabled, rev: ++_rev });
}

export async function toggleLiveKitCamera(): Promise<void> {
  await setLiveKitCamera(!state.cameraOn);
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
  clearMedia();
  if (r) { try { await r.disconnect(); } catch { /* ignore */ } }
  patch({ ...INITIAL });
}
