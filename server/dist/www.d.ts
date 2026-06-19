/**
 * "What? Where? When?" (რა? სად? როდის?) team quiz game socket handlers.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerWWWHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleWWWDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=www.d.ts.map