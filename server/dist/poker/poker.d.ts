/**
 * Social poker — the Socket.IO layer.
 *
 * WHAT IT DOES
 * ────────────
 * Turns socket messages into table-service calls, and table-service events into
 * socket emits. That is all it does. It holds no game state, decides no rules,
 * and computes nothing about a hand — if you find yourself wanting to read a
 * card in this file, the design has gone wrong.
 *
 * THE FOUR THINGS IT IS RESPONSIBLE FOR
 * ─────────────────────────────────────
 * 1. **Identity.** Every call is attributed to `socket.data.profileId`. Nothing
 *    is ever attributed to a player id in a payload, because a payload is
 *    written by the client and a client may lie about who it is.
 * 2. **Rate limiting.** Per profile, per action, token buckets. Keyed on the
 *    profile so reconnecting is not a way round it.
 * 3. **Routing.** A player's state goes to every socket that player has open,
 *    resolved by identity, so a reconnected phone is reachable again straight
 *    away instead of receiving into a dead handle.
 * 4. **Refusing.** Errors come back as codes on the acknowledgement, and every
 *    refusal is audited. A rejected action is an incident, not an outcome.
 *
 * SECURITY NOTES
 * ──────────────
 * * Poker requires a signed-in profile. Anonymous sockets are refused, because
 *   a seat, a hand history and a leaderboard row all need an identity that
 *   survives a reconnect, and `socket.id` does not.
 * * Payload fields are read defensively: anything numeric is `Math.floor`ed and
 *   bounded, anything textual is trimmed and truncated before it goes anywhere.
 * * The state a client receives is built per viewer by `views.ts`. This file
 *   never assembles a payload containing a card.
 */
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '../types/index.js';
import { PokerTableService } from './services/tableService.js';
import type { AuditEntry, HandHistory } from './services/types.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
/** Poker is off unless the deployment turns it on. See `03-testing-and-deployment.md`. */
export declare function pokerEnabled(): boolean;
/** Hooks the persistence layer fills in (stage 5). Absent means "not stored". */
export interface PokerSinks {
    audit?: (entry: AuditEntry) => void;
    history?: (history: HandHistory) => void;
}
export declare function setPokerSinks(next: PokerSinks): void;
export declare function registerPokerHandlers(io: AppServer, socket: AppSocket): void;
/**
 * A socket went away.
 *
 * The seat is NOT released here. A player with another tab open is still
 * present, and a player with no tab open gets the grace period the table
 * service runs — releasing a seat the moment a socket blinks would cost people
 * their seat every time they locked their phone.
 */
export declare function handlePokerDisconnect(_io: AppServer, socket: AppSocket): void;
/** Process shutdown. */
export declare function shutdownPoker(): void;
/** Test seam: the live service, or null if poker has never been registered. */
export declare function pokerService(): PokerTableService | null;
export {};
//# sourceMappingURL=poker.d.ts.map