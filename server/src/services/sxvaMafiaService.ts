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
import {
  SPORT_SEATS, SPORT_ROLES, SPORT_TIMES, canStartSport,
  sheriffSees, agreedTarget, teamHasActed, tribunalElectorate, tribunalVerdict,
} from './sportMafiaRules.js';
import { limitsForSync } from './vipService.js';

/**
 * The roles.
 *
 * The three optional ones are their own factions or their own problem:
 *  • doctor — town, saves one person a night from whatever came for them
 *  • maniac — nobody's friend, kills one person a night, wins alone
 *  • cult   — converts a player a night; wins when the table is all cult
 */
export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen' | 'doctor' | 'maniac' | 'cult';
export type XmPhase =
  | 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech'
  | 'vote' | 'last_words' | 'finished'
  /* Sport only — see sportMafiaRules.ts */
  | 'plan_night'         // the opening night: the mafia agree an order, nobody dies
  | 'tribunal_defense'   // a tied player defends themselves
  | 'tribunal_vote';     // the rest of the town decides: both, or neither
export type XmWinner = 'town' | 'mafia' | 'maniac' | 'cult' | null;

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
  /**
   * In the cult — the leader, or somebody they converted.
   *
   * Kept apart from `role` because a convert keeps the card they were dealt: a
   * converted doctor still heals, they just win with the cult now. Mafia and the
   * maniac cannot be converted, so this never overlaps those factions.
   */
  cult: boolean;
  /**
   * Do they know yet?
   *
   * A convert belongs to the cult from the moment it happens — that is what
   * decides who wins — but they are not told until the next night falls. Being
   * told the same morning would hand them a day of certainty they did nothing
   * to earn, and would let the table read the conversion off their face.
   */
  cultRevealed: boolean;
  /**
   * They left, or the host removed them.
   *
   * Distinct from `connected: false`, which means a socket dropped and may come
   * back. `left` means stop sending them state — a broadcast that keeps
   * reaching someone who has walked away is how a dissolved room reopens on
   * their screen after they have closed it.
   */
  left: boolean;
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
  /** The doctor's patient tonight. Immune to every kill that lands. */
  doctorHeal: string | null;
  /** The maniac's target tonight. */
  maniacKill: string | null;
  /** Who the cult leader tried to convert, and whether it took. */
  cultConvert: string | null;
  cultResult: 'converted' | 'immune' | null;
}

export interface XmAnnounce {
  round: number;
  /**
   * Everyone who died in the night.
   *
   * A list, not one name: with a maniac at the table two people can die in the
   * same night, and an announcement that can only carry one of them is an
   * announcement that lies.
   */
  killed: { userId: string; nickname: string; seat: number }[];
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
  /**
   * Playing the tournament ruleset.
   *
   * Decided once, at the deal, and never afterwards — a match cannot change
   * which game it is halfway through. See `sportMafiaRules.ts` for what it
   * changes and why.
   */
  sport: boolean;
  /** Host's request for sport, set in the lobby. Only honoured at ten seats. */
  sportRequested: boolean;
  /**
   * The tribunal in progress.
   *
   * `onTrial` is the tied players in speaking order, `defenseIdx` whose turn it
   * is, and `votes` the town's verdicts once the defences are done. Null
   * between tribunals rather than a set of empty fields, so "is there a
   * tribunal" is one question with one answer.
   */
  tribunal: {
    onTrial: string[];
    defenseIdx: number;
    defenseEndsAt: number;
    votes: Record<string, 'punish' | 'free'>;
    endsAt: number;
    /** Set once decided, so the result screen can say what happened. */
    verdict: 'punish' | 'free' | null;
  } | null;
  roleConfig: { don: number; mafia: number; sheriff: number; doctor: number; maniac: number; cult: number } | null; // host override; null = auto by count
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
  /**
   * Which nominee is on the floor.
   *
   * The vote is sequential, the way a moderator runs it out loud: one candidate
   * at a time, hands up, count, next. A simultaneous secret ballot is a
   * different game — half of table mafia is watching who raises their hand and
   * when.
   */
  voteIdx: number;
  voteEndsAt: number;
  voteRevote: boolean;           // this vote is a tie-break re-vote
  voteResult: { eliminatedUserId: string | null; tally: Record<string, number> } | null;
  // last words
  lastWordsUserId: string | null;
  lastWordsEndsAt: number;
  /** Farewells still owed — two can die in one night. */
  lastWordsQueue: string[];
  /** The doctor's previous patient: they may not heal the same person twice running. */
  lastHeal: string | null;
  // a player's 6-second "foul" — grabbing the mic out of turn
  floorGrab: { userId: string; until: number } | null;
  // end
  winner: XmWinner;
  reveal: { userId: string; nickname: string; seat: number; role: XmRole }[] | null;
  dissolved: boolean;
  /** The host walked away too — stop broadcasting to them. */
  hostLeft: boolean;
  createdAt: number;
}

