/**
 * ტკბილეული თუ ხრიკი — socket handlers.
 *
 * Every action answers with the whole state, so the screen never has to work
 * out what a door did to the bag: it shows what the server says.
 */

import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import { getState, startWalk, knockDoor, walkHome, getBoard, TotError } from './services/trickOrTreatService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerTrickOrTreatHandlers(_io: AppServer, socket: AppSocket): void {
  const uid = () => String(socket.data.profileId ?? socket.id);

  const handle = (event: string, act: () => Promise<unknown>) => {
    socket.on(event as any, async (payload: any, cb: any) => {
      const ack = typeof payload === 'function' ? payload : cb;
      if (typeof ack !== 'function') return;
      try {
        const extra = await act();
        ack(ok({ ...(await getState(uid())), ...(extra && typeof extra === 'object' ? extra : {}) }));
      } catch (e: any) {
        // Rule refusals are for the player; anything else is ours, said plainly.
        if (!(e instanceof TotError)) console.error(`[tot] ${event}:`, e?.message);
        ack(err(e instanceof TotError ? e.message : 'ვერ მოხერხდა, სცადე თავიდან.'));
      }
    });
  };

  handle('tot:state', async () => null);
  handle('tot:start', async () => { await startWalk(uid()); return null; });
  handle('tot:knock', async () => ({ door: await knockDoor(uid()) }));
  handle('tot:home', async () => ({ banked: await walkHome(uid()) }));

  socket.on('tot:board' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try { ack(ok(await getBoard(socket.data.profileId ?? null))); }
    catch (e: any) { console.error('[tot] board:', e?.message); ack(err('ვერ ჩაიტვირთა.')); }
  });
}
