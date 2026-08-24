/**
 * Social poker — the Socket.IO layer.
 *
 * WHAT IT DOES
 * ────────────
 * Turns socket messages into table-service calls, and table-service events into
 * socket emits. That is all it does. It holds no game state, decides no rules,
 * and computes nothing about a hand — if you find yourself wanting to read a
 * card in this file, the design has gone wrong.
 *
 * THE FOUR THINGS IT IS RESPONSIBLE FOR
 * ─────────────────────────────────────
 * 1. **Identity.** Every call is attributed to `socket.data.profileId`. Nothing
 *    is ever attributed to a player id in a payload, because a payload is
 *    written by the client and a client may lie about who it is.
 * 2. **Rate limiting.** Per profile, per action, token buckets. Keyed on the
 *    profile so reconnecting is not a way round it.
 * 3. **Routing.** A player's state goes to every socket that player has open,
 *    resolved by identity, so a reconnected phone is reachable again straight
 *    away instead of receiving into a dead handle.
 * 4. **Refusing.** Errors come back as codes on the acknowledgement, and every
 *    refusal is audited. A rejected action is an incident, not an outcome.
 *
 * SECURITY NOTES
 * ──────────────
 * * Poker requires a signed-in profile. Anonymous sockets are refused, because
 *   a seat, a hand history and a leaderboard row all need an identity that
 *   survives a reconnect, and `socket.id` does not.
 * * Payload fields are read defensively: anything numeric is `Math.floor`ed and
 *   bounded, anything textual is trimmed and truncated before it goes anywhere.
 * * The state a client receives is built per viewer by `views.ts`. This file
 *   never assembles a payload containing a card.
 */

import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
} from '../types/index.js';
import { ok, err } from '../types/index.js';

import { PokerTableService, TableError } from './services/tableService.js';
import { RateLimiter } from './services/rateLimit.js';
import { getCompliance, complianceFacts } from './compliance.js';
import { botName, isBot, isOwner, newBotId } from '../services/testBots.js';
import type { AuditEntry, HandHistory, PlayerRef, TableEvent } from './services/types.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * The kill switch.
 *
 * On by default, off with `POKER_ENABLED=0`. Off means the handlers are never
 * registered, so the events do not exist rather than existing and refusing —
 * and it can be flipped during an incident without a deploy.
 */