// ── Per-viewer safe state ──────────────────────────────────────────────────────
export interface XmSafeSeat {
  userId: string; socketId: string; nickname: string; seat: number; connected: boolean;
  alive: boolean; fouls: number; eliminatedBy: XmSeat['eliminatedBy'];
  role: XmRole | null;   // filled only when the viewer is allowed to know it
  isSpeaking: boolean;
  isNominated: boolean;
  /** In the cult — visible only to the cult, and to everyone at the reveal. */
  cult: boolean;
  /**
   * They have raised their hand in this vote.
   *
   * Public on purpose. A vote in table mafia happens with hands in the air —
   * seeing who votes, and how quickly, is most of the information in the game.
   */
  hasVoted: boolean;
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
  /** Am I in the cult (leader or converted)? */
  myCult: boolean;
  /** The doctor may not repeat a patient; this is who is off limits tonight. */
  healBlockedId: string | null;
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
  nextSpeaker: { nickname: string; seat: number } | null;
  nominations: { userId: string; nickname: string; seat: number }[];
  iNominated: boolean;
  // night
  nightEndsAt: number;
  iActedTonight: boolean;       // did my night role already submit
  nightPrivate: string | null;  // result text for don/sheriff (only to them)
  /**
   * Did I check TONIGHT?
   *
   * Distinct from having a result at all: `nightPrivate` holds last night's
   * answer too, and a don whose panel unlocked on a stale result would skip
   * this night's check entirely.
   */
  iCheckedTonight: boolean;
  nightAllActed: boolean;       // host hint: everyone with a night role has acted
  mafiaPicks: { userId: string; nickname: string; targetId: string; targetName: string }[]; // mafia-only: teammate kill choices
  /** Playing the tournament ruleset — see sportMafiaRules.ts. */
  sport: boolean;
  /** Host asked for sport in the lobby; only honoured at ten seats. */
  sportRequested: boolean;
  /** Why sport cannot start yet, for the lobby. Null when it can. */
  sportBlockedReason: string | null;
  /**
   * The tribunal, as this viewer may see it.
   *
   * `myVerdict` is the viewer's own, and the tally is only sent once the
   * tribunal is over — a running count would let the last few voters see
   * exactly how many more are needed, which turns a verdict into arithmetic.
   */
  tribunal: {
    onTrial: { userId: string; nickname: string; seat: number }[];
    defenseIdx: number;
    defenseEndsAt: number;
    speakingUserId: string | null;
    endsAt: number;
    iAmOnTrial: boolean;
    canVote: boolean;
    myVerdict: 'punish' | 'free' | null;
    votesCast: number;
    votesTotal: number;
    verdict: 'punish' | 'free' | null;
    tally: { punish: number; free: number } | null;
  } | null;
  announce: XmAnnounce | null;
  // vote
  voteEndsAt: number;
  voteRevote: boolean;
  /** The nominee on the floor right now, and where they sit in the list. */
  voteCandidate: { userId: string; nickname: string; seat: number } | null;
  voteIdx: number;
  voteTotal: number;
  /** True on the last candidate: everyone silent is counted for them. */
  voteIsLast: boolean;
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

export interface XmRoleCounts {
  don: number; mafia: number; sheriff: number;
  doctor: number; maniac: number; cult: number;
  citizen: number;
}

/**
 * Role split for a given number of seated players (host excluded).
 *
 * The optional roles are off by default. They change the game a great deal —
 * a maniac makes the mafia's parity meaningless, a cult can take the table from
 * under everybody — so they are something a host turns on, not something that
 * appears because enough people sat down.
 *
 * THE DON IS THE SECOND MAFIOSO, NOT THE FIRST
 * ────────────────────────────────────────────
 * A small table gets one mafioso, and that one used to be the don — which
 * handed a six-player game a nightly sheriff check nobody asked for, and made
 * "no don" something a host had to go and turn off. The don is the mafia's
 * leader, and a leader of one is not a rank, it is a solitary player with an
 * extra power. So the plain mafia fills first: the don appears at seven
 * players, when there is somebody for them to lead. A host who wants one
 * sooner still adds it in the setup panel.
 */
export function roleCounts(n: number): XmRoleCounts {
  const mafiaTotal = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4; // includes the don
  const don = mafiaTotal >= 2 ? 1 : 0;
  const mafia = mafiaTotal - don;
  const sheriff = n >= 5 ? 1 : 0;
  const citizen = Math.max(0, n - don - mafia - sheriff);
  return { don, mafia, sheriff, doctor: 0, maniac: 0, cult: 0, citizen };
}

/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export function effectiveCounts(m: XmMatch): XmRoleCounts {
  const n = m.seats.length;
  if (!m.roleConfig) return roleCounts(n);

  const cfg = m.roleConfig;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(v || 0)));
  let don = clamp(cfg.don, 2);
  let mafia = clamp(cfg.mafia, 9);
  let sheriff = clamp(cfg.sheriff, 2);
  let doctor = clamp(cfg.doctor, 2);
  let maniac = clamp(cfg.maniac, 2);
  let cult = clamp(cfg.cult, 1);

  // A mafia game needs at least one mafia-team member.
  if (don + mafia === 0) mafia = 1;

  /*
   * Trim what does not fit, worst-first.
   *
   * Order matters and it is a design decision: the specials a host added on
   * purpose (cult, maniac, doctor) are the first to go when the table is too
   * small, because losing one of them leaves a game that still works. Losing the
   * mafia does not.
   *
   * The don goes before the last plain mafioso, for the same reason the
   * automatic split fills the mafia first: a don with nobody to lead is just a
   * lone player with a sheriff check attached.
   */
  const total = () => don + mafia + sheriff + doctor + maniac + cult;
  const trim = (take: () => void) => { while (total() > n) take(); };
  trim(() => { if (cult > 0) cult -= 1; else if (maniac > 0) maniac -= 1; else if (doctor > 0) doctor -= 1;
               else if (sheriff > 0) sheriff -= 1; else if (don > 0 && mafia > 0) don -= 1;
               else if (mafia > 0) mafia -= 1; else if (don > 0) don -= 1; else return; });

  if (don + mafia === 0 && n >= 2) mafia = 1;

  // And always leave at least one plain townsperson, or the day has nobody in it.
  const citizen = Math.max(0, n - total());
  return { don, mafia, sheriff, doctor, maniac, cult, citizen };
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
    night: emptyNight(),
    nightEndsAt: 0,
    announce: null,
    votes: {}, voteIdx: 0, voteEndsAt: 0, voteRevote: false, voteResult: null,
    lastWordsUserId: null, lastWordsEndsAt: 0, lastWordsQueue: [], lastHeal: null, floorGrab: null,
    winner: null, reveal: null, dissolved: false, hostLeft: false, createdAt: Date.now(),
    sport: false, sportRequested: false, tribunal: null,
  };
  matches.set(id, m);
  // unref: a three-hour cleanup timer must not be the reason a process refuses
  // to exit. It is housekeeping, not work anybody is waiting on.
  setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000).unref();
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

/**
 * Every live hosted table, for the moderation panel.
 *
 * Hosted mafia keeps its matches in this module's own map, and the mod panel
 * only ever asked `getAllRooms()` — which is classic mafia's. So a hosted table
 * with nine people in it was invisible to moderation: not in the room list, not
 * in the "active rooms" count, and not closable. It was simply added after the
 * panel was built and nobody joined the two up.
 *
 * Roles are deliberately absent. A moderator watching a live game must not be
 * able to read who the mafia are — that is the same rule classic mafia's live
 * view already follows, and it matters more here, because the hosted table's
 * whole premise is a human moderator sitting outside the game.
 */
export interface XmModRoom {
  id: string;
  code: string;
  phase: XmPhase;
  round: number;
  playerCount: number;
  hostName: string;
  players: { id: string; name: string; seat: number; isAlive: boolean; isConnected: boolean; profileId: string | null }[];
}

export function listMatchesForMod(): XmModRoom[] {
  return [...matches.values()]
    .filter(m => m.phase !== 'finished' && !m.dissolved)
    .map(m => ({
      id: m.id,
      code: m.code,
      phase: m.phase,
      round: m.round,
      playerCount: m.seats.filter(s => !s.left).length,
      hostName: m.hostName,
      players: m.seats.filter(s => !s.left).map(s => ({
        id: s.userId, name: s.nickname, seat: s.seat,
        isAlive: s.alive, isConnected: s.connected, profileId: s.userId,
        // role and team intentionally omitted — never expose a live game
      })),
    }));
}

