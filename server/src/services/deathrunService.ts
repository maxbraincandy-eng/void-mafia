/**
 * Deathrun — one player (the Death) works the traps of deathrun_temple while
 * everyone else runs it. Whoever reaches the far gate alive fights the Death
 * with swords in the arena; the Death wins the round by killing everyone.
 *
 * The server owns the round state machine, who is the Death, the trap cooldowns
 * and the scoreboard. It does NOT simulate movement: positions are relayed like
 * the 3D worlds, and a client reports its own death/finish. Traps are entirely
 * keyframed on the client, so "trap `id` fired at `t`" is the whole payload and
 * every client kills identically.
 *
 * Pure match logic — no socket.io. Timers live in deathrun.ts. Follows the
 * blackout/UNO service conventions: in-memory Maps, reconnect-aware join,
 * 3h auto-GC.
 */
import { randomBytes } from 'crypto';

export type DrStatus = 'waiting' | 'countdown' | 'running' | 'duel' | 'over';
export type DrRole = 'runner' | 'death';

const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 5_000;
export const ROUND_MS = 240_000;         // 4 minutes to run the temple
export const DUEL_MS = 60_000;
export const OVER_MS = 8_000;            // scoreboard before the next round
export const DUEL_HP = 3;                // sword hits to kill
export const SWING_COOLDOWN_MS = 650;
export const SWING_RANGE = 2.6;          // metres
export const SWING_ARC = 1.15;           // radians, half-angle

export interface DrPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  seat: number;
  connected: boolean;
  role: DrRole;
  alive: boolean;
  finished: boolean;        // reached the gate this round
  hp: number;
  /** best time in ms to finish the course, all-time in this room */
  best: number | null;
  wins: number;
  escapes: number;          // rounds survived
  kills: number;
  /** how many rounds since this player was last the Death (rotation fairness) */
  sinceDeath: number;
  x: number; y: number; z: number; ry: number;
}

export interface DrMatch {
  id: string;
  code: string;
  status: DrStatus;
  hostId: string;
  maxPlayers: number;
  map: string;
  players: DrPlayer[];
  round: number;
  /** epoch ms the current phase ends (0 = no deadline) */
  phaseEndsAt: number;
  startedAt: number;
  /** trapId → epoch ms it may next be fired */
  trapCooldown: Record<string, number>;
  /** trapId → epoch ms it last fired (clients replay from here) */
  trapFired: Record<string, number>;
  duellists: string[];      // userIds in the arena
  lastWinner: string | null;
  log: { id: string; text: string; at: number }[];
  createdAt: number;
}

export interface DrListItem {
  id: string; code: string; status: DrStatus; players: number; maxPlayers: number; host: string; map: string;
}

const matches = new Map<string, DrMatch>();
const playerMatch = new Map<string, string>();

function code6(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

function log(m: DrMatch, text: string) {
  m.log.push({ id: randomBytes(4).toString('hex'), text, at: Date.now() });
  if (m.log.length > 60) m.log.splice(0, m.log.length - 60);
}

function mkPlayer(userId: string, socketId: string, nickname: string, seat: number): DrPlayer {
  return {
    userId, socketId, nickname, seat, connected: true,
    role: 'runner', alive: true, finished: false, hp: DUEL_HP,
    best: null, wins: 0, escapes: 0, kills: 0, sinceDeath: 99,
    x: 0, y: 0, z: 0, ry: 0,
  };
}

// ── lifecycle ─────────────────────────────────────────────────────────
export function createMatch(hostId: string, socketId: string, nickname: string, opts: { maxPlayers?: number; map?: string }): DrMatch {
  const id = randomBytes(8).toString('hex');
  const m: DrMatch = {
    id,
    code: code6(),
    status: 'waiting',
    hostId,
    maxPlayers: clamp(Number(opts.maxPlayers ?? 10), MIN_PLAYERS, 16),
    map: opts.map === 'temple' ? 'temple' : 'temple',
    players: [mkPlayer(hostId, socketId, nickname, 0)],
    round: 0,
    phaseEndsAt: 0,
    startedAt: 0,
    trapCooldown: {},
    trapFired: {},
    duellists: [],
    lastWinner: null,
    log: [],
    createdAt: Date.now(),
  };
  matches.set(id, m);
  playerMatch.set(hostId, id);
  setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
  return m;
}

export function getMatch(id: string): DrMatch | null { return matches.get(id) ?? null; }
export function getMatchByCode(code: string): DrMatch | null {
  const c = String(code ?? '').trim().toUpperCase();
  for (const m of matches.values()) if (m.code === c) return m;
  return null;
}
export function matchOfPlayer(userId: string): DrMatch | null {
  const id = playerMatch.get(userId);
  return id ? matches.get(id) ?? null : null;
}
export function listMatches(): DrListItem[] {
  return [...matches.values()]
    .filter(m => m.status !== 'over' || m.players.some(p => p.connected))
    .map(m => ({
      id: m.id, code: m.code, status: m.status,
      players: m.players.filter(p => p.connected).length,
      maxPlayers: m.maxPlayers,
      host: m.players.find(p => p.userId === m.hostId)?.nickname ?? '—',
      map: m.map,
    }));
}

export function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): { match: DrMatch; isNew: boolean } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  const existing = m.players.find(p => p.userId === userId);
  if (existing) {                          // reconnect keeps your seat and stats
    existing.socketId = socketId;
    existing.connected = true;
    existing.nickname = nickname || existing.nickname;
    playerMatch.set(userId, matchId);
    return { match: m, isNew: false };
  }
  if (m.players.length >= m.maxPlayers) return null;
  const seat = m.players.length;
  const p = mkPlayer(userId, socketId, nickname, seat);
  // joining mid-round: you watch until the next one
  if (m.status !== 'waiting') { p.alive = false; p.finished = false; }
  m.players.push(p);
  playerMatch.set(userId, matchId);
  log(m, `${nickname} შემოვიდა`);
  return { match: m, isNew: true };
}

