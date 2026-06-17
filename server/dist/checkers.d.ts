/**
 * Checkers mini-game socket handlers.
 * Completely separate from Mafia rooms.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerCheckersHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleCheckersDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=checkers.d.ts.map