/** Is this id a hosted table? Lets the shared mod actions route correctly. */
export function isHostedMatch(id: string): boolean {
  return matches.has(id);
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
  // Walking back in clears the "they left" flag — for the host too, so a
  // dissolved room they re-enter behaves like a room again.
  if (m.hostId === userId) {
    m.hostSocketId = socketId; m.hostConnected = true; m.hostName = nickname; m.hostLeft = false;
    return { match: m, isNew: false };
  }
  const seat = findByUser(m, userId);
  if (seat) {
    // A player the host removed does not get back in by re-joining.
    if (seat.left && seat.eliminatedBy === 'fouls') return null;
    seat.socketId = socketId; seat.connected = true; seat.left = false;
    return { match: m, isNew: false };
  }
  const spec = m.spectators.find(s => s.userId === userId);
  if (spec) { spec.socketId = socketId; spec.connected = true; return { match: m, isNew: false }; }
  if (m.phase === 'lobby' && m.seats.length < m.maxSeats) {
    m.seats.push({ userId, socketId, nickname, seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false });
    return { match: m, isNew: true };
  }
  m.spectators.push({ userId, socketId, nickname, connected: true });
  return { match: m, isNew: true };
}

/**
 * Seat a test bot.
 *
 * Separate from `joinMatch` because a bot has no socket: there is no id to
 * store, nothing to reconnect, and nothing to broadcast to. Lobby only — a bot
 * cannot walk into a game that has already dealt, for the same reason a person
 * cannot.
 */
export function joinMatchAsBot(matchId: string, botId: string, nickname: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'lobby') return null;
  if (m.seats.length >= m.maxSeats) return null;
  m.seats.push({
    userId: botId, socketId: `nosocket_${botId}`, nickname,
    seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0,
    eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false,
  });
  return m;
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
  // `left`, not just `connected: false` — they chose to go, so the room stops
  // pushing state at them. A dropped connection is a different thing and keeps
  // its seat warm.
  if (seat) {
    seat.connected = false;
    seat.left = true;
    // Walking out is the one way to be gone without dying, so it is the one
    // path that does not already pass through `checkWin`.
    dissolveCultIfLeaderGone(m);
  }
  m.spectators = m.spectators.filter(s => s.userId !== userId);
  return m;
}

/**
 * Who is still in the room and should be sent state.
 *
 * The host counts unless they have left — and when they dissolve the room they
 * have left. Without that, the person who just closed the room receives the
 * closed room back, which reopens it on their screen; pressing "leave" then
 * dissolves it again, and they are in a loop they cannot get out of.
 */
export function recipients(m: XmMatch): { userId: string; socketId: string }[] {
  const out: { userId: string; socketId: string }[] = [];
  if (!m.hostLeft) out.push({ userId: m.hostId, socketId: m.hostSocketId });
  for (const s of m.seats) if (!s.left) out.push({ userId: s.userId, socketId: s.socketId });
  for (const s of m.spectators) out.push({ userId: s.userId, socketId: s.socketId });
  return out;
}

/**
 * The host removes a player.
 *
 * In the lobby the seat simply goes. In a live game the player is eliminated
 * and recorded as fouled out, because that is what a removal mid-game IS in
 * hosted mafia — the moderator is not deleting a person, they are ruling them
 * out of the round, and the protocol should say so.
 */
export function kickPlayer(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (targetUserId === m.hostId) return null;          // the host cannot remove themselves

  const seat = findByUser(m, targetUserId);
  if (!seat) {
    const spec = m.spectators.find(x => x.userId === targetUserId);
    if (!spec) return null;
    m.spectators = m.spectators.filter(x => x.userId !== targetUserId);
    return m;
  }

  if (m.phase === 'lobby') {
    m.seats = m.seats.filter(s => s.userId !== targetUserId);
    m.seats.forEach((s, i) => { s.seat = i + 1; });
    return m;
  }

  seat.left = true;
  seat.connected = false;
  if (seat.alive) {
    seat.alive = false;
    seat.eliminatedRound = m.round;
    seat.eliminatedBy = 'fouls';
    pushLog(m, 'foul', `${seatLabel(seat)} — ჰოსტმა გარიცხა`);
    if (m.phase === 'speech' && m.speechOrder[m.speechIdx] === targetUserId) advanceSpeaker(m);
    checkWin(m);
  }
  return m;
}

/**
 * Reconnect.
 *
 * State is broadcast to stored socket ids, and a phone that locks its screen or
 * changes network comes back with a NEW one — so the old handle is dead and the
 * player's table simply stops updating. Nothing errors; they just freeze while
 * everyone else plays on. Asking on reconnect is what un-freezes them.
 *
 * Someone the host removed does not come back this way: `left` with a fouls
 * ruling is a decision, not a dropped connection.
 */
export function resumeForUser(userId: string, socketId: string): XmMatch | null {
  for (const m of matches.values()) {
    if (m.dissolved) continue;
    if (m.hostId === userId) {
      if (m.hostLeft) continue;
      m.hostSocketId = socketId;
      m.hostConnected = true;
      return m;
    }
    const seat = m.seats.find(s => s.userId === userId);
    if (seat) {
      if (seat.left) continue;
      seat.socketId = socketId;
      seat.connected = true;
      return m;
    }
    const spec = m.spectators.find(s => s.userId === userId);
    if (spec) { spec.socketId = socketId; spec.connected = true; return m; }
  }
  return null;
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
  // The host is out of the room the moment they close it: they must not be a
  // recipient of the very broadcast that tells everyone it is closed.
  m.hostLeft = true;
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
    eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false,
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
  const { don, mafia, sheriff, doctor, maniac, cult } = effectiveCounts(m);
  const pool: XmRole[] = [
    ...Array(don).fill('don'),
    ...Array(mafia).fill('mafia'),
    ...Array(sheriff).fill('sheriff'),
    ...Array(doctor).fill('doctor'),
    ...Array(maniac).fill('maniac'),
    ...Array(cult).fill('cult'),
  ];
  while (pool.length < n) pool.push('citizen');
  m.deck = shuffle(pool);
  m.seats.forEach(s => {
    s.role = null; s.cardIndex = null; s.cult = false; s.cultRevealed = false;
    s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null;
  });
}

export function startMatch(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'lobby') return null;
  if (m.seats.length < 4) return null;

  /*
   * Which game is this? Answered once, here, and never again.
   *
   * The host asks for sport in the lobby; the table has to be ten-handed. If
   * both hold, the composition is forced to the tournament split — the host
   * does not get to adjust it, because a table anybody can tune is a house
   * rule and sport's premise is that every table is the same table.
   *
   * If sport was asked for and the table does not qualify, the match refuses
   * to start rather than quietly dealing the casual rules under the sport
   * name. `startSportError` is what tells the host which half is missing.
   */
  if (m.sportRequested) {
    if (!canStartSport(m.seats.length, true).ok) return null;
    m.sport = true;
    m.roleConfig = { ...SPORT_ROLES };
  } else {
    m.sport = false;
  }
  m.tribunal = null;

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
  // The cult leader starts the cult of one, and knows it.
  if (seat.role === 'cult') { seat.cult = true; seat.cultRevealed = true; }
  return m;
}

