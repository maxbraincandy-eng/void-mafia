/**
 * Blackout socket handlers + timers (lights cycle, meeting countdown).
 * Follows the UNO socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerBlackoutHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleBlackoutDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=blackout.d.ts.map