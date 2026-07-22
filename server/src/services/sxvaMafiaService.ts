/**
 * სხვა მაფია (Other Mafia) — a host-moderated, video-first "table mafia".
 *
 * This is an INDEPENDENT implementation written from scratch. It deliberately
 * shares nothing with the platform's original mafia engine — its own roles,
 * phase machine, turn/timer model, foul system and win logic live entirely
 * here. It follows the same generic match conventions used by the lies/spyfall
 * services (in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC).
 *
 * Shape of a game:
 *   • one player is the HOST / moderator — they sit in the centre, hold no
 *     secret role, run the phases and hand out fouls.
 *   • the others take numbered SEATS with hidden roles and a webcam tile.
 *   • phases loop: assign → night → day_announce → speech → vote → last_words → …
 *   • during the day each living seat gets its own timed minute to speak; the
 *     active seat's tile is highlighted. Four fouls eliminate a seat.
 *
 * Timers (speech/night/vote/last-words deadlines) are driven from the socket
 * layer, exactly like the other match games.
 */
import { randomBytes } from 'crypto';

export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen';
export type XmPhase = 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech' | 'vote' | 'last_words' | 'finished';
export type XmWinner = 'town' | 'mafia' | null;

export const XM_FOULS_TO_ELIMINATE = 4;

export interface XmSeat {
  userId: string;
  socketId: string;
  nickname: string;
  seat: number;            // 1-based table seat number
  connected: boolean;
  role: XmRole | null;
  alive: boolean;
  fouls: number;
  eliminatedRound: number | null;
  eliminatedBy: 'vote' | 'mafia' | 'fouls' | null;
  lastCheck: string | null; // don/sheriff: their most recent check result, kept visible into the day
  cardIndex: number | null; // which face-down card this player took at the deal
}

export interface XmLogEntry {
  round: number;
  phase: 'night' | 'day' | 'foul' | 'game';
  text: string;
}

export interface XmNightState {
  mafiaVotes: Record<string, string>; // mafia userId -> target userId
  donCheck: string | null;            // don checks a seat (is it the sheriff?)
  donResult: boolean | null;
  sheriffCheck: string | null;        // sheriff checks a seat (is it mafia?)
  sheriffResult: boolean | null;
}

export interface XmAnnounce {
  round: number;
  killedUserId: string | null;   // who the mafia killed overnight (null = nobody)
  killedName: string | null;
}

export interface XmMatch {
  id: string;
  code: string;
  phase: XmPhase;
  hostId: string;                // moderator, no role, sits centre
  hostSocketId: string;
  hostName: string;
  hostConnected: boolean;
  maxSeats: number;
  seats: XmSeat[];
  spectators: { userId: string; socketId: string; nickname: string; connected: boolean }[];
  settings: { speechSeconds: number; nightSeconds: number; voteSeconds: number; lastWordsSeconds: number; floorControl: boolean };
  roleConfig: { don: number; mafia: number; sheriff: number } | null; // host override; null = auto by count
  deck: XmRole[];                // shuffled face-down cards for the deal; a card's role is revealed only to whoever takes it
  log: XmLogEntry[];             // running protocol, visible to everyone (no roles)
  round: number;                 // day number, 1-based once play starts
  // speech
  introRound: boolean;           // the day-0 acquaintance circle: speeches, no nomination/vote
  speechOrder: string[];         // alive seat userIds, this day's order
  speechIdx: number;
  speechEndsAt: number;
  nominations: string[];         // userIds put up for the vote this day
  nominatedBy: Record<string, string>; // nominee -> nominator (one nomination per speaker)
  // night
  night: XmNightState;
  nightEndsAt: number;
  announce: XmAnnounce | null;
  // vote
  votes: Record<string, string>; // voter userId -> nominee userId
  voteEndsAt: number;
  voteRevote: boolean;           // this vote is a tie-break re-vote
  voteResult: { eliminatedUserId: string | null; tally: Record<string, number> } | null;
  // last words
  lastWordsUserId: string | null;
  lastWordsEndsAt: number;
  // a player's 6-second "foul" — grabbing the mic out of turn
  floorGrab: { userId: string; until: number } | null;
  // end
  winner: XmWinner;
  reveal: { userId: string; nickname: string; seat: number; role: XmRole }[] | null;
  dissolved: boolean;
  createdAt: number;
}

// ── Per-viewer safe state ──────────────────────────────────────────────────────
export interface XmSafeSeat {
  userId: string; socketId: string; nickname: string; seat: number; connected: boolean;
  alive: boolean; fouls: number; eliminatedBy: XmSeat['eliminatedBy'];
  role: XmRole | null;   // filled only when the viewer is allowed to know it
  isSpeaking: boolean;
  isNominated: boolean;
}

