/**
 * სხვა მაფია (Other Mafia) — socket handlers + phase timers.
 *
 * Independent module for the from-scratch video-table mafia. Video/voice is
 * handled entirely by the shared LiveKit room (`sxvamafia_<matchId>`) on the
 * client via the generic hook + the existing /livekit/token route, so there is
 * no media code here — only game state and the speech/vote/last-words deadlines.
 * Follows the lies/spyfall socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
import { dissolveMatch } from './services/sxvaMafiaService.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerSxvaMafiaHandlers(io: AppServer, socket: AppSocket): void;
export declare function handleSxvaMafiaDisconnect(io: AppServer, socketId: string): void;
export { dissolveMatch };
//# sourceMappingURL=sxvaMafia.d.ts.map