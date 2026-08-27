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
/**
 * Broadcast hooks for the moderation panel.
 *
 * A moderator closing a hosted table is outside this module, so it cannot reach
 * the broadcast helpers — and a dissolve nobody is told about leaves the room
 * open on every screen that is in it.
 */
export declare function broadcastHostedState(io: AppServer, matchId: string): void;
export declare function broadcastHostedList(io: AppServer): void;
//# sourceMappingURL=sxvaMafia.d.ts.map