export interface XmSafeState {
  id: string;
  code: string;
  phase: XmPhase;
  hostId: string; hostName: string; hostSocketId: string; hostConnected: boolean;
  maxSeats: number;
  seats: XmSafeSeat[];
  spectatorCount: number;
  settings: XmMatch['settings'];
  setup: { don: number; mafia: number; sheriff: number; citizen: number };
  roleConfigCustom: boolean;
  round: number;
  amHost: boolean;
  amSpectator: boolean;
  mySeat: number | null;
  myRole: XmRole | null;
  myAlive: boolean;
  myFouls: number;
  mateIds: string[];            // fellow mafia userIds (if I'm mafia)
  // deal (assign phase): face-down cards on the table
  cards: { index: number; claimedById: string | null; claimedByName: string | null; claimedBySeat: number | null }[];
  myCardIndex: number | null;
  // speech
  introRound: boolean;
  speakingUserId: string | null;
  speechEndsAt: number;
  speechIdx: number;
  speechTotal: number;
  nominations: { userId: string; nickname: string; seat: number }[];
  iNominated: boolean;
  // night
  nightEndsAt: number;
  iActedTonight: boolean;       // did my night role already submit
  nightPrivate: string | null;  // result text for don/sheriff (only to them)
  nightAllActed: boolean;       // host hint: everyone with a night role has acted
  mafiaPicks: { userId: string; nickname: string; targetId: string; targetName: string }[]; // mafia-only: teammate kill choices
  announce: XmAnnounce | null;
  // vote
  voteEndsAt: number;
  voteRevote: boolean;
  myVote: string | null;
  voteTally: Record<string, number>;
  voteResult: XmMatch['voteResult'];
  // last words
  lastWordsUserId: string | null;
  lastWordsName: string | null;
  lastWordsEndsAt: number;
  floorGrabUserId: string | null;   // who is currently interjecting (their 6s "foul")
  floorGrabUntil: number;
  // end
  log: XmLogEntry[];
  winner: XmWinner;
  reveal: XmMatch['reveal'];
  dissolved: boolean;
  myUserId: string;
}

export interface XmListItem {
  id: string; code: string; hostName: string; seatCount: number; maxSeats: number; phase: XmPhase;
}

const matches = new Map<string, XmMatch>();

function code6(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; }

/** Role split for a given number of seated players (host excluded). */
export function roleCounts(n: number): { don: number; mafia: number; sheriff: number; citizen: number } {
  const mafiaTotal = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4; // includes the don
  const don = mafiaTotal >= 1 ? 1 : 0;
  const mafia = mafiaTotal - don;
  const sheriff = n >= 5 ? 1 : 0;
  const citizen = Math.max(0, n - don - mafia - sheriff);
  return { don, mafia, sheriff, citizen };
}

/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export function effectiveCounts(m: XmMatch): { don: number; mafia: number; sheriff: number; citizen: number } {
  const n = m.seats.length;
  if (!m.roleConfig) return roleCounts(n);
  let don = Math.max(0, Math.min(2, Math.floor(m.roleConfig.don)));
  let mafia = Math.max(0, Math.min(9, Math.floor(m.roleConfig.mafia)));
  let sheriff = Math.max(0, Math.min(2, Math.floor(m.roleConfig.sheriff)));
  // A mafia game needs at least one mafia-team member and at least one townsperson.
  if (don + mafia === 0) mafia = 1;
  // Trim specials that don't fit, then guarantee ≥1 town seat remains.
  let specials = don + mafia + sheriff;
  if (specials > n) { const o = specials - n; mafia = Math.max(0, mafia - o); }
  specials = don + mafia + sheriff;
  if (specials > n) { const o = specials - n; sheriff = Math.max(0, sheriff - o); }
  specials = don + mafia + sheriff;
  if (specials > n) { const o = specials - n; don = Math.max(0, don - o); }
  if (don + mafia === 0) mafia = 1;
  // Keep at least one town seat: mafia team can be at most n-1.
  while (don + mafia >= n && mafia > 0) mafia -= 1;
  while (don + mafia >= n && don > 0) don -= 1;
  const citizen = Math.max(0, n - don - mafia - sheriff);
  return { don, mafia, sheriff, citizen };
}

export function createMatch(hostId: string, socketId: string, nickname: string, opts: { maxSeats?: number }): XmMatch {
  const id = randomBytes(8).toString('hex');
  const m: XmMatch = {
    id, code: code6(), phase: 'lobby',
    hostId, hostSocketId: socketId, hostName: nickname, hostConnected: true,
    maxSeats: Math.min(14, Math.max(4, Number(opts.maxSeats ?? 10))),
    seats: [],
    spectators: [],
    settings: { speechSeconds: 60, nightSeconds: 40, voteSeconds: 30, lastWordsSeconds: 40, floorControl: true },
    roleConfig: null,
    deck: [],
    log: [],
    round: 0,
    introRound: false,
    speechOrder: [], speechIdx: 0, speechEndsAt: 0, nominations: [], nominatedBy: {},
    night: { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null },
    nightEndsAt: 0,
    announce: null,
    votes: {}, voteEndsAt: 0, voteRevote: false, voteResult: null,
    lastWordsUserId: null, lastWordsEndsAt: 0, floorGrab: null,
    winner: null, reveal: null, dissolved: false, createdAt: Date.now(),
  };
  matches.set(id, m);
  setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
  return m;
}

