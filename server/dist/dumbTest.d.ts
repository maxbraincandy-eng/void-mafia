/**
 * დებილების ტესტი — socket handlers.
 *
 * Three events: draw a test, submit it, read the board. Follows the same shape
 * as the other game modules — `registerDumbHandlers(io, socket)` — so it hangs
 * off the connection with everything else.
 *
 * The questions go out WITHOUT their answers and the score is computed here.
 * That is the only thing in this file that matters for the leaderboard to mean
 * anything: a client that could see the answers, or report its own score, would
 * turn the board into a list of who looked.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerDumbHandlers(_io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=dumbTest.d.ts.map