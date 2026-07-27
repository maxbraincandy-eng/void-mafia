/**
 * ფორმალური ლოგიკის აკადემია — socket handlers.
 *
 * Thin transport over logicService. The only rule enforced here is that a
 * session belongs to the caller: the service already refuses a session id that
 * does not match the user, so a stolen id buys nothing.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerLogicHandlers(_io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=logic.d.ts.map