export function getMatch(id: string): XmMatch | null { return matches.get(id) ?? null; }
export function getMatchByCode(code: string): XmMatch | null { for (const m of matches.values()) if (m.code === code && m.phase !== 'finished') return m; return null; }
export function getMatchForSocket(socketId: string): XmMatch | null {
  for (const m of matches.values()) {
    if (m.hostSocketId === socketId) return m;
    if (m.seats.some(s => s.socketId === socketId)) return m;
    if (m.spectators.some(s => s.socketId === socketId)) return m;
  }
  return null;
}
export function listMatches(): XmListItem[] {
  return [...matches.values()].filter(m => m.phase !== 'finished').map(m => ({
    id: m.id, code: m.code, hostName: m.hostName, seatCount: m.seats.length, maxSeats: m.maxSeats, phase: m.phase,
  }));
}

function findByUser(m: XmMatch, userId: string): XmSeat | null { return m.seats.find(s => s.userId === userId) ?? null; }
function aliveSeats(m: XmMatch): XmSeat[] { return m.seats.filter(s => s.alive); }
function isMafiaRole(r: XmRole | null): boolean { return r === 'mafia' || r === 'don'; }
function aliveMafia(m: XmMatch): XmSeat[] { return m.seats.filter(s => s.alive && isMafiaRole(s.role)); }
function aliveTown(m: XmMatch): XmSeat[] { return m.seats.filter(s => s.alive && !isMafiaRole(s.role)); }

/** Join as a seat (during lobby) or reconnect. Post-start newcomers become spectators. */
export function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): { match: XmMatch; isNew: boolean } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.hostId === userId) { m.hostSocketId = socketId; m.hostConnected = true; m.hostName = nickname; return { match: m, isNew: false }; }
  const seat = findByUser(m, userId);
  if (seat) { seat.socketId = socketId; seat.connected = true; return { match: m, isNew: false }; }
  const spec = m.spectators.find(s => s.userId === userId);
  if (spec) { spec.socketId = socketId; spec.connected = true; return { match: m, isNew: false }; }
  if (m.phase === 'lobby' && m.seats.length < m.maxSeats) {
    m.seats.push({ userId, socketId, nickname, seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null });
    return { match: m, isNew: true };
  }
  m.spectators.push({ userId, socketId, nickname, connected: true });
  return { match: m, isNew: true };
}

export function leaveMatch(matchId: string, userId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.phase === 'lobby') {
    if (m.hostId === userId) return dissolveMatch(matchId, userId); // host leaving in lobby ends it
    m.seats = m.seats.filter(s => s.userId !== userId);
    m.seats.forEach((s, i) => { s.seat = i + 1; });
    m.spectators = m.spectators.filter(s => s.userId !== userId);
    return m;
  }
  // Active game: host leaving dissolves; a player leaving marks them disconnected/eliminated.
  if (m.hostId === userId) return dissolveMatch(matchId, userId);
  const seat = findByUser(m, userId);
  if (seat) { seat.connected = false; }
  m.spectators = m.spectators.filter(s => s.userId !== userId);
  return m;
}

export function disconnectSocket(socketId: string): string | null {
  const m = getMatchForSocket(socketId);
  if (!m) return null;
  if (m.hostSocketId === socketId) { m.hostConnected = false; return m.id; }
  const seat = m.seats.find(s => s.socketId === socketId);
  if (seat) {
    seat.connected = false;
    if (m.phase === 'lobby') { m.seats = m.seats.filter(s => s.userId !== seat.userId); m.seats.forEach((s, i) => { s.seat = i + 1; }); }
    return m.id;
  }
  const spec = m.spectators.find(s => s.socketId === socketId);
  if (spec) { spec.connected = false; if (m.phase === 'lobby') m.spectators = m.spectators.filter(s => s.userId !== spec.userId); }
  return m.id;
}

export function dissolveMatch(matchId: string, _byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  m.phase = 'finished';
  m.dissolved = true;
  m.winner = null;
  return m;
}

/** Lobby only: the host hands the moderator role to a seated player and takes
 * that player's seat in return (a straight swap). */
export function transferHost(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'lobby') return null;
  const target = findByUser(m, targetUserId);
  if (!target) return null;
  const oldHostSeat: XmSeat = {
    userId: m.hostId, socketId: m.hostSocketId, nickname: m.hostName, seat: target.seat,
    connected: m.hostConnected, role: null, alive: true, fouls: 0,
    eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null,
  };
  m.seats = m.seats.map(s => (s.userId === targetUserId ? oldHostSeat : s));
  m.seats.forEach((s, i) => { s.seat = i + 1; });
  m.hostId = target.userId; m.hostSocketId = target.socketId; m.hostName = target.nickname; m.hostConnected = target.connected;
  return m;
}

// ── Start / the deal ─────────────────────────────────────────────────────────────
/** Shuffle the role composition into a face-down deck. Roles aren't assigned to
 * seats yet — each player claims a card during the assign phase, and the card's
 * hidden role becomes theirs. */