export function leaveMatch(matchId: string, userId: string): DrMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  const i = m.players.findIndex(p => p.userId === userId);
  if (i < 0) return m;
  const [gone] = m.players.splice(i, 1);
  playerMatch.delete(userId);
  m.players.forEach((p, k) => { p.seat = k; });
  log(m, `${gone.nickname} გავიდა`);
  if (!m.players.length) { matches.delete(matchId); return null; }
  if (m.hostId === userId) m.hostId = m.players[0].userId;
  // the Death quitting mid-round ends it — nobody is working the traps
  if (gone.role === 'death' && (m.status === 'running' || m.status === 'countdown' || m.status === 'duel')) {
    endRound(m, 'runners', 'სიკვდილმა თამაში დატოვა');
  }
  return m;
}

export function disconnectSocket(socketId: string): string | null {
  for (const m of matches.values()) {
    const p = m.players.find(x => x.socketId === socketId);
    if (!p) continue;
    p.connected = false;
    if (m.status === 'running' || m.status === 'duel') { p.alive = false; }
    return m.id;
  }
  return null;
}

// ── round flow ────────────────────────────────────────────────────────
/** Pick the Death: whoever has gone longest without it, ties broken randomly. */
function pickDeath(m: DrMatch): DrPlayer {
  const pool = m.players.filter(p => p.connected);
  const best = Math.max(...pool.map(p => p.sinceDeath));
  const tied = pool.filter(p => p.sinceDeath === best);
  return tied[Math.floor(Math.random() * tied.length)];
}

export function startRound(m: DrMatch): boolean {
  const active = m.players.filter(p => p.connected);
  if (active.length < MIN_PLAYERS) return false;
  m.round++;
  m.status = 'countdown';
  m.phaseEndsAt = Date.now() + COUNTDOWN_MS;
  m.trapCooldown = {};
  m.trapFired = {};
  m.duellists = [];
  m.lastWinner = null;

  const death = pickDeath(m);
  for (const p of m.players) {
    p.role = p.userId === death.userId ? 'death' : 'runner';
    p.alive = p.connected;
    p.finished = false;
    p.hp = DUEL_HP;
    p.sinceDeath = p.userId === death.userId ? 0 : p.sinceDeath + 1;
  }
  log(m, `რაუნდი ${m.round} · სიკვდილი: ${death.nickname}`);
  return true;
}

/** countdown → running. Called by the timer in the socket layer. */
export function beginRun(m: DrMatch): void {
  if (m.status !== 'countdown') return;
  m.status = 'running';
  m.startedAt = Date.now();
  m.phaseEndsAt = m.startedAt + ROUND_MS;
}

export function fireTrap(m: DrMatch, userId: string, trapId: string, cooldownMs: number): { ok: true; at: number } | { ok: false; error: string } {
  if (m.status !== 'running') return { ok: false, error: 'რაუნდი არ მიმდინარეობს' };
  const p = m.players.find(x => x.userId === userId);
  if (!p || p.role !== 'death') return { ok: false, error: 'მხოლოდ სიკვდილს შეუძლია' };
  const now = Date.now();
  if ((m.trapCooldown[trapId] ?? 0) > now) return { ok: false, error: 'გაცივება' };
  m.trapCooldown[trapId] = now + Math.max(1000, cooldownMs);
  m.trapFired[trapId] = now;
  return { ok: true, at: now };
}

/** A runner reports their own death (trap contact or a fall). */
export function reportDeath(m: DrMatch, userId: string, cause: string): void {
  if (m.status !== 'running' && m.status !== 'duel') return;
  const p = m.players.find(x => x.userId === userId);
  if (!p || !p.alive) return;
  p.alive = false;
  log(m, `${p.nickname} ${cause === 'fall' ? 'ჩავარდა' : 'დაიღუპა'}`);
  if (p.role === 'runner') {
    const death = m.players.find(x => x.role === 'death');
    if (death) death.kills++;
  }
}

