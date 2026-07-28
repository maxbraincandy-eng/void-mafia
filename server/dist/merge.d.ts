/**
 * Merge Evolution socket handlers.
 *
 * Thin transport: every rule lives in mergeService, so a modified client can
 * only ask for things the server would have granted anyway.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerMergeHandlers(_io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=merge.d.ts.map