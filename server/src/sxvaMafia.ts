/**
 * სხვა მაფია (Other Mafia) — socket handlers + phase timers.
 *
 * Independent module for the from-scratch video-table mafia. Video/voice is
 * handled entirely by the shared LiveKit room (`sxvamafia_<matchId>`) on the
 * client via the generic hook + the existing /livekit/token route, so there is
 * no media code here — only game state and the speech/vote/last-words deadlines.
 * Follows the lies/spyfall socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch,
  dissolveMatch, startMatch, reshuffleRoles, beginNight, mafiaVote, donCheck, sheriffCheck,
  endNight, beginDay, nextSpeaker, advanceSpeakerAuto, extendSpeech, nominate,
  castVote, endVote, giveFoul, endLastWords, rematch, disconnectSocket, getSafeState,
} from './services/sxvaMafiaService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `xm:${id}`;
function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function everyone(m: ReturnType<typeof getMatch>): { userId: string; socketId: string }[] {
  if (!m) return [];
  const out: { userId: string; socketId: string }[] = [{ userId: m.hostId, socketId: m.hostSocketId }];
  for (const s of m.seats) out.push({ userId: s.userId, socketId: s.socketId });
  for (const s of m.spectators) out.push({ userId: s.userId, socketId: s.socketId });
  return out;
}

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  for (const v of everyone(m)) {
    const s = io.sockets.sockets.get(v.socketId);
    if (s) s.emit('xm:state' as any, getSafeState(m, v.userId));
  }
}
function broadcastList(io: AppServer): void { io.emit('xm:list_update' as any, listMatches()); }

const timers = new Map<string, NodeJS.Timeout>();
function clearT(id: string): void { const t = timers.get(id); if (t) { clearTimeout(t); timers.delete(id); } }

/** Schedule the current phase's deadline (speech / vote / last-words). Night is host-paced. */
function syncTimer(io: AppServer, matchId: string): void {
  clearT(matchId);
  const m = getMatch(matchId);
  if (!m) return;
  let deadline = 0;
  let fire: (() => void) | null = null;
  if (m.phase === 'speech' && m.speechEndsAt) {
    deadline = m.speechEndsAt;
    fire = () => { advanceSpeakerAuto(matchId); };
  } else if (m.phase === 'vote' && m.voteEndsAt) {
    deadline = m.voteEndsAt;
    fire = () => { endVote(matchId, null); };
  } else if (m.phase === 'last_words' && m.lastWordsEndsAt) {
    deadline = m.lastWordsEndsAt;
    fire = () => { endLastWords(matchId, null); };
  }
  if (!fire || !deadline) return;
  const token = deadline;
  const t = setTimeout(() => {
    timers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur) return;
    // Guard against a stale timer whose deadline was superseded.
    const stillCurrent =
      (cur.phase === 'speech' && cur.speechEndsAt === token) ||
      (cur.phase === 'vote' && cur.voteEndsAt === token) ||
      (cur.phase === 'last_words' && cur.lastWordsEndsAt === token);
    if (!stillCurrent) return;
    fire!();
    broadcastState(io, matchId);
    syncTimer(io, matchId);
  }, Math.max(0, token - Date.now()));
  timers.set(matchId, t);
}

export function registerSxvaMafiaHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);
  const after = (matchId: string) => { broadcastState(io, matchId); syncTimer(io, matchId); };

  socket.on('xm:list' as any, (cb: (r: any) => void) => { try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); } });

  socket.on('xm:create' as any, (data: { nickname?: string; maxSeats?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxSeats: Number(data?.maxSeats ?? 10) });
      socket.join(ROOM(m.id));
      broadcastList(io);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('xm:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const found = getMatchByCode(code);
      if (!found) return cb(err('თამაში ვერ მოიძებნა'));
      const res = joinMatch(found.id, uid(), socket.id, nickname);
      if (!res) return cb(err('ვერ შეუერთდი'));
      socket.join(ROOM(found.id));
      if (res.isNew) broadcastState(io, found.id);
      broadcastList(io);
      cb(ok(getSafeState(res.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('xm:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) broadcastState(io, matchId);
      syncTimer(io, matchId);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Host: start / roles / phases ──────────────────────────────────────────
  const hostAction = (fn: (matchId: string, uid: string) => any, failMsg: string) =>
    (data: { matchId: string }, cb: (r: any) => void) => {
      try {
        const matchId = String(data?.matchId);
        const m = fn(matchId, uid());
        if (!m) return cb(err(failMsg));
        after(matchId);
        if (m.phase === 'finished') broadcastList(io);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    };

  socket.on('xm:start' as any, hostAction(startMatch, 'ვერ დაიწყო — საჭიროა მინიმუმ 4 მოთამაშე'));
  socket.on('xm:reshuffle' as any, hostAction(reshuffleRoles, 'ვერ განახლდა'));
  socket.on('xm:begin_night' as any, hostAction(beginNight, 'ვერ დაიწყო ღამე'));
  socket.on('xm:end_night' as any, hostAction(endNight, 'ვერ დასრულდა ღამე'));
  socket.on('xm:begin_day' as any, hostAction(beginDay, 'ვერ დაიწყო დღე'));
  socket.on('xm:next_speaker' as any, hostAction(nextSpeaker, 'ვერ გადავიდა'));

  socket.on('xm:extend_speech' as any, (data: { matchId: string; seconds?: number }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = extendSpeech(matchId, uid(), Number(data?.seconds ?? 30));
      if (!m) return cb(err('ვერ გაგრძელდა'));
      after(matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('xm:end_vote' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = endVote(matchId, uid());
      if (!m) return cb(err('ვერ დასრულდა კენჭისყრა'));
      after(matchId);
      if (m.phase === 'finished') broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('xm:end_last_words' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = endLastWords(matchId, uid());
      if (!m) return cb(err('ვერ დასრულდა'));
      after(matchId);
      if (m.phase === 'finished') broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('xm:give_foul' as any, (data: { matchId: string; targetId: string; delta?: number }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = giveFoul(matchId, uid(), String(data?.targetId), Number(data?.delta ?? 1));
      if (!m) return cb(err('ვერ დაფიქსირდა ფაული'));
      after(matchId);
      if (m.phase === 'finished') broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Player actions ─────────────────────────────────────────────────────────
  const targetAction = (fn: (matchId: string, uid: string, target: string) => any, failMsg: string) =>
    (data: { matchId: string; targetId: string }, cb: (r: any) => void) => {
      try {
        const matchId = String(data?.matchId);
        const m = fn(matchId, uid(), String(data?.targetId));
        if (!m) return cb(err(failMsg));
        after(matchId);
        if (m.phase === 'finished') broadcastList(io);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    };

  socket.on('xm:mafia_vote' as any, targetAction(mafiaVote, 'ვერ აირჩია სამიზნე'));
  socket.on('xm:don_check' as any, targetAction(donCheck, 'ვერ შეამოწმა'));
  socket.on('xm:sheriff_check' as any, targetAction(sheriffCheck, 'ვერ შეამოწმა'));
  socket.on('xm:nominate' as any, targetAction(nominate, 'ვერ დაასახელა'));
  socket.on('xm:cast_vote' as any, targetAction(castVote, 'ვერ მისცა ხმა'));

  socket.on('xm:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = rematch(String(data?.matchId), uid()); if (!m) return cb(err('ვერ დაიწყო ხელახლა')); broadcastState(io, m.id); syncTimer(io, m.id); broadcastList(io); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });
}

export function handleSxvaMafiaDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) broadcastState(io, matchId);
  syncTimer(io, matchId);
  broadcastList(io);
}

export { dissolveMatch };