/** A runner reaches the gate. Returns their course time in ms. */
export function reportFinish(m: DrMatch, userId: string): number | null {
  if (m.status !== 'running') return null;
  const p = m.players.find(x => x.userId === userId);
  if (!p || !p.alive || p.finished || p.role !== 'runner') return null;
  p.finished = true;
  p.escapes++;
  const time = Date.now() - m.startedAt;
  if (p.best === null || time < p.best) p.best = time;
  log(m, `${p.nickname} გავიდა · ${(time / 1000).toFixed(1)}წმ`);
  return time;
}

/** True when nobody is left running — everyone is dead or through the gate. */
export function runOver(m: DrMatch): boolean {
  return !m.players.some(p => p.role === 'runner' && p.alive && !p.finished && p.connected);
}

/** running → duel (or straight to the scoreboard if nobody made it). */
export function toDuel(m: DrMatch): boolean {
  if (m.status !== 'running') return false;
  const survivors = m.players.filter(p => p.role === 'runner' && p.alive && p.finished && p.connected);
  const death = m.players.find(p => p.role === 'death' && p.connected);
  if (!survivors.length || !death) {
    endRound(m, 'death', survivors.length ? 'სიკვდილი გავიდა' : 'ვერავინ გავიდა');
    return false;
  }
  m.status = 'duel';
  m.phaseEndsAt = Date.now() + DUEL_MS;
  m.duellists = [death.userId, ...survivors.map(s => s.userId)];
  for (const id of m.duellists) {
    const p = m.players.find(x => x.userId === id);
    if (p) { p.hp = DUEL_HP; p.alive = true; }
  }
  log(m, `ხმალაობა: ${survivors.map(s => s.nickname).join(', ')} vs ${death.nickname}`);
  return true;
}

/**
 * A sword hit. The attacker's client does the range/arc test and names its
 * victim; we re-check membership and liveness so a stale client can't kill
 * someone who already left the duel.
 */
export function swordHit(m: DrMatch, attackerId: string, victimId: string): { dead: boolean; victim: DrPlayer } | null {
  if (m.status !== 'duel') return null;
  const a = m.players.find(p => p.userId === attackerId);
  const v = m.players.find(p => p.userId === victimId);
  if (!a || !v || !a.alive || !v.alive) return null;
  if (!m.duellists.includes(attackerId) || !m.duellists.includes(victimId)) return null;
  if (a.role === v.role) return null;                 // survivors don't hit each other
  v.hp--;
  if (v.hp > 0) return { dead: false, victim: v };
  v.alive = false;
  a.kills++;
  log(m, `${a.nickname} → ${v.nickname}`);
  return { dead: true, victim: v };
}

/** Has the duel resolved? */
export function duelResult(m: DrMatch): 'death' | 'runners' | null {
  if (m.status !== 'duel') return null;
  const death = m.players.find(p => p.role === 'death');
  const survivors = m.players.filter(p => m.duellists.includes(p.userId) && p.role === 'runner');
  if (!death || !death.alive) return 'runners';
  if (!survivors.some(s => s.alive)) return 'death';
  return null;
}

export function endRound(m: DrMatch, winner: 'death' | 'runners', why: string): void {
  if (m.status === 'over' || m.status === 'waiting') return;
  m.status = 'over';
  m.phaseEndsAt = Date.now() + OVER_MS;
  m.lastWinner = winner;
  if (winner === 'death') {
    const d = m.players.find(p => p.role === 'death');
    if (d) d.wins++;
  } else {
    for (const p of m.players) if (p.role === 'runner' && p.alive) p.wins++;
  }
  log(m, `${winner === 'death' ? '☠️ სიკვდილმა' : '🏃 მორბენლებმა'} მოიგეს — ${why}`);
}

/** over → waiting, ready for the host (or the auto-timer) to start again. */
export function resetToLobby(m: DrMatch): void {
  m.status = 'waiting';
  m.phaseEndsAt = 0;
  m.duellists = [];
  for (const p of m.players) { p.alive = p.connected; p.finished = false; p.hp = DUEL_HP; p.role = 'runner'; }
}

export function move(m: DrMatch, userId: string, x: number, y: number, z: number, ry: number): void {
  const p = m.players.find(v => v.userId === userId);
  if (!p) return;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  p.x = x; p.y = y; p.z = z; p.ry = Number.isFinite(ry) ? ry : 0;
}

// ── views ─────────────────────────────────────────────────────────────
export function getState(m: DrMatch) {
  return {
    id: m.id,
    code: m.code,
    status: m.status,
    hostId: m.hostId,
    map: m.map,
    round: m.round,
    phaseEndsAt: m.phaseEndsAt,
    startedAt: m.startedAt,
    trapFired: m.trapFired,
    trapCooldown: m.trapCooldown,
    duellists: m.duellists,
    lastWinner: m.lastWinner,
    maxPlayers: m.maxPlayers,
    log: m.log.slice(-14),
    players: m.players.map(p => ({
      userId: p.userId, nickname: p.nickname, seat: p.seat, connected: p.connected,
      role: p.role, alive: p.alive, finished: p.finished, hp: p.hp,
      best: p.best, wins: p.wins, escapes: p.escapes, kills: p.kills,
    })),
  };
}
export type DrState = ReturnType<typeof getState>;
