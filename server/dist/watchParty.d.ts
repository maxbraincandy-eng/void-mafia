/**
 * Watch Party — socket handlers (`wp:*` events).
 *
 * Standalone co-watching rooms. The host drives playback and the server holds
 * the authoritative position, so every viewer stays in sync and late joiners
 * jump to the current moment. Voice/video is the shared LiveKit room on the
 * client (`watchparty_<matchId>`); no media code here. Mirrors the
 * lies/spyfall/sxvaMafia socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerWatchPartyHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleWatchPartyDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=watchParty.d.ts.map