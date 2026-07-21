/**
 * ტყუილების ოსტატი (Master of Lies / Fibbage) — social bluffing.
 *
 * Each round the game shows a trivia prompt with a blank. Every player secretly
 * writes a fake answer (a "bluff"). The bluffs plus the one real answer are
 * shuffled; everyone then picks which option they believe is the truth.
 *
 * Scoring per round:
 *   guess the truth            → +1000
 *   someone picks YOUR bluff   → +500 per player fooled (shared if the bluff was
 *                                written by more than one player)
 *
 * A bluff that matches the real answer is rejected — the writer is told and must
 * try again. Identical bluffs are merged into one option; all of its authors
 * share the "fooled" credit.
 *
 * Pure logic — no socket.io. Follows the Spyfall/Alias service conventions:
 * in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC. Phase
 * timing lives in the socket layer.
 */
import { randomBytes } from 'crypto';
import { LIES_QUESTIONS, normalizeAnswer, type LiesQuestion } from '../liesQuestions.js';

export type LiesStatus = 'waiting' | 'writing' | 'guessing' | 'reveal' | 'finished';

export const TRUTH_POINTS = 1000;
export const FOOL_POINTS = 500;

export interface LiesPlayer {
  userId: string;
  socketId: string;
  nickname: string;
  seat: number;
  connected: boolean;
  score: number;
  bluff: string | null;   // this round's submitted bluff (null until submitted)
  guessId: string | null; // option id this player picked this round
}

/** A shuffled option shown in the guessing phase. */
interface LiesOption {
  id: string;
  text: string;
  isTruth: boolean;
  authorIds: string[]; // empty for the truth; 1+ for a (possibly merged) bluff
}

export interface LiesRevealEntry {
  optionId: string;
  text: string;
  isTruth: boolean;
  authorNames: string[];
  pickedBy: { userId: string; nickname: string }[];
}

export interface LiesReveal {
  prompt: string;
  truth: string;
  category: string;
  entries: LiesRevealEntry[];
  deltas: { userId: string; nickname: string; delta: number }[];
}

export interface LiesMatch {
  id: string;
  code: string;
  status: LiesStatus;
  hostId: string;
  maxPlayers: number;
  players: LiesPlayer[];
  settings: { rounds: number; writeSeconds: number; guessSeconds: number };
  round: number;
  question: LiesQuestion | null;
  usedQuestionIds: string[];
  options: LiesOption[] | null; // built when guessing starts
  endsAt: number;               // phase deadline (writing/guessing)
  reveal: LiesReveal | null;
  winnerIds: string[];
  dissolved: boolean;
  createdAt: number;
}

export interface LiesPublicState {
  id: string;
  code: string;
  status: LiesStatus;
  hostId: string;
  maxPlayers: number;
  players: { userId: string; socketId: string; nickname: string; seat: number; connected: boolean; score: number; done: boolean }[];
  settings: { rounds: number; writeSeconds: number; guessSeconds: number };
  round: number;
  prompt: string | null;
  category: string | null;
  endsAt: number;
  myBluff: string | null;
  bluffRejected: boolean; // set transiently when the last bluff matched the truth
  options: { id: string; text: string; mine: boolean }[] | null;
  myGuess: string | null;
  reveal: LiesReveal | null;
  winnerIds: string[];
  dissolved: boolean;
  myUserId: string;
}

export interface LiesListItem {
  id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: LiesStatus;
}

const matches = new Map<string, LiesMatch>();
const playerMatch = new Map<string, string>();
// Transient "your bluff was the truth, try again" flag, keyed by userId.
const rejectedBluff = new Set<string>();

function code6(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; }

export function createMatch(hostId: string, socketId: string, nickname: string, opts: { maxPlayers?: number; rounds?: number }): LiesMatch {
  const id = randomBytes(8).toString('hex');
  const m: LiesMatch = {
    id, code: code6(), status: 'waiting', hostId,
    maxPlayers: Math.min(12, Math.max(3, Number(opts.maxPlayers ?? 8))),
    players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, score: 0, bluff: null, guessId: null }],
    settings: {
      rounds: Math.min(12, Math.max(1, Number(opts.rounds ?? 5))),
      writeSeconds: 75,
      guessSeconds: 45,
    },
    round: 0, question: null, usedQuestionIds: [], options: null, endsAt: 0,
    reveal: null, winnerIds: [], dissolved: false, createdAt: Date.now(),
  };
  matches.set(id, m);
  playerMatch.set(hostId, id);
  setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
  return m;
}

