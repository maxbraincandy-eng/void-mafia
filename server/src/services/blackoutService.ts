/**
 * Blackout — social-deduction game with real-time top-down movement.
 *
 * Players roam a building. Lights cycle on/off; in the dark, names are
 * hidden, everyone has only a flashlight, and killers can kill. When a body
 * is reported a meeting starts: chat + vote, majority is ejected. Crew wins
 * when all killers are gone; killers win on parity.
 *
 * Pure match logic — no socket.io references. Timers (lights cycle, meeting
 * countdown) live in the socket layer (blackout.ts), which calls the
 * mutators here and broadcasts. Follows the UNO service conventions:
 * in-memory Maps, reconnect-aware join, 3h auto-GC.
 */
import { randomBytes } from 'crypto';

/**
 * A room is only open while somebody is still in it.
 *
 * Every listing used to go by status alone, so a lobby whose players had all
 * closed the app went on being advertised until the three-hour sweep — and a
 * player tapping it walked into an empty table. Presence is the honest test.
 */
function hasSomeoneIn(players: Array<{ connected: boolean }>): boolean {
  return players.some(p => p.connected);
}


export type BlackoutStatus = 'waiting' | 'play' | 'meeting' | 'finished';
export type BlackoutRole = 'killer' | 'crew';
export type BlackoutSpecialty = 'security' | 'hacker' | null;
export type BlackoutWinner = 'killers' | 'crew' | null;

// ── World constants (client mirrors these for rendering/physics) ────────
export const WORLD_W = 1600;
export const WORLD_H = 1200;
export const LIGHTS_ON_MS = 30_000;
export const LIGHTS_OFF_MS = 15_000;
export const MEETING_MS = 60_000;
export const KILL_DIST = 84;
export const REPORT_DIST = 130;
export const KILL_COOLDOWN_MS = 20_000;
export const SABOTAGE_COOLDOWN_MS = 35_000;
export const DOOR_LOCK_MS = 8_000;
export const HACK_COOLDOWN_MS = 30_000;
export const DOOR_HACK_DIST = 170;
export const EMERGENCY_DIST = 130;
const MIN_PLAYERS = 4;

// Doorway centers (gaps in the divider walls) — ids d0..d5. Client mirrors.
export const DOORS: { id: string; x: number; y: number }[] = [
  { id: 'd0', x: 280, y: 490 }, { id: 'd1', x: 780, y: 490 }, { id: 'd2', x: 1300, y: 490 },
  { id: 'd3', x: 280, y: 710 }, { id: 'd4', x: 780, y: 710 }, { id: 'd5', x: 1300, y: 710 },
];
// Emergency button in the corridor center
const EMERGENCY_X = 800, EMERGENCY_Y = 600;

// Spawn ring in the central corridor
const SPAWN_CX = 800, SPAWN_CY = 600, SPAWN_R = 90;
function spawnPoint(seat: number, total: number): { x: number; y: number } {
  const a = (seat / Math.max(1, total)) * Math.PI * 2;
  return { x: SPAWN_CX + Math.cos(a) * SPAWN_R, y: SPAWN_CY + Math.sin(a) * SPAWN_R * 0.6 };
}

export interface BlackoutPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  seat: number;
  connected: boolean;
  alive: boolean;
  role: BlackoutRole;
  specialty: BlackoutSpecialty;
  x: number;
  y: number;
}

export interface BlackoutCorpse {
  userId: string;
  nickname: string;
  seat: number;
  x: number;
  y: number;
}

export interface BlackoutChatMsg {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  ts: number;
}

export interface BlackoutMeeting {
  reporterId: string;
  reporterName: string;
  /** null when the meeting came from the emergency button, not a body. */
  bodyName: string | null;
  endsAt: number;
  /** voterId → targetUserId | 'skip' */
  votes: Record<string, string>;
}

