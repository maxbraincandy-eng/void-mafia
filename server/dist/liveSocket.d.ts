/**
 * Going live, over sockets.
 *
 * WHY THIS IS A FILE AND NOT A BLOCK IN socket.ts
 * ───────────────────────────────────────────────
 * It used to be a block in socket.ts, and the socket tests re-implemented these
 * handlers standalone because importing socket.ts drags in every game in the
 * app. Which meant the tests exercised a hand-written copy of the code, agreed
 * with it, and passed — while the real handler was missing the one line that
 * put the host into their own broadcast room. The host saw `👁 0` and an empty
 * chat through a full green suite.
 *
 * So the handlers live here, socket.ts calls `registerLiveHandlers`, and the
 * tests call the same function. A test can now fail for the reason a user is
 * complaining about.
 *
 * WHAT THIS OWNS
 * ──────────────
 * Not the media — LiveKit has that, and a broadcast is a LiveKit room with one
 * publisher. This owns the room membership, the counts, the chat relay and the
 * announcements: everything LiveKit does not know about.
 */
import type { Server, Socket } from 'socket.io';
import { type LiveSession } from './services/liveService.js';
/** Anything with `.emit`, `.to` and `.socketsLeave` — the real io, or a test's. */
type AnyServer = Pick<Server, 'emit' | 'to' | 'socketsLeave'>;
type AnySocket = Pick<Socket, 'join' | 'leave' | 'on' | 'emit' | 'id'> & {
    data: any;
};
export interface LiveHandlerDeps {
    /** socket.ts's per-socket-per-second counter. Tests pass one that always allows. */
    rateOk: (key: string, limit?: number) => boolean;
    ok: (data: unknown) => unknown;
    err: (message: string) => unknown;
}
export declare function registerLiveHandlers(io: AnyServer, socket: AnySocket, deps: LiveHandlerDeps): void;
/** Tests only: the cooldown is module state and a second test is not a repeat. */
export declare function _resetLiveNotifyCooldown(): void;
export declare function awardLiveXP(io: AnyServer, summary: LiveSession): Promise<void>;
export {};
//# sourceMappingURL=liveSocket.d.ts.map