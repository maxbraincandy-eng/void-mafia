/**
 * ალიასი socket handlers + turn timer. Follows the UNO socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerAliasHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleAliasDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=alias.d.ts.map