export function pokerEnabled(): boolean {
  const flag = process.env.POKER_ENABLED;
  return flag !== '0' && flag !== 'false' && flag !== 'off';
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

/**
 * profileId → the sockets that profile currently has open.
 *
 * Maintained here rather than scanned for on every emit: a table pushes a state
 * per viewer after every action, and walking every connected socket each time
 * would make the cost of one action proportional to the size of the whole app.
 */
const sockets = new Map<string, Set<string>>();

let service: PokerTableService | null = null;
let limiter: RateLimiter | null = null;

/** Hooks the persistence layer fills in (stage 5). Absent means "not stored". */
export interface PokerSinks {
  audit?: (entry: AuditEntry) => void;
  history?: (history: HandHistory) => void;
}
let sinks: PokerSinks = {};
export function setPokerSinks(next: PokerSinks): void { sinks = next; }

function ensure(io: AppServer): PokerTableService {
  if (service) return service;
  limiter = new RateLimiter();
  service = new PokerTableService({
    emit: (event: TableEvent) => deliver(io, event),
    audit: entry => sinks.audit?.(entry),
    history: history => sinks.history?.(history),
    isBot,
  });
  return service;
}

/**
 * Send one table event out.
 *
 * `playerIds` empty means the whole table; otherwise it is a list of viewers,
 * and each gets their own payload — the service has already built it for them.
 */
function deliver(io: AppServer, event: TableEvent): void {
  if (event.playerIds.length === 0) {
    if (event.tableId) io.to(room(event.tableId)).emit(event.event as any, event.payload as any);
    else io.emit(event.event as any, event.payload as any);
    return;
  }
  for (const playerId of event.playerIds) {
    for (const socketId of sockets.get(playerId) ?? []) {
      io.sockets.sockets.get(socketId)?.emit(event.event as any, event.payload as any);
    }
  }
}

const room = (tableId: string) => `poker:${tableId}`;

// ─── Input hygiene ───────────────────────────────────────────────────────────

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const int = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;

function identity(socket: AppSocket, name?: unknown): PlayerRef | null {
  const profileId = socket.data.profileId;
  if (!profileId) return null;
  return {
    playerId: profileId,
    name: text(name, 24) || 'Player',
    avatar: '',
    avatarUrl: null,
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export function registerPokerHandlers(io: AppServer, socket: AppSocket): void {
  if (!pokerEnabled()) return;
  const svc = ensure(io);

  /**
   * One wrapper for every handler, so that identity, rate limiting, error
   * shaping and the acknowledgement contract are decided once instead of being
   * re-implemented (and eventually forgotten) per event.
   */
  const handle = (action: string, fn: (me: PlayerRef, data: any) => unknown) =>
    (data: any, cb?: (res: unknown) => void) => {
      const reply = typeof cb === 'function' ? cb : typeof data === 'function' ? data : () => {};
      const payload = typeof data === 'function' ? {} : (data ?? {});
      try {
        const me = identity(socket, payload?.name);
        if (!me) { reply(err('AUTH_REQUIRED')); return; }

        if (!limiter!.take(me.playerId, action)) {
          sinks.audit?.({
            at: Date.now(), actorId: me.playerId, actorKind: 'player',
            event: 'rate_limited', detail: { action },
          });
          reply(err(`RATE_LIMITED:${limiter!.retryAfter(me.playerId, action)}`));
          return;
        }

        reply(ok(fn(me, payload)));
      } catch (e) {
        // A rule or table refusal is a code the client can act on. Anything else
        // is a bug, and the client learns nothing about it beyond "no".
        if (e instanceof TableError) reply(err(e.code));
        else { console.error('[poker]', e); reply(err('INTERNAL')); }
      }
    };

  const join = (tableId: string) => { socket.join(room(tableId)); };

  socket.on('poker:list' as any, handle('list', () => ({
    tables: svc.listTables(),
    compliance: { notice: getCompliance(), facts: complianceFacts() },
  })));

  socket.on('poker:create' as any, handle('create', (me, d) => {
    const table = svc.createTable(me, {
      name: text(d.name, 40),
      maxSeats: int(d.maxSeats, 6),
      smallBlind: int(d.smallBlind, 10),
      bigBlind: int(d.bigBlind, int(d.smallBlind, 10) * 2),
      ante: int(d.ante, 0),
      buyIn: int(d.buyIn, 2000),
      actionSeconds: int(d.actionSeconds, 25),
      handIntervalSeconds: int(d.handIntervalSeconds, 5),
      isPrivate: Boolean(d.isPrivate),
      password: text(d.password, 32) || null,
    });
    join(table.id);
    return svc.viewFor(table, me.playerId);
  }));

  socket.on('poker:join' as any, handle('join', (me, d) => {
    const table = svc.joinTable(text(d.code, 8).toUpperCase(), me, text(d.password, 32));
    join(table.id);
    return svc.viewFor(table, me.playerId);
  }));

  socket.on('poker:sit' as any, handle('sit', (me, d) => {
    const tableId = text(d.tableId, 64);
    svc.sit(tableId, me, int(d.seat, -1));
    join(tableId);
    return svc.viewFor(svc.getTable(tableId)!, me.playerId);
  }));

  socket.on('poker:sit_out' as any, handle('sit', (me, d) => {
    svc.sitOut(text(d.tableId, 64), me.playerId, Boolean(d.out));
    return { ok: true };
  }));

  socket.on('poker:rebuy' as any, handle('sit', (me, d) => {
    svc.rebuy(text(d.tableId, 64), me.playerId);
    return { ok: true };
  }));

  socket.on('poker:leave' as any, handle('join', (me, d) => {
    const tableId = text(d.tableId, 64);
    svc.leave(tableId, me.playerId);
    socket.leave(room(tableId));
    return { ok: true };
  }));

  /**
   * The action.
   *
   * Nothing here decides whether the action is legal — `handId`, `actionSeq`
   * and the action itself go straight to the service, which asks the engine.
   * The only work done in this file is bounding the numbers so a raise of
   * `Infinity` or `1e308` is a number before anyone looks at it.
   */
  socket.on('poker:action' as any, handle('action', (me, d) => {
    const type = text(d.type, 8);
    if (!['fold', 'check', 'call', 'raise', 'allIn'].includes(type)) throw new TableError('BAD_ACTION', 'Unknown action.');
    svc.act(text(d.tableId, 64), me.playerId, {
      handId: text(d.handId, 64),
      actionSeq: int(d.actionSeq, -1),
      action: { type: type as 'fold', amount: Math.max(0, int(d.amount, 0)) },
    });
    return { ok: true };
  }));

  /**
   * Owner-only: seat a test bot, or clear them all out.
   *
   * Async because the owner check reads the profile, and it is checked against
   * the socket's identity rather than anything in the payload.
   */
  socket.on('poker:add_bot' as any, async (d: any, cb?: (res: unknown) => void) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    try {
      const me = identity(socket);
      if (!me) return reply(err('AUTH_REQUIRED'));
      if (!(await isOwner(me.playerId))) return reply(err('OWNER_ONLY'));

      const tableId = text(d?.tableId, 64);
      const table = svc.getTable(tableId);
      if (!table) return reply(err('NO_TABLE'));

      const free = Array.from({ length: table.config.maxSeats }, (_, i) => i)
        .find(i => !table.seats.some(s => s.seat === i));
      if (free === undefined) return reply(err('TABLE_FULL'));

      const bot = {
        playerId: newBotId(),
        name: botName(table.seats.map(s => s.player.name)),
        avatar: '🤖',
        avatarUrl: null,
      };
      svc.sit(tableId, bot, free);
      sinks.audit?.({
        at: Date.now(), actorId: me.playerId, actorKind: 'admin',
        event: 'test_bot_added', tableId, detail: { seat: free, botId: bot.playerId },
      });
      reply(ok({ seat: free }));
    } catch (e) {
      if (e instanceof TableError) reply(err(e.code));
      else { console.error('[poker/bot]', e); reply(err('INTERNAL')); }
    }
  });

  socket.on('poker:clear_bots' as any, async (d: any, cb?: (res: unknown) => void) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    try {
      const me = identity(socket);
      if (!me) return reply(err('AUTH_REQUIRED'));
      if (!(await isOwner(me.playerId))) return reply(err('OWNER_ONLY'));

      const tableId = text(d?.tableId, 64);
      const table = svc.getTable(tableId);
      if (!table) return reply(err('NO_TABLE'));

      const bots = table.seats.filter(s => isBot(s.player.playerId)).map(s => s.player.playerId);
      for (const id of bots) svc.leave(tableId, id);
      reply(ok({ removed: bots.length }));
    } catch (e) {
      if (e instanceof TableError) reply(err(e.code));
      else { console.error('[poker/bot]', e); reply(err('INTERNAL')); }
    }
  });

  socket.on('poker:chat' as any, handle('chat', (me, d) => {
    const tableId = text(d.tableId, 64);
    const table = svc.getTable(tableId);
    if (!table || table.status === 'closed') throw new TableError('NO_TABLE', 'That table is not open.');
    const seated = table.seats.some(s => s.player.playerId === me.playerId);
    if (!seated && !table.observers.has(me.playerId)) throw new TableError('NOT_AT_TABLE', 'You are not at this table.');

    const body = text(d.text, 200);
    if (!body) throw new TableError('EMPTY', 'Nothing to say.');
    io.to(room(tableId)).emit('poker:chat' as any, {
      tableId, playerId: me.playerId, name: me.name, text: body, at: Date.now(),
    });
    return { ok: true };
  }));

  /**
   * Reconnect.
   *
   * The client asks; the server answers with authoritative state rebuilt from
   * the tables it is actually in. Nothing about the previous session is trusted
   * — not the table id, not the seat, not the hand.
   */
  socket.on('poker:resume' as any, handle('resume', me => {
    track(me.playerId, socket.id);
    const views = svc.resume(me.playerId);
    for (const { table } of views) join(table.id);
    return { tables: views.map(v => v.table) };
  }));

  const me = identity(socket);
  if (me) { track(me.playerId, socket.id); svc.setConnected(me.playerId, true); }
}

function track(playerId: string, socketId: string): void {
  const set = sockets.get(playerId) ?? new Set<string>();
  set.add(socketId);
  sockets.set(playerId, set);
}

/**
 * A socket went away.
 *
 * The seat is NOT released here. A player with another tab open is still
 * present, and a player with no tab open gets the grace period the table
 * service runs — releasing a seat the moment a socket blinks would cost people
 * their seat every time they locked their phone.
 */
export function handlePokerDisconnect(_io: AppServer, socket: AppSocket): void {
  const profileId = socket.data.profileId;
  if (!profileId || !service) return;

  const set = sockets.get(profileId);
  if (set) {
    set.delete(socket.id);
    if (set.size === 0) {
      sockets.delete(profileId);
      service.setConnected(profileId, false);
    }
  }
}

/** Process shutdown. */
export function shutdownPoker(): void {
  service?.shutdown();
  service = null;
  limiter = null;
  sockets.clear();
}

/** Test seam: the live service, or null if poker has never been registered. */
export function pokerService(): PokerTableService | null { return service; }
