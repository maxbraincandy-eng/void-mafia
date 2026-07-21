/**
 * ტყუილების ოსტატი (Master of Lies) socket handlers + phase timers.
 * Follows the Spyfall/Alias socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerLiesHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleLiesDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=lies.d.ts.map