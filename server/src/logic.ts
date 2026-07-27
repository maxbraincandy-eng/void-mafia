/**
 * ფორმალური ლოგიკის აკადემია — socket handlers.
 *
 * Thin transport over logicService. The only rule enforced here is that a
 * session belongs to the caller: the service already refuses a session id that
 * does not match the user, so a stolen id buys nothing.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  startSession, answer, finish, getProfile, sessionView, getSession,
  leaderboard, myRanks, setCountry, dailyStatus, getAchievements, categoryBreakdown,
  BANK_SIZE, type LogicMode, type BoardScope,
} from './services/logicService.js';
import { countBy, LEVEL_LABEL, CAT_LABEL, type LogicLevel } from './data/logic/index.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const uidOf = (s: AppSocket) => s.data.profileId ?? '';
const MODES: LogicMode[] = ['practice', 'ranked', 'daily', 'test'];
const LEVELS: Array<LogicLevel | 'mixed'> = ['beginner', 'medium', 'hard', 'expert', 'mixed'];

export function registerLogicHandlers(_io: AppServer, socket: AppSocket): void {
  const uid = () => uidOf(socket);
  const requireUser = (cb: (r: any) => void): string | null => {
    const id = uid();
    if (!id) { cb(err('საჭიროა ავტორიზაცია')); return null; }
    return id;
  };

  // ── hub: everything the front page needs in one round trip ──
  socket.on('logic:hub' as any, async (cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const [profile, ranks, daily, achievements] = await Promise.all([
        getProfile(id), myRanks(id), dailyStatus(id), getAchievements(id),
      ]);
      cb(ok({
        profile, ranks, daily,
        achievements: achievements.map(a => ({ code: a.code, name: a.name, desc: a.desc, icon: a.icon, earned: a.earned, at: a.at })),
        bank: {
          total: BANK_SIZE,
          levels: (['beginner', 'medium', 'hard', 'expert'] as LogicLevel[]).map(l => ({ level: l, label: LEVEL_LABEL[l], count: countBy(l) })),
          categories: Object.entries(CAT_LABEL).map(([k, v]) => ({ cat: k, label: v })),
        },
      }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:start' as any, async (data: { mode?: string; level?: string; count?: number }, cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const mode = (MODES.includes(data?.mode as LogicMode) ? data!.mode : 'practice') as LogicMode;
      const level = (LEVELS.includes(data?.level as any) ? data!.level : 'mixed') as LogicLevel | 'mixed';
      if (mode === 'daily') {
        const st = await dailyStatus(id);
        if (st.done) return cb(err('დღევანდელი გამოწვევა უკვე დაასრულე'));
      }
      const count = mode === 'daily' ? 8 : Number(data?.count ?? 10);
      const { view } = await startSession(id, mode, level, count);
      cb(ok(view));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:answer' as any, async (data: { sessionId: string; choice: number; ms: number }, cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const r = await answer(String(data?.sessionId), id, Number(data?.choice), Number(data?.ms));
      if (!r) return cb(err('სესია ვერ მოიძებნა'));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:finish' as any, async (data: { sessionId: string }, cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const r = await finish(String(data?.sessionId), id);
      if (!r) return cb(err('სესია ვერ მოიძებნა'));
      cb(ok(r));
    } catch (e: any) { cb(err(e.message)); }
  });

  /** Resume after a refresh — the session lives on the server, not the tab. */
  socket.on('logic:resume' as any, (data: { sessionId: string }, cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const s = getSession(String(data?.sessionId));
      if (!s || s.userId !== id || s.finished) return cb(err('სესია ვერ მოიძებნა'));
      cb(ok(sessionView(s)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:leaderboard' as any, async (data: { scope?: string; limit?: number }, cb: (r: any) => void) => {
    try {
      const id = uid();
      const scopes: BoardScope[] = ['world', 'country', 'friends', 'week', 'month', 'all'];
      const scope = (scopes.includes(data?.scope as BoardScope) ? data!.scope : 'world') as BoardScope;
      if ((scope === 'friends' || scope === 'country') && !id) return cb(err('საჭიროა ავტორიზაცია'));
      cb(ok(await leaderboard(scope, id, Number(data?.limit ?? 50))));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:stats' as any, async (cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      const [profile, ranks, cats] = await Promise.all([getProfile(id), myRanks(id), categoryBreakdown(id)]);
      cb(ok({
        profile, ranks,
        categories: cats.map(c => ({ cat: c.cat, label: CAT_LABEL[c.cat], seen: c.seen })),
        avgMs: profile.answered ? Math.round(profile.totalMs / profile.answered) : 0,
        accuracy: profile.answered ? Math.round((profile.correct / profile.answered) * 100) : 0,
        bank: BANK_SIZE,
      }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('logic:set_country' as any, async (data: { code: string }, cb: (r: any) => void) => {
    try {
      const id = requireUser(cb); if (!id) return;
      await setCountry(id, String(data?.code ?? ''));
      cb(ok(await myRanks(id)));
    } catch (e: any) { cb(err(e.message)); }
  });
}