export function getMatch(id: string): LiesMatch | null { return matches.get(id) ?? null; }
export function getMatchByCode(code: string): LiesMatch | null { for (const m of matches.values()) if (m.code === code && m.status !== 'finished') return m; return null; }
export function getMatchForSocket(socketId: string): LiesMatch | null { for (const m of matches.values()) if (m.players.some(p => p.socketId === socketId)) return m; return null; }
export function listMatches(): LiesListItem[] {
  return [...matches.values()].filter(m => m.status === 'waiting').map(m => ({
    id: m.id, code: m.code, hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '?',
    playerCount: m.players.length, maxPlayers: m.maxPlayers, status: m.status,
  }));
}

export function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): { match: LiesMatch; isNew: boolean } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  const ex = m.players.find(p => p.userId === userId);
  if (ex) { ex.socketId = socketId; ex.connected = true; playerMatch.set(userId, matchId); return { match: m, isNew: false }; }
  if (m.status !== 'waiting' || m.players.length >= m.maxPlayers) return null;
  m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, score: 0, bluff: null, guessId: null });
  playerMatch.set(userId, matchId);
  return { match: m, isNew: true };
}

export function leaveMatch(matchId: string, userId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  playerMatch.delete(userId);
  if (m.status === 'waiting' || m.status === 'finished') {
    m.players = m.players.filter(p => p.userId !== userId);
    m.players.forEach((p, i) => { p.seat = i; });
    if (m.players.length === 0) { matches.delete(matchId); return null; }
    if (m.hostId === userId) m.hostId = m.players[0]!.userId;
    return m;
  }
  const p = m.players.find(pl => pl.userId === userId);
  if (p) p.connected = false;
  return m;
}

export function disconnectSocket(socketId: string): string | null {
  const m = getMatchForSocket(socketId);
  if (!m) return null;
  const p = m.players.find(pl => pl.socketId === socketId)!;
  if (m.status === 'waiting' || m.status === 'finished') { leaveMatch(m.id, p.userId); return m.id; }
  p.connected = false;
  // A drop may complete the current phase (everyone else already acted).
  if (m.status === 'writing') maybeCloseWriting(m);
  else if (m.status === 'guessing') maybeCloseGuessing(m);
  return m.id;
}

/** Explicit leave during active play — end the match for everyone. */
export function dissolveMatch(matchId: string, leaverId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  playerMatch.delete(leaverId);
  m.players = m.players.filter(p => p.userId !== leaverId);
  if (m.players.length === 0) { matches.delete(matchId); return null; }
  if (m.hostId === leaverId) m.hostId = m.players[0]!.userId;
  m.status = 'finished';
  m.dissolved = true;
  m.reveal = null;
  return m;
}

function setupRound(m: LiesMatch): void {
  let pool = LIES_QUESTIONS.filter(q => !m.usedQuestionIds.includes(q.id));
  if (pool.length === 0) { m.usedQuestionIds = []; pool = LIES_QUESTIONS; }
  const q = pool[Math.floor(Math.random() * pool.length)]!;
  m.question = q;
  m.usedQuestionIds.push(q.id);
  m.options = null;
  m.reveal = null;
  for (const p of m.players) { p.bluff = null; p.guessId = null; }
  m.status = 'writing';
  m.endsAt = Date.now() + m.settings.writeSeconds * 1000;
}

export function startMatch(matchId: string, byUserId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== byUserId || m.status !== 'waiting') return null;
  if (m.players.length < 3) return null;
  m.round = 1;
  for (const p of m.players) p.score = 0;
  m.winnerIds = [];
  m.usedQuestionIds = [];
  setupRound(m);
  return m;
}

/** Truth spellings for the current question (normalized). */
function truthForms(m: LiesMatch): Set<string> {
  const q = m.question!;
  const forms = new Set<string>([normalizeAnswer(q.answer)]);
  for (const a of q.alt ?? []) forms.add(normalizeAnswer(a));
  return forms;
}