export interface BlackoutEject {
  userId: string | null;
  nickname: string | null;
  role: BlackoutRole | null;
  tie: boolean;
}

export interface BlackoutMatch {
  id: string;
  code: string;
  status: BlackoutStatus;
  hostId: string;
  maxPlayers: number;
  players: BlackoutPlayer[];
  lightsOn: boolean;
  lightsChangeAt: number;
  corpses: BlackoutCorpse[];
  meeting: BlackoutMeeting | null;
  lastEject: BlackoutEject | null;
  killCooldownUntil: Record<string, number>;
  /** Killer-team sabotage (force blackout) cooldown. */
  sabotageCooldownUntil: number;
  /** doorId → lockedUntil epoch ms. */
  doors: Record<string, number>;
  /** Hacker per-player door-lock cooldown. */
  hackCooldownUntil: Record<string, number>;
  /** userIds that already used their one emergency call. */
  emergencyUsed: string[];
  winner: BlackoutWinner;
  chat: BlackoutChatMsg[];
  round: number;
  createdAt: number;
}

// ── Public (per-viewer) projection ───────────────────────────────────────
export interface BlackoutPublicPlayer {
  userId: string;
  nickname: string;
  seat: number;
  connected: boolean;
  alive: boolean;
  x: number;
  y: number;
}

export interface BlackoutPublicState {
  id: string;
  code: string;
  status: BlackoutStatus;
  hostId: string;
  maxPlayers: number;
  players: BlackoutPublicPlayer[];
  lightsOn: boolean;
  lightsChangeAt: number;
  corpses: BlackoutCorpse[];
  meeting: { reporterName: string; bodyName: string | null; endsAt: number; votedIds: string[] } | null;
  lastEject: BlackoutEject | null;
  winner: BlackoutWinner;
  /** Killer teammates — only sent to killer viewers; revealed to all on finish. */
  killers: string[] | null;
  myRole: BlackoutRole | null;
  mySpecialty: BlackoutSpecialty;
  myUserId: string;
  myKillCooldownUntil: number;
  sabotageCooldownUntil: number;
  doors: Record<string, number>;
  myHackCooldownUntil: number;
  myEmergencyUsed: boolean;
  chat: BlackoutChatMsg[];
  round: number;
}

export interface BlackoutListItem {
  id: string;
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: BlackoutStatus;
}

// ── Stores ───────────────────────────────────────────────────────────────
const matches = new Map<string, BlackoutMatch>();
const playerMatch = new Map<string, string>(); // userId → matchId

function code6(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// ── Lifecycle ────────────────────────────────────────────────────────────
export function createMatch(hostId: string, socketId: string, nickname: string, opts: { maxPlayers?: number }): BlackoutMatch {
  const id = randomBytes(8).toString('hex');
  const m: BlackoutMatch = {
    id,
    code: code6(),
    status: 'waiting',
    hostId,
    maxPlayers: clamp(Number(opts.maxPlayers ?? 8), MIN_PLAYERS, 12),
    players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, alive: true, role: 'crew', specialty: null, x: SPAWN_CX, y: SPAWN_CY }],
    lightsOn: true,
    lightsChangeAt: 0,
    corpses: [],
    meeting: null,
    lastEject: null,
    killCooldownUntil: {},
    sabotageCooldownUntil: 0,
    doors: {},
    hackCooldownUntil: {},
    emergencyUsed: [],
    winner: null,
    chat: [],
    round: 0,
    createdAt: Date.now(),
  };
  matches.set(id, m);
  playerMatch.set(hostId, id);
  setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
  return m;
}

export function getMatch(id: string): BlackoutMatch | null {
  return matches.get(id) ?? null;
}

export function getMatchByCode(code: string): BlackoutMatch | null {
  for (const m of matches.values()) if (m.code === code && m.status !== 'finished') return m;
  return null;
}

