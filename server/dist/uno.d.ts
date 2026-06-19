/**
 * UNO card game socket handlers.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerUnoHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleUnoDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=uno.d.ts.map