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
import { roomOptionsFor } from '@/lib/livekitRoomOptions';
import { tNow } from '@/store/langStore';
import { applyVoiceMask, resetVoiceMask, type VoiceMaskPreset } from '@/lib/voiceMask';
import { prepareCapture, setCaptureLive } from '@/lib/voiceCapture';
import type { Disguise } from '@/lib/voiceDisguise';

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
// Whether OUR microphone is currently open, so the audio session is not pulled
// out from under it by a voice post being played somewhere else in the app.
let micLive = false;
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
  // Camera off in LiveKit MUTES the publication (no unsubscribe), which would
  // leave a frozen/black <video> — drop/restore the remote stream on mute state.
  r.on(RoomEvent.TrackMuted, (pub: any, participant: any) => {
    if (pub?.kind !== Track.Kind.Video) return;
    if (participant?.isLocal) { localVideoStream = null; bumpRev(); return; }
    if (participant?.identity) { remoteVideo.delete(participant.identity); bumpRev(); }
  });
  r.on(RoomEvent.TrackUnmuted, (pub: any, participant: any) => {
    if (pub?.kind !== Track.Kind.Video) return;
    const mst = pub?.track?.mediaStreamTrack;
    if (!mst) return;
    if (participant?.isLocal) { localVideoStream = new MediaStream([mst]); bumpRev(); return; }
    if (participant?.identity) { remoteVideo.set(participant.identity, new MediaStream([mst])); bumpRev(); }
  });
  // Event-driven local self-view: the moment our camera track publishes, expose
  // it as a stream (more reliable than capturing it right after setCameraEnabled).
  r.on(RoomEvent.LocalTrackPublished, (pub: any) => {
    if (pub?.kind === Track.Kind.Video && pub?.track?.mediaStreamTrack) {
      localVideoStream = new MediaStream([pub.track.mediaStreamTrack]);
      patch({ cameraOn: true, rev: ++_rev });
    }
    // Voice Mask perk. Hooked on publish rather than on join because the mic
    // track appears at several different moments — initial join, the iOS
    // gesture retry, and every unmute that republishes — and the mask has to
    // survive all of them.
    if (pub?.kind === Track.Kind.Audio && desired()) {
      void applyVoiceMask(r, desired());
    }
  });
  r.on(RoomEvent.LocalTrackUnpublished, (pub: any) => {
    if (pub?.kind === Track.Kind.Video) { localVideoStream = null; patch({ cameraOn: false, rev: ++_rev }); }
  });
}

// ── Voice Mask / Disguise ──────────────────────────────────────────────
// The wish is kept here rather than in the component tree: the mask must be
// re-applied by LocalTrackPublished long after whatever UI set it has unmounted.
//
// TWO wishes, not one. The coin-shop pitch mask is a cosmetic; the verified
// disguise is the thing standing between a player and being recognised. If they
// shared a slot, the perk push that runs on every reconnect would quietly strip
// a disguise mid-game — so the disguise simply wins while it is on, and the
// perk comes back by itself the moment it is switched off.
let perkMask: VoiceMaskPreset | null = null;
let disguiseMask: Disguise | null = null;
/**
 * WHICH room the disguise was chosen for.
 *
 * A disguise belongs to the table you put it on, not to you. Carrying it into
 * the next room — or into a private call — was the surprise: a player picks a
 * voice for one mafia game and then rings a friend in it. So the wish is bound
 * to a room id and dropped the moment a DIFFERENT room is joined; your normal
 * voice is what every new conversation starts with.
 *
 * Null while the choice is made outside any room (the lobby strip, before the
 * game connects) — that first room adopts it rather than throwing it away.
 */
let disguiseRoom: string | null = null;
function desired(): VoiceMaskPreset | null { return disguiseMask ?? perkMask; }

/**
 * Remembered as a PAIR, never as a bare voice.
 *
 * A reload in the middle of a game must not hand the table the real voice back
 * — that is the one moment the whole disguise was for. But the voice alone,
 * remembered forever, is what made it follow players into other rooms. The
 * room it belongs to is therefore part of what is stored, and it is honoured
 * only when that same room is joined again.
 */
const DISGUISE_KEY = 'vm.incognito.voice';
function persistDisguise(): void {
  try {
    if (disguiseMask) localStorage.setItem(DISGUISE_KEY, JSON.stringify({ v: disguiseMask, r: disguiseRoom }));
    else localStorage.removeItem(DISGUISE_KEY);
  } catch { /* private mode */ }
}
(function restoreDisguise() {
  try {
    const raw = localStorage.getItem(DISGUISE_KEY);
    if (!raw) return;
    // Older builds stored the bare preset name and meant it forever. That is
    // the habit being broken, so a leftover one is dropped rather than adopted
    // by whatever room happens to be next.
    if (raw[0] !== '{') { localStorage.removeItem(DISGUISE_KEY); return; }
    const p = JSON.parse(raw);
    if (p?.v) { disguiseMask = p.v as Disguise; disguiseRoom = typeof p.r === 'string' ? p.r : null; }
  } catch { /* unreadable — no disguise is the safe default */ }
})();

