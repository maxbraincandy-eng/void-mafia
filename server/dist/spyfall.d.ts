/**
 * ჯაშუში (Spyfall) socket handlers + discussion timer + accusation timer
 * + per-match voice. Follows the UNO/Alias socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerSpyfallHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleSpyfallDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=spyfall.d.ts.map