export function getMatchForSocket(socketId: string): BlackoutMatch | null {
  for (const m of matches.values()) if (m.players.some(p => p.socketId === socketId)) return m;
  return null;
}

export function listMatches(): BlackoutListItem[] {
  return [...matches.values()]
    .filter(m => m.status === 'waiting' && hasSomeoneIn(m.players))
    .map(m => ({
      id: m.id, code: m.code,
      hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '?',
      playerCount: m.players.length, maxPlayers: m.maxPlayers, status: m.status,
    }));
}

export function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): { match: BlackoutMatch; isNew: boolean } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  const existing = m.players.find(p => p.userId === userId);
  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    playerMatch.set(userId, matchId);
    return { match: m, isNew: false };
  }
  if (m.status !== 'waiting' || m.players.length >= m.maxPlayers) return null;
  m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, alive: true, role: 'crew', specialty: null, x: SPAWN_CX, y: SPAWN_CY });
  playerMatch.set(userId, matchId);
  return { match: m, isNew: true };
}

export function leaveMatch(matchId: string, userId: string): BlackoutMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  playerMatch.delete(userId);
  // The host leaving ends it for everyone — a room without its host is not a
  // room, and it should stop appearing as one.
  if (m.hostId === userId && m.status !== 'finished') {
    m.status = 'finished';
    for (const p of m.players) playerMatch.delete(p.userId);
    return m;
  }
  if (m.status === 'waiting' || m.status === 'finished') {
    m.players = m.players.filter(p => p.userId !== userId);
    m.players.forEach((p, i) => { p.seat = i; });
    if (m.players.length === 0) { matches.delete(matchId); return null; }
    if (m.hostId === userId) m.hostId = m.players[0]!.userId;
    return m;
  }
  // Mid-game leave = death (no corpse — they vanished into the void)
  const p = m.players.find(pl => pl.userId === userId);
  if (p) { p.connected = false; p.alive = false; }
  checkWin(m);
  return m;
}

export function disconnectSocket(socketId: string): string | null {
  const m = getMatchForSocket(socketId);
  if (!m) return null;
  const p = m.players.find(pl => pl.socketId === socketId)!;
  if (m.status === 'waiting' || m.status === 'finished') {
    leaveMatch(m.id, p.userId);
    return m.id;
  }
  p.connected = false;
  p.alive = false;
  checkWin(m);
  return m.id;
}

// ── Game flow ────────────────────────────────────────────────────────────
export function startMatch(matchId: string, byUserId: string): BlackoutMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.status !== 'waiting') return null;
  if (m.players.length < MIN_PLAYERS) return null;

  const killerCount = m.players.length >= 8 ? 2 : 1;
  const shuffled = [...m.players].sort(() => Math.random() - 0.5);
  const killerIds = new Set(shuffled.slice(0, killerCount).map(p => p.userId));
  for (const p of m.players) {
    p.role = killerIds.has(p.userId) ? 'killer' : 'crew';
    p.specialty = null;
    p.alive = true;
    const sp = spawnPoint(p.seat, m.players.length);
    p.x = sp.x; p.y = sp.y;
  }
  // Shadow Protocol specialties among the crew (6+ players: Security, 7+: + Hacker)
  const crew = shuffled.filter(p => !killerIds.has(p.userId));
  if (m.players.length >= 6 && crew[0]) crew[0].specialty = 'security';
  if (m.players.length >= 7 && crew[1]) crew[1].specialty = 'hacker';
  m.status = 'play';
  m.round = 1;
  m.lightsOn = true;
  m.lightsChangeAt = Date.now() + LIGHTS_ON_MS;
  m.corpses = [];
  m.meeting = null;
  m.lastEject = null;
  m.killCooldownUntil = {};
  m.sabotageCooldownUntil = Date.now() + LIGHTS_ON_MS; // no sabotage before the first natural blackout
  m.doors = {};
  m.hackCooldownUntil = {};
  m.emergencyUsed = [];
  m.winner = null;
  m.chat = [];
  return m;
}