export function dealCards(m: XmMatch): void {
  const n = m.seats.length;
  const { don, mafia, sheriff } = effectiveCounts(m);
  const pool: XmRole[] = [
    ...Array(don).fill('don'),
    ...Array(mafia).fill('mafia'),
    ...Array(sheriff).fill('sheriff'),
  ];
  while (pool.length < n) pool.push('citizen');
  m.deck = shuffle(pool);
  m.seats.forEach(s => {
    s.role = null; s.cardIndex = null;
    s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null;
  });
}

export function startMatch(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'lobby') return null;
  if (m.seats.length < 4) return null;
  dealCards(m);
  m.round = 0;
  m.phase = 'assign';
  m.winner = null; m.reveal = null; m.announce = null;
  m.log = [];
  pushLog(m, 'game', `თამაში დაიწყო — ${m.seats.length} მოთამაშე`);
  return m;
}

/** A player takes one of the face-down cards; its hidden role becomes theirs. */
export function pickCard(matchId: string, byUserId: string, cardIndex: number): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'assign') return null;
  const seat = findByUser(m, byUserId);
  if (!seat || seat.cardIndex !== null) return null; // spectators / host / already took one
  const idx = Math.floor(Number(cardIndex));
  if (idx < 0 || idx >= m.deck.length) return null;
  if (m.seats.some(s => s.cardIndex === idx)) return null; // already taken by someone
  seat.cardIndex = idx;
  seat.role = m.deck[idx]!;
  return m;
}

/** Host configures the role composition (lobby or assign). Pass null to reset to auto. */
export function setRoleConfig(matchId: string, byUserId: string, cfg: { don: number; mafia: number; sheriff: number } | null): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (m.phase !== 'lobby' && m.phase !== 'assign') return null;
  if (!cfg) { m.roleConfig = null; }
  else {
    m.roleConfig = {
      don: Math.max(0, Math.min(2, Math.floor(Number(cfg.don ?? 0)))),
      mafia: Math.max(0, Math.min(9, Math.floor(Number(cfg.mafia ?? 0)))),
      sheriff: Math.max(0, Math.min(2, Math.floor(Number(cfg.sheriff ?? 0)))),
    };
  }
  if (m.phase === 'assign') dealCards(m); // re-deal with the new split (everyone re-picks)
  return m;
}

/** Host tweaks timers / floor control. Durations only editable before play starts. */
export function setSettings(matchId: string, byUserId: string, patch: Partial<XmMatch['settings']>): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (typeof patch.floorControl === 'boolean') m.settings.floorControl = patch.floorControl; // any time
  if (m.phase === 'lobby') {
    if (patch.speechSeconds != null) m.settings.speechSeconds = Math.max(20, Math.min(180, Math.floor(patch.speechSeconds)));
    if (patch.voteSeconds != null) m.settings.voteSeconds = Math.max(15, Math.min(120, Math.floor(patch.voteSeconds)));
    if (patch.lastWordsSeconds != null) m.settings.lastWordsSeconds = Math.max(15, Math.min(120, Math.floor(patch.lastWordsSeconds)));
    if (patch.nightSeconds != null) m.settings.nightSeconds = Math.max(20, Math.min(120, Math.floor(patch.nightSeconds)));
  }
  return m;
}

/** Host re-deals the cards while still on the assign screen (everyone re-picks). */
export function reshuffleRoles(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'assign') return null;
  dealCards(m);
  return m;
}

// ── Phase transitions (host-driven) ─────────────────────────────────────────────
function resetNight(m: XmMatch): void {
  m.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null };
}
function seatLabel(s: XmSeat): string { return `#${s.seat} ${s.nickname}`; }
function pushLog(m: XmMatch, phase: XmLogEntry['phase'], text: string): void {
  m.log.push({ round: m.round, phase, text });
  if (m.log.length > 60) m.log.shift();
}
/** True once everyone who has a night action tonight has submitted it. */
function nightAllActed(m: XmMatch): boolean {
  const mafia = aliveMafia(m);
  const allMafiaVoted = mafia.length === 0 || mafia.every(s => m.night.mafiaVotes[s.userId]);
  const don = m.seats.find(s => s.alive && s.role === 'don');
  const sheriff = m.seats.find(s => s.alive && s.role === 'sheriff');
  return allMafiaVoted && (!don || m.night.donCheck !== null) && (!sheriff || m.night.sheriffCheck !== null);
}
function startNight(m: XmMatch): void {
  resetNight(m);
  m.floorGrab = null;
  m.phase = 'night';
  // Host-paced: the night ends when every role has acted (auto) or the host
  // closes it — NOT on a hard timer, which used to resolve a premature "peaceful
  // night" before the mafia (especially 2+) could agree on a target.
  m.nightEndsAt = 0;
}

/** First night only: the mafia open their eyes and get to know each other. */
export function beginMafiaMeet(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'assign') return null;
  if (m.seats.some(s => s.cardIndex === null)) return null; // wait until everyone took a card
  resetNight(m);
  m.round = 1;
  m.phase = 'mafia_meet';
  return m;
}

/** Host closes the acquaintance screen; the day-0 introduction circle begins —
 * everyone speaks in turn, no nominations, then the first night falls. */
