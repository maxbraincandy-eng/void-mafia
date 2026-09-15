/**
 * სიტყვა — socket handlers.
 *
 * Four events: read today, guess, read the boards. The same shape as the other
 * game modules so it hangs off the connection with everything else.
 *
 * Nothing here decides anything. The guess is scored in the service against a
 * word this process derives from the date, and the client is told five marks.
 * It is never sent the word while it can still be guessed — see wordService.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types/index.js';
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export declare function registerWordHandlers(_io: AppServer, socket: AppSocket): void;
export {};
//# sourceMappingURL=word.d.ts.map