/** Killer team forces the lights out early. Timer must be rescheduled by caller. */
export function sabotage(matchId: string, userId: string): { match: BlackoutMatch } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return { error: 'Not in play' };
  if (!m.lightsOn) return { error: 'Already dark' };
  const p = m.players.find(pl => pl.userId === userId);
  if (!p || p.role !== 'killer' || !p.alive) return { error: 'Not a killer' };
  if (m.sabotageCooldownUntil > Date.now()) return { error: 'Cooldown' };
  m.lightsOn = false;
  m.lightsChangeAt = Date.now() + LIGHTS_OFF_MS;
  m.sabotageCooldownUntil = Date.now() + SABOTAGE_COOLDOWN_MS;
  return { match: m };
}

/** Emergency button in the corridor — one call per player per game, lights on only. */
export function emergency(matchId: string, userId: string): { match: BlackoutMatch } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return { error: 'Not in play' };
  if (!m.lightsOn) return { error: 'Too dark to find the button' };
  const p = m.players.find(pl => pl.userId === userId);
  if (!p || !p.alive) return { error: 'Not alive' };
  if (m.emergencyUsed.includes(userId)) return { error: 'Already used' };
  if (dist(p.x, p.y, EMERGENCY_X, EMERGENCY_Y) > EMERGENCY_DIST * 1.6) return { error: 'Not at the button' };
  m.emergencyUsed.push(userId);
  m.status = 'meeting';
  m.meeting = { reporterId: userId, reporterName: p.nickname, bodyName: null, endsAt: Date.now() + MEETING_MS, votes: {} };
  return { match: m };
}

/** Hacker seals a doorway for a few seconds (escape tool). */
export function hackDoor(matchId: string, userId: string, doorId: string): { match: BlackoutMatch } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return { error: 'Not in play' };
  const p = m.players.find(pl => pl.userId === userId);
  if (!p || !p.alive || p.specialty !== 'hacker') return { error: 'Not a hacker' };
  if ((m.hackCooldownUntil[userId] ?? 0) > Date.now()) return { error: 'Cooldown' };
  const door = DOORS.find(d => d.id === doorId);
  if (!door) return { error: 'No such door' };
  if (dist(p.x, p.y, door.x, door.y) > DOOR_HACK_DIST * 1.6) return { error: 'Too far from door' };
  m.doors[doorId] = Date.now() + DOOR_LOCK_MS;
  m.hackCooldownUntil[userId] = Date.now() + HACK_COOLDOWN_MS;
  return { match: m };
}

/** Called by the lights timer. Flips lights and schedules the next flip time. */
export function toggleLights(matchId: string): BlackoutMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return null;
  m.lightsOn = !m.lightsOn;
  m.lightsChangeAt = Date.now() + (m.lightsOn ? LIGHTS_ON_MS : LIGHTS_OFF_MS);
  return m;
}

export function move(socketId: string, x: number, y: number): { matchId: string; userId: string; x: number; y: number } | null {
  const m = getMatchForSocket(socketId);
  if (!m || (m.status !== 'play')) return null;
  const p = m.players.find(pl => pl.socketId === socketId);
  if (!p) return null;
  p.x = clamp(Number.isFinite(x) ? x : p.x, 0, WORLD_W);
  p.y = clamp(Number.isFinite(y) ? y : p.y, 0, WORLD_H);
  return { matchId: m.id, userId: p.userId, x: p.x, y: p.y };
}