/** Host configures the role composition (lobby or assign). Pass null to reset to auto. */
export function setRoleConfig(
  matchId: string,
  byUserId: string,
  cfg: { don: number; mafia: number; sheriff: number; doctor?: number; maniac?: number; cult?: number } | null,
): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (m.phase !== 'lobby' && m.phase !== 'assign') return null;
  if (!cfg) { m.roleConfig = null; }
  else {
    m.roleConfig = {
      don: Math.max(0, Math.min(2, Math.floor(Number(cfg.don ?? 0)))),
      mafia: Math.max(0, Math.min(9, Math.floor(Number(cfg.mafia ?? 0)))),
      sheriff: Math.max(0, Math.min(2, Math.floor(Number(cfg.sheriff ?? 0)))),
      doctor: Math.max(0, Math.min(2, Math.floor(Number(cfg.doctor ?? 0)))),
      maniac: Math.max(0, Math.min(2, Math.floor(Number(cfg.maniac ?? 0)))),
      cult: Math.max(0, Math.min(1, Math.floor(Number(cfg.cult ?? 0)))),
    };
  }
  if (m.phase === 'assign') dealCards(m); // re-deal with the new split (everyone re-picks)
  return m;
}

/** Host tweaks timers / floor control. Durations only editable before play starts. */
export function setSettings(matchId: string, byUserId: string, patch: Partial<XmMatch['settings']> & { sport?: boolean }): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (typeof patch.floorControl === 'boolean') m.settings.floorControl = patch.floorControl; // any time
  /*
   * Sport is asked for in the lobby and nowhere else.
   *
   * The timings are the tournament's, not the host's, so turning it on
   * overwrites them — a table where the speeches are ninety seconds is not the
   * tournament ruleset with a tweak, it is a different game. Turning it back
   * off leaves them where sport put them rather than guessing at what they
   * were, which is honest: the host can set them again.
   */
  if (typeof patch.sport === 'boolean' && m.phase === 'lobby') {
    m.sportRequested = patch.sport;
    if (patch.sport) {
      m.settings.speechSeconds = SPORT_TIMES.speech;
      m.settings.lastWordsSeconds = SPORT_TIMES.lastWords;
      m.roleConfig = { ...SPORT_ROLES };
    }
  }
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
function emptyNight(): XmNightState {
  return {
    mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null,
    doctorHeal: null, maniacKill: null, cultConvert: null, cultResult: null,
  };
}

function resetNight(m: XmMatch): void {
  m.night = emptyNight();
}
function seatLabel(s: XmSeat): string { return `#${s.seat} ${s.nickname}`; }
function pushLog(m: XmMatch, phase: XmLogEntry['phase'], text: string): void {
  m.log.push({ round: m.round, phase, text });
  if (m.log.length > 60) m.log.shift();
}
/** True once everyone who has a night action tonight has submitted it. */
function nightAllActed(m: XmMatch): boolean {
  const mafia = aliveMafia(m);
  /*
   * Having acted is not the same as having agreed.
   *
   * In sport a team that all pressed different names is finished — they have
   * simply wasted the night — and the night has to close on that, or a
   * disagreeing team would hang the game waiting for a consensus the rules do
   * not require.
   */
  const allMafiaVoted = mafia.length === 0
    || (m.sport ? teamHasActed(mafia, m.night.mafiaVotes) : mafia.every(s => m.night.mafiaVotes[s.userId]));
  const has = (role: XmRole) => m.seats.some(s => s.alive && s.role === role);
  return allMafiaVoted
    && (!has('don') || m.night.donCheck !== null)
    && (!has('sheriff') || m.night.sheriffCheck !== null)
    && (!has('doctor') || m.night.doctorHeal !== null)
    && (!has('maniac') || m.night.maniacKill !== null)
    && (!has('cult') || m.night.cultConvert !== null);
}

// ── The optional roles' night actions ────────────────────────────────────────

/**
 * The doctor picks tonight's patient.
 *
 * Not the same person two nights running — otherwise one player is simply
 * immortal and the mafia has nothing to aim at. Healing yourself is allowed;
 * healing yourself every night is not, by the same rule.
 */
export function doctorHeal(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const doc = findByUser(m, byUserId);
  if (!doc || !doc.alive || doc.role !== 'doctor') return null;
  if (m.night.doctorHeal !== null) return null;              // one patient a night
  const target = findByUser(m, targetUserId);
  if (!target || !target.alive) return null;
  if (m.lastHeal === targetUserId) return null;              // not twice running
  m.night.doctorHeal = targetUserId;
  maybeAutoNight(m);
  return m;
}

/** The maniac picks tonight's target. Nobody's friend, so anyone but themselves. */
export function maniacKill(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const maniac = findByUser(m, byUserId);
  if (!maniac || !maniac.alive || maniac.role !== 'maniac') return null;
  if (m.night.maniacKill !== null) return null;
  const target = findByUser(m, targetUserId);
  if (!target || !target.alive || target.userId === byUserId) return null;
  m.night.maniacKill = targetUserId;
  maybeAutoNight(m);
  return m;
}

/**
 * The cult leader tries to convert somebody.
 *
 * Whether it takes is decided at resolution, not here: the leader finds out
 * with everyone else's night, which is what makes trying it on a quiet player
 * a real gamble rather than a free probe.
 */
export function cultConvert(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const leader = findByUser(m, byUserId);
  if (!leader || !leader.alive || leader.role !== 'cult') return null;
  if (m.night.cultConvert !== null) return null;
  const target = findByUser(m, targetUserId);
  if (!target || !target.alive || target.userId === byUserId) return null;
  m.night.cultConvert = targetUserId;
  maybeAutoNight(m);
  return m;
}
function startNight(m: XmMatch): void {
  resetNight(m);
  /**
   * Night falls, and last night's converts learn what they are.
   *
   * The delay is the point. A player converted on night one spends the whole of
   * day one not knowing — they argue for the town in good faith, and the table
   * has nothing to read on their face. Only when the next night comes do they
   * open their eyes and find out whose side they are on.
   */
  for (const s of m.seats) {
    if (s.cult && !s.cultRevealed) s.cultRevealed = true;
  }
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
  /*
   * Sport opens on a night with no killing in it.
   *
   * The mafia meet, see each other, and agree the order they mean to shoot in.
   * That plan is the only coordination they get all game — from the next night
   * on they shoot blind — so the phase is a minute of planning rather than the
   * casual rules' acquaintance screen, and it is the reason the rest of the
   * mode works at all.
   */
  if (m.sport) {
    m.phase = 'plan_night';
    m.nightEndsAt = Date.now() + SPORT_TIMES.planNight * 1000;
    pushLog(m, 'night', 'დაგეგმვის ღამე — მაფია ერთმანეთს ცნობს და გეგმავს');
    return m;
  }
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
  startSpeechClock(m);
  return m;
}

