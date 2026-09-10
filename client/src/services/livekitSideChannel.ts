/**
 * A second, audio-only LiveKit room — the one the mafia whisper in.
 *
 * WHY A SECOND ROOM AT ALL
 * ────────────────────────
 * Everything else in a match lives in one room, which is right for a table and
 * wrong for a conspiracy. Audio published there reaches every participant, and
 * a client that politely declines to subscribe changes nothing about what the
 * server is sending — a social deduction game cannot rest its hidden
 * information on the town's own browser choosing not to listen.
 *
 * So the mafia get a room the town is not in. There is nothing to intercept,
 * because there is nothing sent to them. The token comes from the socket, which
 * knows who is asking; the open HTTP route refuses these rooms outright.
 *
 * WHY IT IS NOT THE MAIN SERVICE WITH A FLAG
 * ──────────────────────────────────────────
 * `livekitVoice` is a singleton holding one Room, and both channels have to be
 * live at once — the mafia still see the table's video and still hear the
 * moderator while they talk to each other. Generalising that singleton to hold
 * two rooms would put a "which room?" argument on every function in it, for one
 * caller. This is a hundred lines that does one thing.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ────────────────────────────────
 * No video, ever — publishing or subscribing. The tiles are the main room's
 * job, and a second camera publish would double every phone's encoding for a
 * picture nobody would look at.
 */

import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from 'livekit-client';

export type SideRole = 'speak' | 'listen';

export interface SideChannelState {
  /** Connected and in the room. */
  connected: boolean;
  /** What this participant is allowed to do here. */
  role: SideRole | null;
  /** Our own microphone is open in THIS room. */
  micOn: boolean;
  /** Identities heard speaking, for the UI. */
  speaking: Set<string>;
  /** How many others are in here. */
  peers: number;
  error: string | null;
  /** Bumped on any change, so React re-reads. */
  rev: number;
}

const INITIAL: SideChannelState = {
  connected: false, role: null, micOn: false, speaking: new Set(), peers: 0, error: null, rev: 0,
};

let room: Room | null = null;
let state: SideChannelState = { ...INITIAL };
let currentRoomName: string | null = null;
/** Guards against a slow join landing after we have already been told to leave. */
let seq = 0;
const listeners = new Set<(s: SideChannelState) => void>();
const audioEls = new Map<string, HTMLAudioElement>();

function patch(p: Partial<SideChannelState>): void {
  state = { ...state, ...p, rev: state.rev + 1 };
  listeners.forEach(l => l(state));
}

export function getSideChannel(): SideChannelState { return state; }

export function subscribeSideChannel(l: (s: SideChannelState) => void): () => void {
  listeners.add(l);
  l(state);
  return () => { listeners.delete(l); };
}

function clearAudio(): void {
  audioEls.forEach(el => { el.pause(); el.remove(); });
  audioEls.clear();
}

function wire(r: Room): void {
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, p: RemoteParticipant) => {
    // Audio only. A video track here would be a bug upstream; ignoring it is
    // cheaper than trusting that it never happens.
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach() as HTMLAudioElement;
    el.autoplay = true;
    (el as any).playsInline = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioEls.set(p.identity, el);
    patch({ peers: r.numParticipants });
  });
  r.on(RoomEvent.TrackUnsubscribed, (_t, _pub, p: RemoteParticipant) => {
    const el = audioEls.get(p.identity);
    if (el) { el.pause(); el.remove(); audioEls.delete(p.identity); }
    patch({ peers: r.numParticipants });
  });
  r.on(RoomEvent.ActiveSpeakersChanged, speakers => {
    patch({ speaking: new Set(speakers.map(s => s.identity)) });
  });
  const count = () => patch({ peers: r.numParticipants });
  r.on(RoomEvent.ParticipantConnected, count);
  r.on(RoomEvent.ParticipantDisconnected, count);
  r.on(RoomEvent.Disconnected, () => {
    clearAudio();
    patch({ connected: false, micOn: false, speaking: new Set(), peers: 0 });
  });
}

/**
 * Join, or stay where we are if this is already the room we are in.
 *
 * Idempotent on purpose: the caller is an effect keyed on the match phase, and
 * a re-render must not tear down a live channel and rebuild it mid-sentence.
 */
export async function joinSideChannel(o: {
  room: string; token: string; url: string; role: SideRole;
}): Promise<void> {
  if (currentRoomName === o.room && room && state.connected) {
    if (state.role !== o.role) patch({ role: o.role });
    return;
  }
  const mine = ++seq;
  await leaveSideChannel();
  if (mine !== seq) return;

  const r = new Room({ adaptiveStream: false, dynacast: false });
  wire(r);
  try {
    await r.connect(o.url, o.token);
  } catch (e: any) {
    if (mine !== seq) return;
    patch({ error: e?.message ?? 'ვერ დაუკავშირდა', connected: false });
    return;
  }
  // Told to leave while the handshake was in flight.
  if (mine !== seq) { await r.disconnect().catch(() => {}); return; }

  room = r;
  currentRoomName = o.room;
  patch({ connected: true, role: o.role, error: null, peers: r.numParticipants, micOn: false });
}

export async function leaveSideChannel(): Promise<void> {
  seq++;
  const r = room;
  room = null;
  currentRoomName = null;
  clearAudio();
  patch({ ...INITIAL, rev: state.rev });
  if (r) await r.disconnect().catch(() => {});
}

/**
 * Open or close our microphone in this room.
 *
 * A listener is refused rather than quietly ignored: the moderator is in here
 * to hear the whispering, and a moderator who could speak into it would be
 * answering the mafia on a line the town cannot hear.
 */
export async function setSideChannelMic(on: boolean): Promise<void> {
  if (!room || !state.connected) return;
  if (on && state.role !== 'speak') return;
  try {
    await room.localParticipant.setMicrophoneEnabled(on);
    patch({ micOn: on });
  } catch (e: any) {
    patch({ error: e?.message ?? 'მიკროფონი ვერ ჩაირთო' });
  }
}

/** Is a given identity currently talking in here? */
export function sideChannelSpeaking(): Set<string> { return state.speaking; }