// Anything showing the disguise has to hear about a drop it did not ask for.
const disguiseListeners = new Set<(d: Disguise | null) => void>();
export function onDisguiseChange(fn: (d: Disguise | null) => void): () => void {
  disguiseListeners.add(fn);
  return () => disguiseListeners.delete(fn);
}
function announceDisguise(): void { disguiseListeners.forEach(l => l(disguiseMask)); }

/** Set (or clear) the pitch mask on the local mic. Safe before the mic exists. */
export async function setLiveKitVoiceMask(preset: VoiceMaskPreset | null): Promise<void> {
  perkMask = preset;
  await applyVoiceMask(room, desired());
}

/** Set (or clear) the verified voice disguise. Overrides the perk while on. */
export async function setLiveKitDisguise(preset: Disguise | null): Promise<void> {
  disguiseMask = preset;
  disguiseRoom = preset ? currentRoomId : null;
  persistDisguise();
  await applyVoiceMask(room, desired());
}

export function getLiveKitDisguise(): Disguise | null { return disguiseMask; }

/** The preset currently wished for — used to re-apply after a reconnect. */
export function getLiveKitVoiceMask(): VoiceMaskPreset | null { return desired(); }

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

  // A disguise does not travel. Chosen with no room open, this first room
  // adopts it; chosen for some other room, it ends here — which is what makes
  // "my own voice" the state every new room and every call starts in.
  if (disguiseMask) {
    if (disguiseRoom === null) disguiseRoom = roomId;
    else if (disguiseRoom !== roomId) { disguiseMask = null; disguiseRoom = null; announceDisguise(); }
    persistDisguise();
  }
  patch({ status: 'connecting', room: roomId, dead: !alive, micEnabled: false, error: null });

  try {
    const { token, url } = await fetchToken(identity, roomId, alive);
    if (seq !== joinSeq) return; // a newer join/leave superseded us

    const r = new Room(roomOptionsFor(roomId));
    wireRoom(r);
    await r.connect(url, token);
    if (seq !== joinSeq) { r.disconnect(); return; }

    room = r;
    patch({ status: mapStatus(r.state), participants: r.numParticipants, audioBlocked: !r.canPlaybackAudio });

    // Alive players publish their mic on by default; dead players stay muted.
    if (alive) {
      try {
        // Safari refuses capture outright while its audio session is in the
        // 'playback' category — which is where playing any voice clip leaves it.
        prepareCapture();
        await r.localParticipant.setMicrophoneEnabled(true);
        setCaptureLive(true);
        micLive = true;
        patch({ micEnabled: true });
      } catch (micErr: any) {
        // iOS blocks getUserMedia outside a user gesture. The ROOM connection
        // succeeded — stay connected in listen mode (no scary raw browser
        // error) and grab the mic automatically on the first tap.
        patch({ micEnabled: false, error: null });
        armLiveKitMicGestureRetry(r);
        void micErr;
      }
    }
  } catch (e: any) {
    if (seq === joinSeq) {
      patch({ status: 'disconnected', error: friendlyLiveKitError(e) });
      currentRoomId = null;
    }
    throw e;
  }
}

/** Map raw browser/LiveKit errors to something a player can act on. */
function friendlyLiveKitError(e: any): string {
  const raw = String(e?.message ?? '');
  // getUserMedia permission denial (a real, user-actionable block).
  if (/not allowed by the user agent|denied permission|NotAllowed|Permission denied/i.test(raw)) {
    return tNow().misc.micBlockedTap;
  }
  if (/NotReadable|in use/i.test(raw)) {
    return tNow().misc.micBusy;
  }
  // Safari's session category. prepareCapture() clears this before every mic
  // grab; if it still shows up, the page has an audio route it will not give
  // back, and a reload is genuinely the fix.
  if (/AudioSession/i.test(raw)) {
    return 'ხმის სესია დაკავებულია — გადატვირთე გვერდი';
  }
  // LiveKit publish-permission / "insufficient permissions" errors are NOT
  // user-actionable and self-heal (fresh token grants publish + reconnect
  // retry). Never show them — they only confuse. Log-only.
  if (/insufficient permission|not allowed to publish|failed to publish|permissions/i.test(raw)) {
    console.warn('[livekit] suppressed publish-permission error:', raw);
    return '';
  }
  return raw || 'Voice connection failed.';
}

/** One-shot: enable the mic on the next user tap (getUserMedia needs a gesture on iOS). */
function armLiveKitMicGestureRetry(r: Room): void {
  const retry = () => {
    document.removeEventListener('touchend', retry);
    document.removeEventListener('click', retry);
    if (room !== r || state.dead || state.forceMuted || state.micEnabled) return;
    prepareCapture();
    r.localParticipant.setMicrophoneEnabled(true)
      .then(() => patch({ micEnabled: true, error: null }))
      .catch(() => { /* the 🎙 button remains as the manual path */ });
  };
  document.addEventListener('touchend', retry, { once: true, passive: true });
  document.addEventListener('click', retry, { once: true });
}

