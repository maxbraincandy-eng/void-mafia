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
import {
  getState, startWalk, knockDoor, walkHome, getBoard, TotError,
  buyExtraWalk, exchangeCandy, buyCosmetic, awardSeasonPrizes,
} from './services/trickOrTreatService.js';
import { seasonOf } from './services/trickOrTreatRules.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * The season's prizes are paid by whichever server is up after it closes. One
 * pass an hour is plenty: awardSeasonPrizes does nothing before the close and
 * nothing twice after it. Last year's season is checked too, so a January
 * restart still pays a season nobody was up to close.
 */
let prizeTimer: NodeJS.Timeout | null = null;
function schedulePrizes(): void {
  if (prizeTimer) return;
  const pass = () => {
    const y = seasonOf();
    for (const year of [y - 1, y]) {
      awardSeasonPrizes(year).catch(e => console.error('[tot] prizes:', e?.message));
    }
  };
  setTimeout(pass, 60_000).unref?.();
  prizeTimer = setInterval(pass, 3600_000);
  prizeTimer.unref?.();
}

export function registerTrickOrTreatHandlers(_io: AppServer, socket: AppSocket): void {
  schedulePrizes();
  const uid = () => String(socket.data.profileId ?? socket.id);

  const handle = (event: string, act: (p: any) => Promise<unknown>) => {
    socket.on(event as any, async (payload: any, cb: any) => {
      const ack = typeof payload === 'function' ? payload : cb;
      if (typeof ack !== 'function') return;
      try {
        const extra = await act(typeof payload === 'function' ? {} : payload ?? {});
        ack(ok({ ...(await getState(uid())), ...(extra && typeof extra === 'object' ? extra : {}) }));
      } catch (e: any) {
        // Rule refusals are for the player; anything else is ours, said plainly.
        if (!(e instanceof TotError)) console.error(`[tot] ${event}:`, e?.message);
        ack(err(e instanceof TotError ? e.message : 'ვერ მოხერხდა, სცადე თავიდან.'));
      }
    });
  };

  handle('tot:state', async () => null);
  handle('tot:start', async p => {
    await startWalk(uid(), Date.now(), Array.isArray(p.gear) ? p.gear.map(String).slice(0, 5) : []);
    return null;
  });
  handle('tot:extra', async () => { await buyExtraWalk(uid()); return null; });
  handle('tot:exchange', async p => ({ coins: await exchangeCandy(uid(), Number(p.candy)) }));
  handle('tot:buy', async p => { await buyCosmetic(uid(), String(p.item)); return { bought: String(p.item) }; });
  handle('tot:knock', async () => ({ door: await knockDoor(uid()) }));
  handle('tot:home', async () => ({ banked: await walkHome(uid()) }));

  socket.on('tot:board' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try { ack(ok(await getBoard(socket.data.profileId ?? null))); }
    catch (e: any) { console.error('[tot] board:', e?.message); ack(err('ვერ ჩაიტვირთა.')); }
  });
}
