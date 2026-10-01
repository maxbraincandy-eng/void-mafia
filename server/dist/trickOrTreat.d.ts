/**
 * ტკბილეული თუ ხრიკი — socket handlers.
 *
 * Every action answers with the whole state, so the screen never has to work
 * out what a door did to the bag: it shows what the server says.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerTrickOrTreatHandlers(_io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=trickOrTreat.d.ts.map