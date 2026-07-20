/**
 * VOID IQ — socket handlers. Test delivery, server-authoritative scoring,
 * leaderboard, personal status, and public profile snapshots.
 * Follows the game-module pattern: registerIQHandlers(io, socket).
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerIQHandlers(io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=iq.d.ts.map