export function endMafiaMeet(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'mafia_meet') return null;
  m.introRound = true;
  m.floorGrab = null;
  m.nominations = []; m.nominatedBy = {};
  buildSpeechOrder(m);
  m.phase = 'speech';
  m.speechEndsAt = Date.now() + m.settings.speechSeconds * 1000;
  return m;
}

export function beginNight(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (m.phase !== 'speech' && m.phase !== 'day_announce') return null; // first night goes via mafia_meet
  m.round += 1;
  startNight(m);
  return m;
}

/** Mafia member picks the kill target for tonight. */
export function mafiaVote(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const actor = findByUser(m, byUserId);
  const target = findByUser(m, targetUserId);
  if (!actor || !actor.alive || !isMafiaRole(actor.role)) return null;
  if (!target || !target.alive || isMafiaRole(target.role)) return null; // mafia don't shoot their own
  m.night.mafiaVotes[byUserId] = targetUserId;
  maybeAutoNight(m);
  return m;
}

export function donCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const actor = findByUser(m, byUserId);
  const target = findByUser(m, targetUserId);
  if (!actor || !actor.alive || actor.role !== 'don') return null;
  if (!target || !target.alive) return null;
  m.night.donCheck = targetUserId;
  m.night.donResult = target.role === 'sheriff';
  actor.lastCheck = `🎩 ${seatLabel(target)}: ${m.night.donResult ? 'შერიფია ✓' : 'შერიფი არ არის'}`;
  maybeAutoNight(m);
  return m;
}

export function sheriffCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const actor = findByUser(m, byUserId);
  const target = findByUser(m, targetUserId);
  if (!actor || !actor.alive || actor.role !== 'sheriff') return null;
  if (!target || !target.alive) return null;
  m.night.sheriffCheck = targetUserId;
  m.night.sheriffResult = isMafiaRole(target.role);
  actor.lastCheck = `🔎 ${seatLabel(target)}: ${m.night.sheriffResult ? 'მაფიაა ✗' : 'მშვიდობიანია ✓'}`;
  maybeAutoNight(m);
  return m;
}

function resolveKill(m: XmMatch): XmSeat | null {
  const votes = Object.entries(m.night.mafiaVotes).filter(([voter]) => {
    const s = findByUser(m, voter); return s && s.alive && isMafiaRole(s.role);
  });
  if (votes.length === 0) return null;
  const tally = new Map<string, number>();
  for (const [, t] of votes) tally.set(t, (tally.get(t) ?? 0) + 1);
  let best: string | null = null, bestN = -1, tie = false;
  for (const [t, c] of tally) { if (c > bestN) { best = t; bestN = c; tie = false; } else if (c === bestN) tie = true; }
  // Tie → the don's pick decides; if the don didn't vote, no kill lands.
  if (tie) {
    const donSeat = m.seats.find(s => s.alive && s.role === 'don');
    const donPick = donSeat ? m.night.mafiaVotes[donSeat.userId] : undefined;
    best = donPick ?? null;
  }
  if (!best) return null;
  const victim = findByUser(m, best);
  return victim && victim.alive && !isMafiaRole(victim.role) ? victim : null;
}

/** Core night resolution — no host check. Used by the host action, the auto-end
 * (all roles acted) and the night timer. */
function resolveNight(m: XmMatch): void {
  if (m.phase !== 'night') return;
  const victim = resolveKill(m);
  if (victim) { victim.alive = false; victim.eliminatedRound = m.round; victim.eliminatedBy = 'mafia'; }
  m.announce = { round: m.round, killedUserId: victim?.userId ?? null, killedName: victim?.nickname ?? null };
  pushLog(m, 'night', victim ? `ღამე ${m.round}: მოკლეს ${seatLabel(victim)}` : `ღამე ${m.round}: მშვიდი ღამე — მსხვერპლი არ არის`);
  m.phase = 'day_announce';
  if (checkWin(m)) return;
  if (victim) startLastWords(m, victim.userId); // the freshly killed player gets a farewell
}

/** Auto-close the night the moment every night role has acted. */
function maybeAutoNight(m: XmMatch): void {
  if (m.phase === 'night' && nightAllActed(m)) resolveNight(m);
}

/** Host closes the night. */
export function endNight(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'night') return null;
  resolveNight(m);
  return m;
}

/** Night timer fired — resolve whatever was chosen. */
export function advanceNightAuto(matchId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  resolveNight(m);
  return m;
}

// ── Day speech ───────────────────────────────────────────────────────────────
function buildSpeechOrder(m: XmMatch): void {
  const alive = aliveSeats(m).sort((a, b) => a.seat - b.seat);
  if (alive.length === 0) { m.speechOrder = []; m.speechIdx = 0; return; }
  // Rotate the starting seat each day so the same person doesn't always open.
  const startPos = (m.round - 1) % alive.length;
  m.speechOrder = [...alive.slice(startPos), ...alive.slice(0, startPos)].map(s => s.userId);
  m.speechIdx = 0;
}

export function beginDay(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'day_announce') return null;
  m.nominations = []; m.nominatedBy = {};
  buildSpeechOrder(m);
  m.phase = 'speech';
  m.speechEndsAt = Date.now() + m.settings.speechSeconds * 1000;
  return m;
}