export type BluffResult = 'ok' | 'rejected_truth' | 'invalid';

/** Submit a bluff during the writing phase. Rejects an empty bluff or the truth. */
export function submitBluff(matchId: string, byUserId: string, text: string): { match: LiesMatch; result: BluffResult } | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'writing') return null;
  const p = m.players.find(pl => pl.userId === byUserId);
  if (!p) return null;
  const clean = String(text ?? '').trim().slice(0, 60);
  if (!clean) return { match: m, result: 'invalid' };
  rejectedBluff.delete(byUserId);
  if (truthForms(m).has(normalizeAnswer(clean))) {
    rejectedBluff.add(byUserId);
    return { match: m, result: 'rejected_truth' };
  }
  p.bluff = clean;
  maybeCloseWriting(m);
  return { match: m, result: 'ok' };
}

export function clearRejected(userId: string): void { rejectedBluff.delete(userId); }

function activePlayers(m: LiesMatch): LiesPlayer[] { return m.players.filter(p => p.connected); }

function maybeCloseWriting(m: LiesMatch): void {
  if (m.status !== 'writing') return;
  const act = activePlayers(m);
  if (act.length === 0) return;
  if (act.some(p => p.bluff === null)) return; // still writing
  beginGuessing(m);
}

/** Build shuffled options (merged bluffs + truth) and move to guessing. */
export function beginGuessing(m: LiesMatch): void {
  if (m.status !== 'writing') return;
  const q = m.question!;
  const truthNorm = normalizeAnswer(q.answer);

  // Merge identical bluffs; a bluff that equals the truth is dropped (its author
  // simply contributed nothing — they were caught at submit time in normal play,
  // but guard here too).
  const byNorm = new Map<string, { text: string; authorIds: string[] }>();
  for (const p of m.players) {
    if (!p.bluff) continue;
    const n = normalizeAnswer(p.bluff);
    if (n === truthNorm || truthForms(m).has(n)) continue;
    const entry = byNorm.get(n);
    if (entry) entry.authorIds.push(p.userId);
    else byNorm.set(n, { text: p.bluff, authorIds: [p.userId] });
  }

  const opts: LiesOption[] = [];
  for (const { text, authorIds } of byNorm.values()) {
    opts.push({ id: 'o_' + randomBytes(5).toString('hex'), text, isTruth: false, authorIds });
  }
  opts.push({ id: 'o_' + randomBytes(5).toString('hex'), text: q.answer, isTruth: true, authorIds: [] });

  m.options = shuffle(opts);
  for (const p of m.players) p.guessId = null;
  m.status = 'guessing';
  m.endsAt = Date.now() + m.settings.guessSeconds * 1000;
}

/** Pick which option is the truth. A player may not pick their own bluff. */
export function submitGuess(matchId: string, byUserId: string, optionId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'guessing' || !m.options) return null;
  const p = m.players.find(pl => pl.userId === byUserId);
  const opt = m.options.find(o => o.id === optionId);
  if (!p || !opt) return null;
  if (opt.authorIds.includes(byUserId)) return null; // can't pick your own lie
  p.guessId = optionId;
  maybeCloseGuessing(m);
  return m;
}

function maybeCloseGuessing(m: LiesMatch): void {
  if (m.status !== 'guessing' || !m.options) return;
  const act = activePlayers(m);
  if (act.length === 0) return;
  // A player whose only remaining choice is impossible still needs no guess to
  // finish the phase — but normally everyone can pick. Wait until all acted.
  if (act.some(p => p.guessId === null)) return;
  scoreRound(m);
}

/** Force the current phase to end (timer fired). */
export function forcePhaseEnd(matchId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.status === 'writing') beginGuessing(m);
  else if (m.status === 'guessing') scoreRound(m);
  return m;
}