/**
 * Sport: the planning night ends and the first day begins.
 *
 * Straight into real speeches — no acquaintance circle. The casual rules open
 * with a round where nobody may nominate, which is a gentle way to start;
 * sport's first day counts, and the very first speaker may put somebody up.
 */
export function endPlanNight(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'plan_night') return null;
  m.introRound = false;
  m.floorGrab = null;
  m.nightEndsAt = 0;
  m.nominations = []; m.nominatedBy = {};
  buildSpeechOrder(m);
  m.phase = 'speech';
  startSpeechClock(m);
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
/**
 * The mafia's kill vote.
 *
 * The don must check first.
 *
 * They used to be able to do it in either order, and choosing the kill last
 * meant the night resolved the instant the check landed — the answer they had
 * just paid a whole night for flashed past on its way to the morning. Checking
 * first puts the result on screen while the kill is still being decided, which
 * is also the order it is useful in.
 */
export function mafiaVote(matchId: string, byUserId: string, targetUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'night') return null;
  const actor = findByUser(m, byUserId);
  const target = findByUser(m, targetUserId);
  if (!actor || !actor.alive || !isMafiaRole(actor.role)) return null;
  if (!target || !target.alive || isMafiaRole(target.role)) return null; // mafia don't shoot their own
  if (actor.role === 'don' && m.night.donCheck === null) return null;     // check first — see above
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
  // Spelled out, not a tick: this is the one piece of information the don gets
  // all night and it should not need decoding.
  actor.lastCheck = m.night.donResult
    ? `🎩 ${seatLabel(target)} — შერიფია ✅`
    : `🎩 ${seatLabel(target)} — შერიფი არ არის ❌`;
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
  // In sport the don is the mafia's insurance: the sheriff's check on them
  // comes back clean. Everywhere else `isMafiaRole` answers, and the don is
  // caught like anyone else.
  m.night.sheriffResult = m.sport ? sheriffSees(target.role) : isMafiaRole(target.role);
  actor.lastCheck = m.night.sheriffResult
    ? `🔎 ${seatLabel(target)} — მაფიაა ❌`
    : `🔎 ${seatLabel(target)} — მშვიდობიანია ✅`;
  maybeAutoNight(m);
  return m;
}

function resolveKill(m: XmMatch): XmSeat | null {
  /*
   * Sport: everybody, or nobody.
   *
   * No plurality and no don tiebreak. Every living member of the team has to
   * have pressed, and all of them the same name — one absence or one
   * disagreement and the night is quiet. Blind coordination is the mechanic
   * the mode is built on; a tiebreak would hand it straight back.
   */
  if (m.sport) {
    const target = agreedTarget(aliveMafia(m), m.night.mafiaVotes);
    if (!target) return null;
    const victim = findByUser(m, target);
    return victim && victim.alive && !isMafiaRole(victim.role) ? victim : null;
  }

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

  /*
   * Order is the rule here, not an implementation detail.
   *
   *   1. the cult converts — a convert can still be shot the same night
   *   2. the mafia shoot
   *   3. the maniac shoots
   *   4. the doctor's patient survives whatever came for them
   *
   * The doctor is resolved last on purpose: one save covers every knife aimed
   * at that person, so the mafia and the maniac picking the same target waste
   * the night between them.
   */

  // 1. Conversion.
  const convertId = m.night.cultConvert;
  if (convertId) {
    const leader = m.seats.find(x => x.alive && x.role === 'cult');
    const target = findByUser(m, convertId);
    const immune = !target || !target.alive || isMafiaRole(target.role) || target.role === 'maniac' || target.cult;
    if (leader && target && !immune) {
      target.cult = true;
      m.night.cultResult = 'converted';
      pushLog(m, 'night', `ღამე ${m.round}: კულტმა მოიმხრო ${seatLabel(target)}`);
    } else {
      m.night.cultResult = 'immune';
    }
  }

  // 2 & 3. The knives.
  const saved = m.night.doctorHeal;
  const doomed = new Map<string, XmSeat['eliminatedBy']>();

  const mafiaVictim = resolveKill(m);
  if (mafiaVictim && mafiaVictim.userId !== saved) doomed.set(mafiaVictim.userId, 'mafia');

  const maniacTargetId = m.night.maniacKill;
  if (maniacTargetId && maniacTargetId !== saved) {
    const maniac = m.seats.find(x => x.alive && x.role === 'maniac');
    const target = findByUser(m, maniacTargetId);
    if (maniac && target && target.alive) doomed.set(target.userId, 'mafia');
  }

  // 4. Apply.
  const killed: { userId: string; nickname: string; seat: number }[] = [];
  for (const [userId, by] of doomed) {
    const seat = findByUser(m, userId);
    if (!seat || !seat.alive) continue;
    seat.alive = false;
    seat.eliminatedRound = m.round;
    seat.eliminatedBy = by;
    killed.push({ userId: seat.userId, nickname: seat.nickname, seat: seat.seat });
  }
  killed.sort((a, b) => a.seat - b.seat);

  m.night.doctorHeal = saved;
  m.lastHeal = saved;

  m.announce = { round: m.round, killed };
  pushLog(m, 'night', killed.length
    ? `ღამე ${m.round}: მოკლეს ${killed.map(k => `#${k.seat} ${k.nickname}`).join(', ')}`
    : `ღამე ${m.round}: მშვიდი ღამე — მსხვერპლი არ არის`);

  m.phase = 'day_announce';
  if (checkWin(m)) return;

  // Farewells, in seat order. Two can die in one night, and both get to speak.
  m.lastWordsQueue = killed.map(k => k.userId);
  const first = m.lastWordsQueue.shift();
  if (first) startLastWords(m, first);
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
/**
 * Start the current speaker's clock.
 *
 * A verified player gets `speechBonusSeconds` more than the table's setting —
 * the one perk that touches play rather than presentation, added deliberately
 * and kept small. The lookup is the synchronous snapshot because this runs from
 * timer callbacks where there is nothing to await; see vipService.
 */
function startSpeechClock(m: XmMatch): void {
  const speaker = m.speechOrder[m.speechIdx] ?? null;
  const bonus = limitsForSync(speaker).speechBonusSeconds;
  m.speechEndsAt = Date.now() + (m.settings.speechSeconds + bonus) * 1000;
}

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
  startSpeechClock(m);
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
  startSpeechClock(m);
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
  m.voteIdx = 0;
  m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
}