export function nextSpeaker(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'speech') return null;
  advanceSpeaker(m);
  return m;
}

/** Timer fired for the current speaker (byUserId null) or host skipped. */
export function advanceSpeakerAuto(matchId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'speech') return null;
  advanceSpeaker(m);
  return m;
}

/** Everyone has finished speaking — decide what comes next. */
function endSpeeches(m: XmMatch): void {
  if (m.introRound) {
    // The day-0 acquaintance circle has no vote; the first night falls.
    m.introRound = false;
    pushLog(m, 'day', 'გაცნობის წრე დასრულდა');
    startNight(m);
    return;
  }
  if (m.nominations.length === 0) { m.phase = 'day_announce'; m.announce = null; return; } // day over → night
  startVote(m);
}

function advanceSpeaker(m: XmMatch): void {
  if (m.speechIdx + 1 >= m.speechOrder.length) { endSpeeches(m); return; }
  m.speechIdx += 1;
  m.floorGrab = null;
  // Skip anyone who died/was fouled out mid-round.
  while (m.speechIdx < m.speechOrder.length) {
    const s = findByUser(m, m.speechOrder[m.speechIdx]!);
    if (s && s.alive) break;
    m.speechIdx += 1;
  }
  if (m.speechIdx >= m.speechOrder.length) { endSpeeches(m); return; }
  m.speechEndsAt = Date.now() + m.settings.speechSeconds * 1000;
}

export function extendSpeech(matchId: string, byUserId: string, seconds: number): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'speech') return null;
  m.speechEndsAt += Math.min(60, Math.max(5, seconds)) * 1000;
  return m;
}

/** The current speaker nominates one living player for the day's vote. */
export function nominate(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'speech' || m.introRound) return null; // no nominations in the acquaintance circle
  if (m.speechOrder[m.speechIdx] !== byUserId) return null; // only the active speaker
  const target = findByUser(m, targetUserId);
  if (!target || !target.alive) return null;
  // one nomination per speaker; changing it is allowed
  const prev = m.nominatedBy[byUserId];
  if (prev && prev !== targetUserId) {
    // remove old if nobody else nominated it
    if (!Object.entries(m.nominatedBy).some(([k, v]) => k !== byUserId && v === prev)) {
      m.nominations = m.nominations.filter(x => x !== prev);
    }
  }
  m.nominatedBy[byUserId] = targetUserId;
  if (!m.nominations.includes(targetUserId)) m.nominations.push(targetUserId);
  return m;
}

// ── Vote ──────────────────────────────────────────────────────────────────────
function startVote(m: XmMatch): void {
  m.votes = {};
  m.voteResult = null;
  m.voteRevote = false;
  m.phase = 'vote';
  m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
}

export function castVote(matchId: string, byUserId: string, nomineeUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'vote') return null;
  const voter = findByUser(m, byUserId);
  if (!voter || !voter.alive) return null;
  if (!m.nominations.includes(nomineeUserId)) return null;
  m.votes[byUserId] = nomineeUserId;
  // Auto-resolve once every living player has voted.
  const voters = aliveSeats(m);
  if (voters.every(s => m.votes[s.userId])) resolveVote(m);
  return m;
}

function resolveVote(m: XmMatch): void {
  const tally: Record<string, number> = {};
  for (const nominee of m.nominations) tally[nominee] = 0;
  for (const v of Object.values(m.votes)) tally[v] = (tally[v] ?? 0) + 1;
  let bestN = -1; const tied: string[] = [];
  for (const [nominee, c] of Object.entries(tally)) {
    if (c > bestN) { bestN = c; tied.length = 0; tied.push(nominee); }
    else if (c === bestN) tied.push(nominee);
  }
  const noElim = () => { m.phase = 'day_announce'; m.announce = null; };

  if (bestN <= 0) { m.voteResult = { eliminatedUserId: null, tally }; noElim(); return; } // nobody voted

  if (tied.length === 1) {
    const elim = tied[0]!;
    m.voteResult = { eliminatedUserId: elim, tally };
    const s = findByUser(m, elim);
    if (s) { s.alive = false; s.eliminatedRound = m.round; s.eliminatedBy = 'vote'; pushLog(m, 'day', `დღე ${m.round}: ხმით გაირიცხა ${seatLabel(s)}`); }
    if (checkWin(m)) return;
    startLastWords(m, elim);
    return;
  }

  // Tie → one re-vote ("lift") between the tied candidates; a second tie spares everyone.
  if (!m.voteRevote) {
    m.nominations = [...tied];
    m.votes = {};
    m.voteResult = null;
    m.voteRevote = true;
    m.phase = 'vote';
    m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
    return;
  }
  m.voteResult = { eliminatedUserId: null, tally };
  pushLog(m, 'day', `დღე ${m.round}: ხმები კვლავ გაიყო — არავინ გავიდა`);
  noElim();
}

/** Host closes the vote early (timer or manual). */
export function endVote(matchId: string, byUserId: string | null): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'vote') return null;
  if (byUserId !== null && m.hostId !== byUserId) return null;
  resolveVote(m);
  return m;
}

