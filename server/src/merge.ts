/**
 * Merge Evolution socket handlers.
 *
 * Thin transport: every rule lives in mergeService, so a modified client can
 * only ask for things the server would have granted anyway.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  getProfile, tap, merge, evolve, openChest, claimSocial, buyUpgrade, catalog, leaderboard,
} from './services/mergeService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const isErr = (r: any): r is { error: string } => !!r && typeof r === 'object' && 'error' in r;

export function registerMergeHandlers(_io: AppServer, socket: AppSocket): void {
  const uid = () => socket.data.profileId ?? '';
  const need = (cb: (r: any) => void): string | null => {
    const id = uid();
    if (!id) { cb(err('საჭიროა ავტორიზაცია')); return null; }
    return id;
  };

  socket.on('merge:state' as any, async (cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      cb(ok({ profile: await getProfile(id), catalog: catalog() }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:tap' as any, async (data: { count?: number }, cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await tap(id, Number(data?.count ?? 1));
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:merge' as any, async (data: { key: string; times?: number }, cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await merge(id, String(data?.key), Number(data?.times ?? 1));
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:evolve' as any, async (cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await evolve(id);
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:open' as any, async (data: { tier: string }, cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await openChest(id, String(data?.tier));
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:social' as any, async (cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await claimSocial(id);
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:upgrade' as any, async (data: { key: string }, cb: (r: any) => void) => {
    try {
      const id = need(cb); if (!id) return;
      const r = await buyUpgrade(id, String(data?.key));
      if (isErr(r)) return cb(err(r.error));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('merge:board' as any, async (data: { limit?: number }, cb: (r: any) => void) => {
    try { cb(ok(await leaderboard(Number(data?.limit ?? 50)))); } catch (e: any) { cb(err(e.message)); }
  });
}
