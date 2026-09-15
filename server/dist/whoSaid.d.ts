/**
 * ვინ თქვა? — socket handlers and the two phase clocks.
 *
 * Follows the ჯაშუში module: a room per match, per-viewer state resolved by
 * identity so a reconnected player keeps receiving it, and timers keyed on
 * `endsAt` so a stale one cannot fire into a round that has already moved on.
 *
 * Both clocks are here rather than in the service because the service is pure
 * and testable without them, which is the only reason its rules could be
 * checked at all.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
import { READ_SECONDS, VOTE_SECONDS } from './services/whoSaidPhrases.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerWhoSaidHandlers(io: AppServer, socket: AppSocket): void;
export { READ_SECONDS, VOTE_SECONDS };
//# sourceMappingURL=whoSaid.d.ts.map