// ── Fouls ──────────────────────────────────────────────────────────────────────
export function giveFoul(matchId: string, byUserId: string, targetUserId: string, delta: number): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  const s = findByUser(m, targetUserId);
  if (!s || !s.alive) return null;
  s.fouls = Math.max(0, Math.min(XM_FOULS_TO_ELIMINATE, s.fouls + (delta >= 0 ? 1 : -1)));
  if (s.fouls >= XM_FOULS_TO_ELIMINATE) {
    s.alive = false; s.eliminatedRound = m.round; s.eliminatedBy = 'fouls';
    pushLog(m, 'foul', `${seatLabel(s)} — 4 ფაული, გარიცხულია`);
    // If the fouled-out player was the active speaker, move on.
    if (m.phase === 'speech' && m.speechOrder[m.speechIdx] === targetUserId) advanceSpeaker(m);
    checkWin(m);
  }
  return m;
}

// ── Player "foul": grab the mic for 6 seconds out of turn ───────────────────────
export const FLOOR_GRAB_MS = 6000;
export function grabFloor(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.phase !== 'speech' && m.phase !== 'vote' && m.phase !== 'last_words' && m.phase !== 'day_announce') return null;
  const seat = findByUser(m, byUserId);
  if (!seat || !seat.alive) return null;
  if (m.floorGrab && m.floorGrab.until > Date.now()) return null; // one interjection at a time
  m.floorGrab = { userId: byUserId, until: Date.now() + FLOOR_GRAB_MS };
  return m;
}

// ── Last words ──────────────────────────────────────────────────────────────────
function startLastWords(m: XmMatch, userId: string): void {
  m.lastWordsUserId = userId;
  m.phase = 'last_words';
  m.lastWordsEndsAt = Date.now() + m.settings.lastWordsSeconds * 1000;
}

/** Host (or timer) ends the farewell speech; flow returns to the day/night loop. */
export function endLastWords(matchId: string, byUserId: string | null): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'last_words') return null;
  if (byUserId !== null && m.hostId !== byUserId) return null;
  const seat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;
  m.lastWordsUserId = null;
  if (checkWin(m)) return m;
  // A night victim's farewell → it's the morning, the host runs the day (announce
  // stands). A day elimination (vote/foul) → the day is over, so clear the announce;
  // day_announce with a null announce is the "night falls next" state.
  if (seat && seat.eliminatedBy === 'mafia') { m.phase = 'day_announce'; }
  else { m.phase = 'day_announce'; m.announce = null; }
  return m;
}

// ── Win detection ─────────────────────────────────────────────────────────────
function checkWin(m: XmMatch): boolean {
  const mafia = aliveMafia(m).length;
  const town = aliveTown(m).length;
  let winner: XmWinner = null;
  if (mafia === 0) winner = 'town';
  else if (mafia >= town) winner = 'mafia';
  if (winner) {
    m.winner = winner;
    m.phase = 'finished';
    m.reveal = m.seats.map(s => ({ userId: s.userId, nickname: s.nickname, seat: s.seat, role: s.role! }));
    pushLog(m, 'game', winner === 'mafia' ? '🔫 მაფიამ გაიმარჯვა' : '🏙 ქალაქმა გაიმარჯვა');
    return true;
  }
  return false;
}

export function rematch(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'finished') return null;
  // Keep the host and connected seats; fold spectators into open seats.
  const keep = m.seats.filter(s => s.connected);
  for (const sp of m.spectators.filter(s => s.connected)) {
    if (keep.length >= m.maxSeats) break;
    keep.push({ userId: sp.userId, socketId: sp.socketId, nickname: sp.nickname, seat: 0, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null });
  }
  m.seats = keep;
  m.seats.forEach((s, i) => { s.seat = i + 1; s.role = null; s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null; s.cardIndex = null; });
  m.deck = [];
  m.spectators = [];
  m.phase = 'lobby';
  m.round = 0;
  m.introRound = false;
  m.speechOrder = []; m.speechIdx = 0; m.speechEndsAt = 0; m.nominations = []; m.nominatedBy = {};
  resetNight(m); m.nightEndsAt = 0;
  m.announce = null; m.votes = {}; m.voteEndsAt = 0; m.voteRevote = false; m.voteResult = null;
  m.lastWordsUserId = null; m.lastWordsEndsAt = 0; m.floorGrab = null; m.winner = null; m.reveal = null; m.dissolved = false;
  m.log = [];
  return m;
}

