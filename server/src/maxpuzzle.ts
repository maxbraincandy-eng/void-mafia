/**
 * ბატონი მაქსის თავსატეხი — socket handlers. Result persistence + trait
 * leaderboard. Follows the game-module pattern: registerMaxPuzzleHandlers(io, socket).
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  saveResult, getBoard, getMine, modRemove,
  MP_BOARD_SCOPES, type MPBoardScope,
} from './services/maxPuzzleService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

export function registerMaxPuzzleHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('maxpuzzle:submit' as any, async (data: any, cb?: (r: any) => void) => {
    try {
      await saveResult(uid(), {
        archetype: String(data?.archetype ?? ''),
        archetypeKa: String(data?.archetypeKa ?? ''),
        traits: (data?.traits && typeof data.traits === 'object') ? data.traits : {},
      });
      cb?.(ok({ saved: true }));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  socket.on('maxpuzzle:leaderboard' as any, async (data: any, cb: (r: any) => void) => {
    try {
      const scopeRaw = String(data?.scope ?? 'independence') as MPBoardScope;
      const scope: MPBoardScope = MP_BOARD_SCOPES.includes(scopeRaw) ? scopeRaw : 'independence';
      const { rows, myRow } = await getBoard(scope, uid());
      cb(ok({ scope, rows, myRow }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('maxpuzzle:me' as any, async (cb: (r: any) => void) => {
    try { cb(ok({ row: await getMine(uid()) })); }
    catch (e: any) { cb(err(e.message)); }
  });

  socket.on('maxpuzzle:mod_remove' as any, async (data: any, cb: (r: any) => void) => {
    try { cb(ok(await modRemove(uid(), String(data?.userId ?? '')))); }
    catch (e: any) { cb(err(e.message)); }
  });
}