export function kill(matchId: string, killerId: string, targetId: string): { match: BlackoutMatch } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return { error: 'Not in play' };
  if (m.lightsOn) return { error: 'Lights are on' };
  const killer = m.players.find(p => p.userId === killerId);
  const target = m.players.find(p => p.userId === targetId);
  if (!killer || killer.role !== 'killer' || !killer.alive) return { error: 'Not a killer' };
  if (!target || !target.alive || target.role === 'killer') return { error: 'Invalid target' };
  if ((m.killCooldownUntil[killerId] ?? 0) > Date.now()) return { error: 'Cooldown' };
  if (dist(killer.x, killer.y, target.x, target.y) > KILL_DIST * 1.6) return { error: 'Too far' }; // slack for relay latency

  target.alive = false;
  m.corpses.push({ userId: target.userId, nickname: target.nickname, seat: target.seat, x: target.x, y: target.y });
  m.killCooldownUntil[killerId] = Date.now() + KILL_COOLDOWN_MS;
  checkWin(m);
  return { match: m };
}

export function report(matchId: string, reporterId: string): { match: BlackoutMatch } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'play') return { error: 'Not in play' };
  const reporter = m.players.find(p => p.userId === reporterId);
  if (!reporter || !reporter.alive) return { error: 'Not alive' };
  const body = m.corpses.find(c => dist(reporter.x, reporter.y, c.x, c.y) <= REPORT_DIST * 1.6);
  if (!body) return { error: 'No body nearby' };

  m.status = 'meeting';
  m.meeting = {
    reporterId,
    reporterName: reporter.nickname,
    bodyName: body.nickname,
    endsAt: Date.now() + MEETING_MS,
    votes: {},
  };
  return { match: m };
}

export function vote(matchId: string, voterId: string, targetId: string): { match: BlackoutMatch; allVoted: boolean } | { error: string } {
  const m = matches.get(matchId);
  if (!m || m.status !== 'meeting' || !m.meeting) return { error: 'No meeting' };
  const voter = m.players.find(p => p.userId === voterId);
  if (!voter || !voter.alive) return { error: 'Not alive' };
  if (m.meeting.votes[voterId]) return { error: 'Already voted' };
  if (targetId !== 'skip') {
    const target = m.players.find(p => p.userId === targetId);
    if (!target || !target.alive) return { error: 'Invalid target' };
  }
  m.meeting.votes[voterId] = targetId;
  const aliveCount = m.players.filter(p => p.alive).length;
  return { match: m, allVoted: Object.keys(m.meeting.votes).length >= aliveCount };
}

/** Tally votes, eject, reset the round. Returns the match (possibly finished). */
export function endMeeting(matchId: string): BlackoutMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'meeting' || !m.meeting) return null;

  const tally = new Map<string, number>();
  for (const t of Object.values(m.meeting.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
  let best: string | null = null, bestN = 0, tie = false;
  for (const [t, n] of tally) {
    if (t === 'skip') continue;
    if (n > bestN) { best = t; bestN = n; tie = false; }
    else if (n === bestN) tie = true;
  }
  const skips = tally.get('skip') ?? 0;
  if (best && bestN > 0 && !tie && bestN > skips) {
    const ejected = m.players.find(p => p.userId === best)!;
    ejected.alive = false;
    m.lastEject = { userId: ejected.userId, nickname: ejected.nickname, role: ejected.role, tie: false };
  } else {
    m.lastEject = { userId: null, nickname: null, role: null, tie: true };
  }
  m.meeting = null;
  checkWin(m);
  if (m.winner) return m; // checkWin flipped status to 'finished'

  // Next round: everyone back to spawn, corpses cleared, lights on
  m.round += 1;
  m.corpses = [];
  m.killCooldownUntil = {};
  m.doors = {};
  m.sabotageCooldownUntil = Date.now() + LIGHTS_ON_MS;
  for (const p of m.players) {
    if (!p.alive) continue;
    const sp = spawnPoint(p.seat, m.players.length);
    p.x = sp.x; p.y = sp.y;
  }
  m.status = 'play';
  m.lightsOn = true;
  m.lightsChangeAt = Date.now() + LIGHTS_ON_MS;
  return m;
}

export function rematch(matchId: string, byUserId: string): BlackoutMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'finished' || m.hostId !== byUserId) return null;
  m.status = 'waiting';
  m.players = m.players.filter(p => p.connected);
  m.players.forEach((p, i) => { p.seat = i; p.alive = true; p.role = 'crew'; p.specialty = null; p.x = SPAWN_CX; p.y = SPAWN_CY; });
  if (m.players.length === 0) { matches.delete(matchId); return null; }
  if (!m.players.some(p => p.userId === m.hostId)) m.hostId = m.players[0]!.userId;
  m.corpses = [];
  m.meeting = null;
  m.lastEject = null;
  m.killCooldownUntil = {};
  m.sabotageCooldownUntil = 0;
  m.doors = {};
  m.hackCooldownUntil = {};
  m.emergencyUsed = [];
  m.winner = null;
  m.chat = [];
  m.round = 0;
  return m;
}

