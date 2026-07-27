/**
 * Deathrun socket handlers + phase timers.
 *
 * Movement is relayed at the rate clients send it (never echoed back to the
 * sender) and deliberately does NOT go through the state broadcast — the state
 * is the round/scoreboard, the position stream is its own high-frequency
 * channel, exactly like the 3D worlds.
 *
 * Follows the blackout socket-module conventions, including token-guarded
 * timers so a stale timeout can never advance a phase that has already moved on.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
import { OVER_MS } from './services/deathrunService.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerDeathrunHandlers(io: AppServer, socket: AppSocket): void;
/** Re-arm timers for a match the caller knows is mid-phase (used on rejoin). */
export declare function resumeDeathrunTimers(io: AppServer, matchId: string): void;
export { OVER_MS };
//# sourceMappingURL=deathrun.d.ts.map