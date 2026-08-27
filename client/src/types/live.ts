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

/** How often the host tells the server it is still there. */
export const LIVE_BEAT_MS = 15_000;
