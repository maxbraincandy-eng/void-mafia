import { Server } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function setDbReady(v: boolean): void;
export declare function attachSocketHandlers(io: AppServer): void;
export {};
//# sourceMappingURL=socket.d.ts.map