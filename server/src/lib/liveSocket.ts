import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
} from '../types/index.js';

type AnySocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AnyServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Find the socket a player is REACHABLE on right now.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every match service stores the socket id a player joined with, and every
 * broadcast then emits to that id. A phone that locks its screen, drops to a
 * lift, or switches from wifi to mobile data gets a NEW socket id when it comes
 * back — and the stored one is now a dead handle. Nothing errors: the emit
 * simply goes nowhere.
 *
 * The player's screen therefore freezes on whatever it last received. They can
 * still be HEARD, because LiveKit is a separate connection that reconnects on
 * its own, so from the table it looks like someone who has gone quiet and
 * stopped answering — not like someone who has been cut off. That is exactly
 * the failure that was reported in ტყუილების ოსტატი.
 *
 * The fix is to resolve the socket by identity, not by a remembered handle: the
 * profile id is stable across reconnects, the socket id is not.
 */
export function socketForUser(io: AnyServer, userId: string, storedSocketId: string): AnySocket | null {
  const direct = io.sockets.sockets.get(storedSocketId);
  if (direct && direct.connected) return direct;
  // Anonymous players are identified BY their socket id, so a lost socket is a
  // lost player — there is nothing stable to search for.
  if (!userId || userId === storedSocketId) return null;
  for (const s of io.sockets.sockets.values()) {
    if (s.connected && s.data?.profileId === userId) return s;
  }
  return null;
}

/**
 * Emit per-viewer state to every player in a match, healing stale socket ids on
 * the way.
 *
 * `rebind` is called when a player turns out to be on a different socket than
 * the one stored, so the service can re-point the row and mark them connected
 * again — a reconnected player has to count as present, or the round will keep
 * closing without them.
 */
export function emitToPlayers<P extends { userId: string; socketId: string }>(
  io: AnyServer,
  players: P[],
  event: string,
  payload: (p: P) => unknown,
  rebind?: (p: P, socketId: string) => void,
): void {
  for (const p of players) {
    const s = socketForUser(io, p.userId, p.socketId);
    if (!s) continue;
    if (s.id !== p.socketId) rebind?.(p, s.id);
    s.emit(event as any, payload(p) as any);
  }
}
