/**
 * Codenames socket handlers (untimed). UNO socket-module pattern. State is
 * per-viewer: only spymasters see the colour key.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerCodenamesHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleCodenamesDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=codenames.d.ts.map