/**
 * Vote for whoever is currently on the floor.
 *
 * One vote each, and it cannot be moved: a hand raised in a real game cannot be
 * un-raised once the moderator has counted it. `nomineeUserId` is still checked
 * against the candidate actually up, so a client cannot vote ahead for someone
 * whose turn has not come.
 */
export function castVote(matchId: string, byUserId: string, nomineeUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'vote') return null;
  const voter = findByUser(m, byUserId);
  if (!voter || !voter.alive) return null;
  if (m.votes[byUserId]) return null;                       // already voted
  const current = m.nominations[m.voteIdx];
  if (!current || current !== nomineeUserId) return null;    // not the candidate on the floor
  m.votes[byUserId] = current;

  // Everyone has now voted — there is nothing left to ask.
  if (aliveSeats(m).every(s => m.votes[s.userId])) resolveVote(m);
  return m;
}

/** The candidate on the floor right now, if the vote is running. */
export function currentCandidate(m: XmMatch): string | null {
  return m.phase === 'vote' ? (m.nominations[m.voteIdx] ?? null) : null;
}

/**
 * Move to the next candidate — or close the vote.
 *
 * Past the last candidate, everyone who has not voted is counted for that last
 * one. That is the standing rule in table mafia: if you sat on your hands all
 * the way down the list, your vote goes to the last name on it. Without it, a
 * player can abstain their way out of every elimination.
 */
export function nextCandidate(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'vote' || m.hostId !== byUserId) return null;

  if (m.voteIdx < m.nominations.length - 1) {
    m.voteIdx += 1;
    return m;
  }

  const last = m.nominations[m.nominations.length - 1];
  if (last) {
    for (const seat of aliveSeats(m)) {
      if (!m.votes[seat.userId]) m.votes[seat.userId] = last;
    }
  }
  resolveVote(m);
  return m;
}

// ── Tribunal (sport only) ─────────────────────────────────────────────────────

/**
 * The vote could not separate them, so they answer for themselves.
 *
 * Each tied player gets half a minute, in seat order so nobody can argue about
 * who spoke when. Only after all of them have spoken does the town vote, and
 * the question it is asked is not "which one" — that has already failed — but
 * whether to lose both or neither.
 */