// ── Safe state ─────────────────────────────────────────────────────────────────
export function getSafeState(m: XmMatch, viewerUserId: string): XmSafeState {
  const amHost = m.hostId === viewerUserId;
  const meSeat = findByUser(m, viewerUserId);
  const amSpectator = !amHost && !meSeat;
  const myRole = meSeat?.role ?? null;
  const iAmMafia = isMafiaRole(myRole);
  const gameOver = m.phase === 'finished';

  // Who may I see the role of?  Host & game-over: everyone. Mafia: fellow mafia. Else: myself only.
  const canSeeRole = (s: XmSeat): boolean => {
    if (amHost || gameOver) return true;
    if (s.userId === viewerUserId) return true;
    if (iAmMafia && isMafiaRole(s.role)) return true;
    return false;
  };

  const speakingUserId = m.phase === 'speech' ? (m.speechOrder[m.speechIdx] ?? null) : null;

  const seats: XmSafeSeat[] = m.seats.map(s => ({
    userId: s.userId, socketId: s.socketId, nickname: s.nickname, seat: s.seat, connected: s.connected,
    alive: s.alive, fouls: s.fouls, eliminatedBy: s.eliminatedBy,
    role: canSeeRole(s) ? s.role : null,
    isSpeaking: s.userId === speakingUserId,
    isNominated: m.nominations.includes(s.userId),
  }));

  const mateIds = iAmMafia && !gameOver
    ? m.seats.filter(s => isMafiaRole(s.role) && s.userId !== viewerUserId).map(s => s.userId)
    : [];

  // Night private info + whether I already acted. The check result persists past
  // the night (via seat.lastCheck) so the investigator keeps their information
  // even when the night auto-resolves the instant they act.
  let iActedTonight = false;
  let nightPrivate: string | null = null;
  if (meSeat && meSeat.alive && (meSeat.role === 'don' || meSeat.role === 'sheriff')) {
    nightPrivate = meSeat.lastCheck;
  }
  if (m.phase === 'night' && meSeat && meSeat.alive) {
    if (meSeat.role === 'don') iActedTonight = m.night.donCheck !== null && !!m.night.mafiaVotes[viewerUserId];
    else if (isMafiaRole(meSeat.role)) iActedTonight = !!m.night.mafiaVotes[viewerUserId];
    else if (meSeat.role === 'sheriff') iActedTonight = m.night.sheriffCheck !== null;
  }

  const lastWordsSeat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;

  // Mafia see each other's kill picks live (consensus building).
  const mafiaPicks = (iAmMafia && m.phase === 'night')
    ? aliveMafia(m).filter(s => m.night.mafiaVotes[s.userId]).map(s => {
        const t = findByUser(m, m.night.mafiaVotes[s.userId]!);
        return { userId: s.userId, nickname: s.nickname, targetId: m.night.mafiaVotes[s.userId]!, targetName: t?.nickname ?? '?' };
      })
    : [];

  return {
    id: m.id, code: m.code, phase: m.phase,
    hostId: m.hostId, hostName: m.hostName, hostSocketId: m.hostSocketId, hostConnected: m.hostConnected,
    maxSeats: m.maxSeats,
    seats,
    spectatorCount: m.spectators.filter(s => s.connected).length,
    settings: m.settings,
    setup: effectiveCounts(m),
    roleConfigCustom: m.roleConfig !== null,
    round: m.round,
    amHost, amSpectator,
    mySeat: meSeat?.seat ?? null,
    myRole,
    myAlive: meSeat?.alive ?? false,
    myFouls: meSeat?.fouls ?? 0,
    mateIds,
    cards: m.phase === 'assign' ? m.deck.map((_, index) => {
      const holder = m.seats.find(s => s.cardIndex === index) ?? null;
      return { index, claimedById: holder?.userId ?? null, claimedByName: holder?.nickname ?? null, claimedBySeat: holder?.seat ?? null };
    }) : [],
    myCardIndex: meSeat?.cardIndex ?? null,
    introRound: m.introRound,
    speakingUserId,
    speechEndsAt: m.phase === 'speech' ? m.speechEndsAt : 0,
    speechIdx: m.speechIdx,
    speechTotal: m.speechOrder.length,
    nominations: m.nominations.map(uid => { const s = findByUser(m, uid); return { userId: uid, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 }; }),
    iNominated: !!(meSeat && m.nominatedBy[viewerUserId]),
    nightEndsAt: m.phase === 'night' ? m.nightEndsAt : 0,
    iActedTonight,
    nightPrivate,
    nightAllActed: m.phase === 'night' ? nightAllActed(m) : false,
    mafiaPicks,
    announce: (m.phase === 'day_announce' || m.phase === 'last_words') ? m.announce : null,
    voteEndsAt: m.phase === 'vote' ? m.voteEndsAt : 0,
    voteRevote: m.phase === 'vote' ? m.voteRevote : false,
    myVote: m.votes[viewerUserId] ?? null,
    voteTally: (() => { const t: Record<string, number> = {}; for (const nm of m.nominations) t[nm] = 0; for (const v of Object.values(m.votes)) t[v] = (t[v] ?? 0) + 1; return t; })(),
    voteResult: m.phase === 'vote' ? m.voteResult : null,
    lastWordsUserId: m.lastWordsUserId,
    lastWordsName: lastWordsSeat?.nickname ?? null,
    lastWordsEndsAt: m.phase === 'last_words' ? m.lastWordsEndsAt : 0,
    floorGrabUserId: m.floorGrab?.userId ?? null,
    floorGrabUntil: m.floorGrab?.until ?? 0,
    log: m.log.slice(-40),
    winner: m.winner,
    reveal: m.reveal,
    dissolved: m.dissolved,
    myUserId: viewerUserId,
  };
}