export function sendChat(matchId: string, userId: string, nickname: string, text: string): { match: BlackoutMatch; msg: BlackoutChatMsg } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.status !== 'waiting' && m.status !== 'meeting' && m.status !== 'finished') return null;
  const clean = text.trim().slice(0, 200);
  if (!clean) return null;
  const p = m.players.find(pl => pl.userId === userId);
  if (!p) return null;
  if (m.status === 'meeting' && !p.alive) return null; // the dead don't speak
  const msg: BlackoutChatMsg = { id: randomBytes(4).toString('hex'), userId, nickname, text: clean, ts: Date.now() };
  m.chat = [...m.chat, msg].slice(-80);
  return { match: m, msg };
}

// ── Win conditions ───────────────────────────────────────────────────────
function checkWin(m: BlackoutMatch): void {
  if (m.status === 'finished' || m.round === 0) return;
  const aliveKillers = m.players.filter(p => p.alive && p.role === 'killer').length;
  const aliveCrew = m.players.filter(p => p.alive && p.role === 'crew').length;
  if (aliveKillers === 0) { m.winner = 'crew'; m.status = 'finished'; }
  else if (aliveKillers >= aliveCrew) { m.winner = 'killers'; m.status = 'finished'; }
}

// ── Per-viewer safe state ────────────────────────────────────────────────
export function getSafeState(m: BlackoutMatch, viewerUserId: string): BlackoutPublicState {
  const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
  const killerIds = m.players.filter(p => p.role === 'killer').map(p => p.userId);
  const revealKillers = m.status === 'finished' || (viewer?.role === 'killer' && m.status !== 'waiting');
  return {
    id: m.id,
    code: m.code,
    status: m.status,
    hostId: m.hostId,
    maxPlayers: m.maxPlayers,
    players: m.players.map(p => ({ userId: p.userId, nickname: p.nickname, seat: p.seat, connected: p.connected, alive: p.alive, x: p.x, y: p.y })),
    lightsOn: m.lightsOn,
    lightsChangeAt: m.lightsChangeAt,
    corpses: m.corpses,
    meeting: m.meeting ? { reporterName: m.meeting.reporterName, bodyName: m.meeting.bodyName, endsAt: m.meeting.endsAt, votedIds: Object.keys(m.meeting.votes) } : null,
    lastEject: m.lastEject,
    winner: m.winner,
    killers: revealKillers ? killerIds : null,
    myRole: m.status === 'waiting' ? null : (viewer?.role ?? null),
    mySpecialty: m.status === 'waiting' ? null : (viewer?.specialty ?? null),
    myUserId: viewerUserId,
    myKillCooldownUntil: m.killCooldownUntil[viewerUserId] ?? 0,
    sabotageCooldownUntil: m.sabotageCooldownUntil,
    doors: m.doors,
    myHackCooldownUntil: m.hackCooldownUntil[viewerUserId] ?? 0,
    myEmergencyUsed: m.emergencyUsed.includes(viewerUserId),
    chat: m.chat,
    round: m.round,
  };
}
