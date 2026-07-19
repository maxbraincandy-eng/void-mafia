/**
 * დახაზე & გამოიცანი socket handlers: phased turn timers (choose → draw →
 * turn-end), live stroke relay, and guess handling. UNO socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerDrawHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleDrawDisconnect(io: AppServer, socketId: string): void;
export {};
//# sourceMappingURL=draw.d.ts.map