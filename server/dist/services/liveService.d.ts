/**
 * Going live.
 *
 * THE INFRASTRUCTURE QUESTION IS ALREADY ANSWERED
 * ───────────────────────────────────────────────
 * The spec flags "WebRTC for the MVP, or a managed provider" as a decision
 * needing a cost discussion. It is not open: LiveKit is already integrated,
 * already carries every voice room in the app, and `/livekit/status` answers
 * `enabled: true` in production. Building a second WebRTC path beside it would
 * mean two signalling systems, two sets of TURN problems and two things to fix
 * when a phone drops off wifi — for a feature the existing one already serves.
 *
 * So a broadcast is a LiveKit room like every other, named `live_<sessionId>`,
 * with one publisher. The rooms need no new server, no new key and no new bill.
 *
 * WHAT THIS SERVICE OWNS
 * ──────────────────────
 * Not the media — LiveKit has that. This owns the part LiveKit does not: who is
 * live, what they called it, who may watch, how many are watching, what the
 * peak was, and the summary at the end.
 *
 * LIVE IS A HEARTBEAT, NOT A FLAG
 * ───────────────────────────────
 * A host whose phone dies never sends "I stopped". If live meant `ended_at IS
 * NULL` their avatar would wear a LIVE ring until somebody noticed, and tapping
 * it would open an empty room. So a session is live only while it is still
 * beating, and one that stops is reaped.
 */
/** Longer than the client's beat, short enough that a dead stream clears fast. */
export declare const BEAT_TIMEOUT_MS = 45000;
/** What the client should aim for. Three misses inside the timeout. */
export declare const BEAT_INTERVAL_MS = 15000;
export type LiveVisibility = 'public' | 'friends';
export type LiveStatus = 'live' | 'ended';
export interface LiveSession {
    id: string;
    hostId: string;
    hostName: string;
    hostAvatar: string;
    hostAvatarUrl: string | null;
    title: string;
    visibility: LiveVisibility;
    /** "Playing mafia — join me": a room code, or null. */
    gameContext: string | null;
    status: LiveStatus;
    startedAt: number;
    endedAt: number | null;
    viewers: number;
    peakViewers: number;
    totalViewers: number;
    totalHearts: number;
    /** The LiveKit room to join. Derived, never stored — one less thing to desync. */
    room: string;
}
/** The LiveKit room a session broadcasts in. */
export declare function roomFor(sessionId: string): string;
/**
 * Go live.
 *
 * One broadcast per person. Starting a second ends the first rather than
 * refusing: the usual way to get here twice is a host whose app was killed and
 * reopened, and telling them "you are already live" when they can see they are
 * not is worse than quietly replacing a session nobody is watching.
 */
export declare function startLive(hostId: string, opts: {
    title?: string;
    visibility?: LiveVisibility;
    gameContext?: string | null;
}): Promise<LiveSession>;
/**
 * Stop broadcasting, and return the summary.
 *
 * Idempotent: ending an already-ended session returns what it was rather than
 * failing, because "end" arrives from the button, from the socket closing and
 * from the reaper, and any two of them can race.
 */
export declare function endLive(hostId: string, opts?: {
    reason?: string;
}): Promise<LiveSession | null>;
/**
 * "Still here."
 *
 * Returns false when the session is gone, which is the client's signal to stop
 * showing a broadcast screen for a stream that no longer exists.
 */
export declare function beat(hostId: string): Promise<boolean>;
/**
 * End every session that has stopped beating.
 *
 * The one thing standing between a host whose battery died and an avatar that
 * wears a LIVE ring until somebody files a bug.
 */
export declare function reapStale(): Promise<number>;
/**
 * Join as a viewer.
 *
 * Peak concurrency is recorded here because it can only be observed while it is
 * happening — no counter recovers it afterwards. `total_viewers` counts people,
 * not joins, so somebody whose train goes into a tunnel does not inflate it.
 */
export declare function joinLive(sessionId: string, userId: string): Promise<LiveSession | null>;
export declare function leaveLive(sessionId: string, userId: string): Promise<number>;
/** Somebody left the app entirely — drop them from whatever they were watching. */
export declare function forgetViewer(userId: string): string[];
/**
 * A heart.
 *
 * Counted, not stored. At a few taps a second per viewer the individual
 * reactions are worth nothing an hour later and a great deal of write traffic
 * now — the burst is the point, and the burst is broadcast, not persisted.
 */
export declare function addHearts(sessionId: string, n?: number): Promise<void>;
export declare function getSession(sessionId: string): Promise<LiveSession | null>;
/** Everybody broadcasting right now, newest first. */
export declare function listLive(limit?: number): Promise<LiveSession[]>;
/**
 * Which of these people are live, in one question.
 *
 * The badge renders beside every name in the feed, the friend list and every
 * lobby. Asking per avatar is how a list becomes slow, so the client batches
 * and this answers the batch.
 */
export declare function liveMap(userIds: string[]): Promise<Record<string, {
    sessionId: string;
    title: string;
    viewers: number;
}>>;
/** The host's own live session, if they have one. */
export declare function myLive(hostId: string): Promise<LiveSession | null>;
//# sourceMappingURL=liveService.d.ts.map