function startTribunal(m: XmMatch, tied: string[]): void {
  // Seat order, so the running order is a fact about the table rather than a
  // by-product of how the tally happened to iterate.
  const onTrial = m.seats
    .filter(s => tied.includes(s.userId) && s.alive)
    .sort((a, b) => a.seat - b.seat)
    .map(s => s.userId);

  if (onTrial.length < 2) {
    // Everyone tied but one is already gone. Nothing to try.
    m.tribunal = null;
    m.phase = 'day_announce';
    m.announce = null;
    return;
  }

  m.tribunal = {
    onTrial,
    defenseIdx: 0,
    defenseEndsAt: Date.now() + SPORT_TIMES.tribunalDefense * 1000,
    votes: {},
    endsAt: 0,
    verdict: null,
  };
  m.phase = 'tribunal_defense';
  pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალი — ${onTrial.length} მოთამაშე`);
}

/**
 * Next defence, or open the vote once they have all spoken.
 *
 * Host-driven like every other clock in hosted mafia: the timer is a guide for
 * the room, and the moderator decides when somebody has finished.
 */
export function nextTribunalDefense(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'tribunal_defense' || m.hostId !== byUserId || !m.tribunal) return null;

  if (m.tribunal.defenseIdx < m.tribunal.onTrial.length - 1) {
    m.tribunal.defenseIdx += 1;
    m.tribunal.defenseEndsAt = Date.now() + SPORT_TIMES.tribunalDefense * 1000;
    return m;
  }

  m.phase = 'tribunal_vote';
  m.tribunal.endsAt = Date.now() + SPORT_TIMES.tribunalVote * 1000;
  return m;
}

/**
 * One town member's verdict.
 *
 * Not the players on trial: their fate is the question. Letting them answer it
 * turns "should we lose both?" into arithmetic about how many of the rest are
 * needed, which is not what a tribunal is for.
 */
export function tribunalVote(matchId: string, byUserId: string, verdict: 'punish' | 'free'): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'tribunal_vote' || !m.tribunal) return null;
  if (verdict !== 'punish' && verdict !== 'free') return null;
  const voter = findByUser(m, byUserId);
  if (!voter || !voter.alive) return null;
  if (m.tribunal.onTrial.includes(byUserId)) return null;
  if (m.tribunal.votes[byUserId]) return null;          // one verdict each, no changing it

  m.tribunal.votes[byUserId] = verdict;

  // Everyone entitled to a say has had one; there is nothing left to wait for.
  const electorate = tribunalElectorate(m.seats, m.tribunal.onTrial);
  if (electorate.every(s => m.tribunal!.votes[s.userId])) resolveTribunal(m);
  return m;
}

/** Host closes the tribunal early, or its clock runs out. */
export function endTribunalVote(matchId: string, byUserId: string | null): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.phase !== 'tribunal_vote' || !m.tribunal) return null;
  if (byUserId !== null && m.hostId !== byUserId) return null;
  resolveTribunal(m);
  return m;
}

/**
 * Both, or neither.
 *
 * A strict majority of those who actually voted is needed to punish; a tie, an
 * empty room and a silent one all free them. Taking two players out of a
 * ten-hand game is the heavier outcome and the burden belongs on the side
 * asking for it.
 *
 * The order at the end matters: the win check runs before the farewells, so a
 * tribunal that ends the game does not queue up last words for a match that is
 * already over.
 */
function resolveTribunal(m: XmMatch): void {
  const t = m.tribunal;
  if (!t) return;

  let punish = 0, free = 0;
  for (const v of Object.values(t.votes)) (v === 'punish' ? punish++ : free++);
  const verdict = tribunalVerdict(punish, free);
  t.verdict = verdict;

  if (verdict === 'free') {
    pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალმა გაათავისუფლა (${punish}/${free})`);
    m.tribunal = null;
    m.phase = 'day_announce';
    m.announce = null;
    return;
  }

  const doomed: string[] = [];
  for (const id of t.onTrial) {
    const s = findByUser(m, id);
    if (!s || !s.alive) continue;
    s.alive = false;
    s.eliminatedRound = m.round;
    s.eliminatedBy = 'vote';
    doomed.push(id);
    pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალით გაირიცხა ${seatLabel(s)}`);
  }
  m.tribunal = null;

  if (checkWin(m)) return;

  // Each of them gets their minute, in the order they stood trial.
  if (doomed.length > 0) {
    startLastWords(m, doomed[0]!);
    m.lastWordsQueue.push(...doomed.slice(1));
    return;
  }
  m.phase = 'day_announce';
  m.announce = null;
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

  /*
   * Sport: a tie goes to tribunal, not to a re-vote.
   *
   * The tied players defend themselves, and if the town still cannot separate
   * them it answers a different question — lose both, or neither. Re-running
   * the same vote asks the room to change its mind with no new information;
   * the defence is the new information.
   */
  if (m.sport) {
    m.voteResult = { eliminatedUserId: null, tally };
    startTribunal(m, tied);
    return;
  }

  // Tie → one re-vote ("lift") between the tied candidates; a second tie spares everyone.
  if (!m.voteRevote) {
    m.nominations = [...tied];
    m.votes = {};
    m.voteResult = null;
    m.voteRevote = true;
    m.phase = 'vote';
    m.voteIdx = 0;
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

  // Somebody else died in the same night and is still owed a farewell.
  const next = m.lastWordsQueue.shift();
  if (next) { startLastWords(m, next); return m; }
  // A night victim's farewell → it's the morning, the host runs the day (announce
  // stands). A day elimination (vote/foul) → the day is over, so clear the announce;
  // day_announce with a null announce is the "night falls next" state.
  if (seat && seat.eliminatedBy === 'mafia') { m.phase = 'day_announce'; }
  else { m.phase = 'day_announce'; m.announce = null; }
  return m;
}

// ── The cult outlives nobody ──────────────────────────────────────────────────
/**
 * The leader is gone, so the cult is gone with them.
 *
 * A cult is one person's hold over other people, not a faction that recruits a
 * successor. When the leader is shot, voted out, fouled out or simply walks out
 * of the room, everyone they turned comes back to the side they were dealt —
 * the doctor is the town's doctor again, the citizen is a citizen again, and
 * they win or lose with their own colour.
 *
 * Two reasons it has to work this way rather than leaving the converts behind
 * as a leaderless cult. Such a cult can never convert again, so it can only
 * win by outliving everyone else — a faction with no play left, dragging the
 * game out. And a convert who was never told (the leader died before the next
 * night fell) would be quietly locked out of every win in the game without ever
 * learning why.
 *
 * Called from `checkWin`, which every death already funnels through, and from
 * `leaveMatch`, which is the one way out that is not a death.
 */
function dissolveCultIfLeaderGone(m: XmMatch): void {
  const converts = m.seats.filter(s => s.cult && s.role !== 'cult');
  if (converts.length === 0) return;
  const leader = m.seats.find(s => s.role === 'cult' && s.alive && !s.left);
  if (leader) return;
  for (const s of converts) { s.cult = false; s.cultRevealed = false; }
  pushLog(m, 'game', '🕯 კულტის ლიდერი აღარაა — მისი მიმდევრები დაუბრუნდნენ თავიანთ როლს');
}

// ── Win detection ─────────────────────────────────────────────────────────────
/**
 * Who, if anybody, has won.
 *
 * The order of these checks is the ruleset. With four possible factions the
 * same board can satisfy two of them, and which one is asked first decides the
 * game — so they are asked in the order a table would settle them.
 */
function checkWin(m: XmMatch): boolean {
  // Before anyone is counted: if the leader has fallen, the cult is not a side
  // any more, and its former members count for the colour they were dealt.
  dissolveCultIfLeaderGone(m);
  const alive = aliveSeats(m);
  const mafia = alive.filter(s => isMafiaRole(s.role) && !s.cult);
  const maniac = alive.filter(s => s.role === 'maniac');
  const cult = alive.filter(s => s.cult);

  let winner: XmWinner = null;

  // 1. Nobody hostile left.
  if (mafia.length === 0 && maniac.length === 0 && cult.length === 0) winner = 'town';

  // 2. The maniac finishes the last one standing in the night, so two is over.
  else if (maniac.length > 0 && alive.length <= 2) winner = 'maniac';

  // 3. The whole table is cult.
  else if (cult.length > 0 && cult.length === alive.length) winner = 'cult';

  // 4. Mafia parity — but not while a maniac is still shooting at them too.
  else if (mafia.length > 0 && maniac.length === 0 && mafia.length >= alive.length - mafia.length) winner = 'mafia';

  if (winner) {
    m.winner = winner;
    m.phase = 'finished';
    m.reveal = m.seats.map(s => ({ userId: s.userId, nickname: s.nickname, seat: s.seat, role: s.role! }));
    pushLog(m, 'game',
      winner === 'mafia' ? '🔫 მაფიამ გაიმარჯვა'
      : winner === 'maniac' ? '🔪 მანიაკმა გაიმარჯვა'
      : winner === 'cult' ? '🕯 კულტმა გაიმარჯვა'
      : '🏙 ქალაქმა გაიმარჯვა');
    return true;
  }
  return false;
}

/**
 * Take the room back to the lobby.
 *
 * `rematch` is this after a finished game; `endGame` is this from the middle of
 * one. They are the same reset, and they were worth separating from
 * `dissolveMatch` — until now the only way out of a running game was to close
 * the room entirely, which throws everybody out to start again from a new code.
 */
function resetToLobby(m: XmMatch): void {
  // Keep the host and connected seats; fold spectators into open seats.
  const keep = m.seats.filter(s => s.connected);
  for (const sp of m.spectators.filter(s => s.connected)) {
    if (keep.length >= m.maxSeats) break;
    keep.push({ userId: sp.userId, socketId: sp.socketId, nickname: sp.nickname, seat: 0, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false });
  }
  m.seats = keep;
  m.seats.forEach((s, i) => { s.seat = i + 1; s.role = null; s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null; s.cardIndex = null; s.cult = false; s.cultRevealed = false; });
  m.lastHeal = null;
  m.lastWordsQueue = [];
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
  m.hostLeft = false;
}

export function endGame(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId) return null;
  if (m.phase === 'lobby' || m.dissolved) return null;
  pushLog(m, 'game', '⏹ ჰოსტმა თამაში დაასრულა — ლობი');
  resetToLobby(m);
  return m;
}

export function rematch(matchId: string, byUserId: string): XmMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.phase !== 'finished') return null;
  resetToLobby(m);
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

  /**
   * Do I know I am in the cult?
   *
   * Belonging and knowing are two different things. A convert belongs from the
   * moment the leader picks them — it is already what decides who wins — but
   * they are told only when the next night falls. Every window into the cult
   * (my own badge, who my brethren are, the mark on their tile) opens on this
   * one flag, so there is no seam where a convert learns early through a side
   * door. The leader is revealed to themselves the instant they take the card.
   */
  const iKnowCult = Boolean(meSeat?.cult && meSeat.cultRevealed);

  const seats: XmSafeSeat[] = m.seats.map(s => ({
    userId: s.userId, socketId: s.socketId, nickname: s.nickname, seat: s.seat, connected: s.connected,
    alive: s.alive, fouls: s.fouls, eliminatedBy: s.eliminatedBy,
    role: canSeeRole(s) ? s.role : null,
    isSpeaking: s.userId === speakingUserId,
    isNominated: m.nominations.includes(s.userId),
    hasVoted: m.phase === 'vote' ? Boolean(m.votes[s.userId]) : false,
    // Only the cult sees the cult. Everyone sees it once the game is over.
    cult: (gameOver || iKnowCult) ? s.cult : false,
  }));

  /*
   * Who you know.
   *
   * The mafia know each other. The cult knows itself — a convert is told they
   * are in it and who else is, which is the whole point of a cult. Everybody
   * else knows nobody.
   */
  const mateIds = gameOver ? []
    : iAmMafia ? m.seats.filter(s => isMafiaRole(s.role) && s.userId !== viewerUserId).map(s => s.userId)
    : iKnowCult ? m.seats.filter(s => s.cult && s.userId !== viewerUserId).map(s => s.userId)
    : [];

  // Night private info + whether I already acted. The check result persists past
  // the night (via seat.lastCheck) so the investigator keeps their information
  // even when the night auto-resolves the instant they act.
  let iActedTonight = false;
  let nightPrivate: string | null = null;
  if (meSeat && meSeat.alive && (meSeat.role === 'don' || meSeat.role === 'sheriff')) {
    nightPrivate = meSeat.lastCheck;
  }
  // The cult leader learns whether last night's attempt took — and only they do.
  if (meSeat && meSeat.alive && meSeat.role === 'cult' && m.night.cultResult) {
    const t = m.night.cultConvert ? findByUser(m, m.night.cultConvert) : null;
    nightPrivate = m.night.cultResult === 'converted'
      ? `✅ ${t ? seatLabel(t) : 'ის'} შენს მხარესაა`
      : `❌ ${t ? seatLabel(t) : 'ის'} ვერ მოიმხრე`;
  }
  if (m.phase === 'night' && meSeat && meSeat.alive) {
    if (meSeat.role === 'don') iActedTonight = m.night.donCheck !== null && !!m.night.mafiaVotes[viewerUserId];
    else if (isMafiaRole(meSeat.role)) iActedTonight = !!m.night.mafiaVotes[viewerUserId];
    else if (meSeat.role === 'sheriff') iActedTonight = m.night.sheriffCheck !== null;
    else if (meSeat.role === 'doctor') iActedTonight = m.night.doctorHeal !== null;
    else if (meSeat.role === 'maniac') iActedTonight = m.night.maniacKill !== null;
    else if (meSeat.role === 'cult') iActedTonight = m.night.cultConvert !== null;
  }

  const lastWordsSeat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;

  /*
   * Mafia see each other's kill picks live (consensus building) — except in
   * sport, where they shoot blind.
   *
   * This projection IS the rule, not a display of it. Sending the picks and
   * hiding them in the UI would leave them one devtools panel away, and the
   * whole mode rests on nobody being able to see them.
   */
  const mafiaPicks = (iAmMafia && !m.sport && m.phase === 'night')
    ? aliveMafia(m).filter(s => m.night.mafiaVotes[s.userId]).map(s => {
        const t = findByUser(m, m.night.mafiaVotes[s.userId]!);
        return { userId: s.userId, nickname: s.nickname, targetId: m.night.mafiaVotes[s.userId]!, targetName: t?.nickname ?? '?' };
      })
    : [];

  /*
   * The tribunal, projected.
   *
   * The running tally is withheld until it is over. Sending it live would let
   * the last voters count exactly how many more are needed, and the point of
   * asking the town at all is that each of them answers for themselves.
   */
  const t = m.tribunal;
  const tribunal = t ? {
    onTrial: t.onTrial.map(id => {
      const s = findByUser(m, id);
      return { userId: id, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 };
    }),
    defenseIdx: t.defenseIdx,
    defenseEndsAt: t.defenseEndsAt,
    speakingUserId: m.phase === 'tribunal_defense' ? (t.onTrial[t.defenseIdx] ?? null) : null,
    endsAt: t.endsAt,
    iAmOnTrial: t.onTrial.includes(viewerUserId),
    canVote: Boolean(meSeat?.alive) && !t.onTrial.includes(viewerUserId),
    myVerdict: t.votes[viewerUserId] ?? null,
    votesCast: Object.keys(t.votes).length,
    votesTotal: tribunalElectorate(m.seats, t.onTrial).length,
    verdict: t.verdict,
    tally: t.verdict
      ? Object.values(t.votes).reduce(
          (acc, v) => (v === 'punish' ? { ...acc, punish: acc.punish + 1 } : { ...acc, free: acc.free + 1 }),
          { punish: 0, free: 0 },
        )
      : null,
  } : null;

  return {
    id: m.id, code: m.code, phase: m.phase,
    sport: m.sport,
    sportRequested: m.sportRequested,
    sportBlockedReason: m.sportRequested && m.phase === 'lobby'
      ? canStartSport(m.seats.length, true).reason
      : null,
    tribunal,
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
    myCult: iKnowCult,
    healBlockedId: meSeat?.role === 'doctor' ? m.lastHeal : null,
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
    // Who is up after this one. The table wants to know whose turn is coming,
    // and working it out on the client would mean shipping the whole speech
    // order — which is a list of who is still alive, in order, to everybody.
    nextSpeaker: (() => {
      if (m.phase !== 'speech') return null;
      const nextId = m.speechOrder[m.speechIdx + 1];
      const seat = nextId ? findByUser(m, nextId) : null;
      return seat ? { nickname: seat.nickname, seat: seat.seat } : null;
    })(),
    nominations: m.nominations.map(uid => { const s = findByUser(m, uid); return { userId: uid, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 }; }),
    iNominated: !!(meSeat && m.nominatedBy[viewerUserId]),
    nightEndsAt: m.phase === 'night' ? m.nightEndsAt : 0,
    iActedTonight,
    nightPrivate,
    iCheckedTonight: m.phase === 'night' && meSeat?.alive
      ? (meSeat.role === 'don' ? m.night.donCheck !== null
        : meSeat.role === 'sheriff' ? m.night.sheriffCheck !== null
        : false)
      : false,
    nightAllActed: m.phase === 'night' ? nightAllActed(m) : false,
    mafiaPicks,
    announce: (m.phase === 'day_announce' || m.phase === 'last_words') ? m.announce : null,
    voteEndsAt: m.phase === 'vote' ? m.voteEndsAt : 0,
    voteRevote: m.phase === 'vote' ? m.voteRevote : false,
    voteCandidate: (() => {
      const id = currentCandidate(m);
      if (!id) return null;
      const seat = findByUser(m, id);
      return seat ? { userId: id, nickname: seat.nickname, seat: seat.seat } : null;
    })(),
    voteIdx: m.phase === 'vote' ? m.voteIdx : 0,
    voteTotal: m.phase === 'vote' ? m.nominations.length : 0,
    voteIsLast: m.phase === 'vote' && m.voteIdx >= m.nominations.length - 1,
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
