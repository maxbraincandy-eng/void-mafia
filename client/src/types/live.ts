/**
 * Going live.
 *
 * Mirrors `server/src/services/liveService.ts`.
 */

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
  /** A room code, when the broadcast is attached to a game. */
  gameContext: string | null;
  status: LiveStatus;
  startedAt: number;
  endedAt: number | null;
  viewers: number;
  peakViewers: number;
  totalViewers: number;
  totalHearts: number;
  /** Coins sent as gifts, paid to the host when the broadcast ends. */
  giftCoins: number;
  giftCount: number;
  /** The LiveKit room to join — derived server-side from the id. */
  room: string;
}

/** One line in the comment overlay. Never persisted; the stream is the moment. */
export interface LiveComment {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  avatarUrl?: string | null;
  text: string;
  at: number;
  /** Drawn differently: the host answering is the thread of the conversation. */
  isHost?: boolean;
  /** Shown at once and reconciled when the server echoes it back. */
  pending?: boolean;
}

/** Somebody in the room, as the host's viewer list draws them. */
export interface LiveViewer {
  userId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
}

/** A gift arriving, as everybody in the room is told about it. */
export interface LiveGiftEvent {
  giftId: string;
  coins: number;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderAvatarUrl: string | null;
  /** The session's running totals, so nothing has to ask again. */
  giftCoins: number;
  giftCount: number;
}

/** Who sent the most this broadcast — by coins, not by taps. */
export interface LiveGifter {
  userId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  coins: number;
  gifts: number;
}

/** How often the host tells the server it is still there. */
export const LIVE_BEAT_MS = 15_000;

/**
 * The LiveKit room a session broadcasts in.
 *
 * Mirrors `roomFor` in `server/src/services/liveService.ts`, where it is
 * derived from the id and never stored — one less thing to desync. Derived
 * here for the same reason plus one more: it means a viewer can start opening
 * the media connection the instant they tap, instead of waiting for a socket
 * round trip to hand back a string it could have computed itself.
 */
export function liveRoomFor(sessionId: string): string {
  return `live_${sessionId}`;
}