function scoreRound(m: LiesMatch): void {
  if (!m.options || !m.question) return;
  const q = m.question;
  const deltas = new Map<string, number>();
  const add = (uid: string, n: number) => deltas.set(uid, (deltas.get(uid) ?? 0) + n);

  // Who picked what.
  const picksByOption = new Map<string, LiesPlayer[]>();
  for (const p of m.players) {
    if (!p.guessId) continue;
    const arr = picksByOption.get(p.guessId) ?? [];
    arr.push(p);
    picksByOption.set(p.guessId, arr);
  }

  for (const opt of m.options) {
    const pickers = picksByOption.get(opt.id) ?? [];
    if (opt.isTruth) {
      for (const pk of pickers) { pk.score += TRUTH_POINTS; add(pk.userId, TRUTH_POINTS); }
    } else if (opt.authorIds.length > 0) {
      // Each fooled player earns the authors FOOL_POINTS (split among co-authors).
      const per = Math.round((FOOL_POINTS * pickers.length) / opt.authorIds.length);
      for (const aid of opt.authorIds) {
        const author = m.players.find(p => p.userId === aid);
        if (author) { author.score += per; add(aid, per); }
      }
    }
  }

  const entries: LiesRevealEntry[] = m.options.map(opt => ({
    optionId: opt.id,
    text: opt.text,
    isTruth: opt.isTruth,
    authorNames: opt.authorIds.map(id => m.players.find(p => p.userId === id)?.nickname ?? '?'),
    pickedBy: (picksByOption.get(opt.id) ?? []).map(p => ({ userId: p.userId, nickname: p.nickname })),
  }));

  m.reveal = {
    prompt: q.prompt,
    truth: q.answer,
    category: q.category,
    entries,
    deltas: [...deltas.entries()].map(([userId, delta]) => ({
      userId, nickname: m.players.find(p => p.userId === userId)?.nickname ?? '?', delta,
    })).sort((a, b) => b.delta - a.delta),
  };
  m.status = 'reveal';
}

/** Host advances from reveal: next round, or final results after the last one. */
export function nextRound(matchId: string, byUserId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'reveal' || m.hostId !== byUserId) return null;
  if (m.round >= m.settings.rounds || activePlayers(m).length < 3) {
    const top = Math.max(...m.players.map(p => p.score));
    m.winnerIds = m.players.filter(p => p.score === top).map(p => p.userId);
    m.status = 'finished';
    return m;
  }
  m.round++;
  setupRound(m);
  return m;
}

export function rematch(matchId: string, byUserId: string): LiesMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'finished' || m.hostId !== byUserId) return null;
  m.players = m.players.filter(p => p.connected);
  m.players.forEach((p, i) => { p.seat = i; p.score = 0; p.bluff = null; p.guessId = null; });
  if (m.players.length === 0) { matches.delete(matchId); return null; }
  if (!m.players.some(p => p.userId === m.hostId)) m.hostId = m.players[0]!.userId;
  m.status = 'waiting';
  m.round = 0; m.question = null; m.usedQuestionIds = []; m.options = null;
  m.endsAt = 0; m.reveal = null; m.winnerIds = []; m.dissolved = false;
  return m;
}

export function getSafeState(m: LiesMatch, viewerUserId: string): LiesPublicState {
  const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
  const options = m.status === 'guessing' && m.options
    ? m.options.map(o => ({ id: o.id, text: o.text, mine: o.authorIds.includes(viewerUserId) }))
    : null;
  const rejected = rejectedBluff.has(viewerUserId);
  return {
    id: m.id, code: m.code, status: m.status, hostId: m.hostId, maxPlayers: m.maxPlayers,
    players: m.players.map(p => ({
      userId: p.userId, socketId: p.socketId, nickname: p.nickname, seat: p.seat,
      connected: p.connected, score: p.score,
      done: m.status === 'writing' ? p.bluff !== null : m.status === 'guessing' ? p.guessId !== null : false,
    })),
    settings: m.settings,
    round: m.round,
    prompt: (m.status === 'writing' || m.status === 'guessing') ? (m.question?.prompt ?? null) : null,
    category: (m.status === 'writing' || m.status === 'guessing') ? (m.question?.category ?? null) : null,
    endsAt: (m.status === 'writing' || m.status === 'guessing') ? m.endsAt : 0,
    myBluff: viewer?.bluff ?? null,
    bluffRejected: rejected,
    options,
    myGuess: viewer?.guessId ?? null,
    reveal: (m.status === 'reveal' || m.status === 'finished') ? m.reveal : null,
    winnerIds: m.winnerIds,
    dissolved: m.dissolved,
    myUserId: viewerUserId,
  };
}