/** Toggle / set the local mic. Ignored while dead or phase-force-muted. */
export async function setLiveKitMic(enabled: boolean): Promise<void> {
  if (!room) return;
  if ((state.dead || state.forceMuted) && enabled) return; // locked — cannot un-mute
  try {
    if (enabled) prepareCapture();
    await room.localParticipant.setMicrophoneEnabled(enabled);
    if (enabled !== micLive) { setCaptureLive(enabled); micLive = enabled; }
    patch({ micEnabled: enabled, error: null });
  } catch (e: any) {
    // "insufficient permissions" means this connection is holding a stale token
    // that was issued without publish rights (e.g. joined earlier as a
    // spectator/dead). Reconnect once to fetch a fresh (publish-granted) token,
    // then retry — so the mic self-heals instead of erroring out.
    const raw = String(e?.message ?? '');
    if (enabled && !_micPermRetry && /insufficient permission|permission|not allowed to publish/i.test(raw)) {
      _micPermRetry = true;
      const rid = currentRoomId, id = room.localParticipant.identity, wasDead = state.dead;
      try {
        await leaveLiveKitVoice();
        if (rid) await joinLiveKitVoice(id, rid, { alive: !wasDead });
        await new Promise(r => setTimeout(r, 250));
        if (room) { prepareCapture(); await room.localParticipant.setMicrophoneEnabled(true); patch({ micEnabled: true, error: null }); }
      } catch { patch({ micEnabled: false, error: friendlyLiveKitError(e) }); }
      finally { _micPermRetry = false; }
      return;
    }
    if (enabled) patch({ micEnabled: false, error: friendlyLiveKitError(e) });
    else patch({ micEnabled: false });
  }
}
let _micPermRetry = false;

/**
 * Apply a server phase rule: force-mute (lock mic off) or force-unmute (allow
 * speaking again). Mirrors the Mafia phase voice logic so LiveKit users are
 * only heard when it's their turn. Dead players stay listen-only regardless.
 */
export async function setLiveKitForceMuted(muted: boolean, reason?: string | null): Promise<void> {
  patch({ forceMuted: muted, forceMuteReason: muted ? (reason ?? null) : null });
  if (!room) return;
  if (muted) {
    try { await room.localParticipant.setMicrophoneEnabled(false); } catch { /* already off */ }
    patch({ micEnabled: false });
  } else if (!state.dead) {
    // Turn comes around → go live automatically (matches the game's design).
    try {
      prepareCapture();
      await room.localParticipant.setMicrophoneEnabled(true);
      patch({ micEnabled: true, error: null });
    } catch {
      // No gesture available (iOS) — retry on the next tap instead of erroring.
      patch({ micEnabled: false });
      if (room) armLiveKitMicGestureRetry(room);
    }
  }
}

export async function toggleLiveKitMic(): Promise<void> {
  await setLiveKitMic(!state.micEnabled);
}

/**
 * Enable/disable the local camera (publishes video to the room).
 *
 * `facingMode` re-acquires from the other lens, which is what a flip is: there
 * is no way to turn a published front-camera track around, so the capture is
 * replaced. Calling it while already on is how a host switches mid-broadcast.
 */
export async function setLiveKitCamera(
  enabled: boolean,
  opts?: { facingMode?: 'user' | 'environment' },
): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setCameraEnabled(
      enabled,
      opts?.facingMode ? { facingMode: opts.facingMode } : undefined,
    );
  } catch (e: any) {
    patch({ error: friendlyLiveKitError(e), rev: ++_rev });
    return;
  }
  if (enabled) {
    // Capture the published track for the local self-view. Try the direct
    // publication first, then scan all video publications (API/timing safety);
    // the LocalTrackPublished handler in wireRoom covers any remaining gap.
    const lp: any = room.localParticipant;
    const pub = lp.getTrackPublication?.(Track.Source.Camera) ?? lp.getTrack?.(Track.Source.Camera);
    let track: MediaStreamTrack | undefined = pub?.videoTrack?.mediaStreamTrack ?? pub?.track?.mediaStreamTrack;
    if (!track && lp.videoTrackPublications) {
      for (const p of lp.videoTrackPublications.values()) {
        if (p?.source === Track.Source.Camera && p?.track?.mediaStreamTrack) { track = p.track.mediaStreamTrack; break; }
      }
    }
    if (track) localVideoStream = new MediaStream([track]);
  } else {
    localVideoStream = null;
  }
  patch({ cameraOn: enabled, error: null, rev: ++_rev });
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
  if (micLive) { setCaptureLive(false); micLive = false; }
  joinSeq++; // cancel any in-flight join
  currentRoomId = null;
  const r = room;
  room = null;
  clearMedia();
  // The processor belonged to a track that is about to go away; forget it so
  // the next join attaches a fresh one instead of retuning a dead graph.
  resetVoiceMask();
  if (r) { try { await r.disconnect(); } catch { /* ignore */ } }
  patch({ ...INITIAL });
}
