/**
 * Ludo mini-game socket handlers.
 * Completely separate from Mafia rooms and other mini-games.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerLudoHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleLudoDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=ludo.d.ts.map