/**
 * ბატონი მაქსის თავსატეხი — socket handlers. Result persistence + trait
 * leaderboard. Follows the game-module pattern: registerMaxPuzzleHandlers(io, socket).
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerMaxPuzzleHandlers(io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=maxpuzzle.d.ts.map