/**
 * Ludo game service — 2-player (Red vs Blue), 4 pieces each.
 * Turn flow: roll dice → pick piece to move → capture → win check.
 * Rolling 6 grants an extra roll (up to 3 consecutive 6s before forfeit).
 */

import { randomBytes } from 'crypto';

export type LudoColor = 'red' | 'blue';

// ── Board constants ────────────────────────────────────────────────────
const TRACK_LEN = 52;
const BLUE_OFFSET = 26; // Blue enters track 26 steps ahead of Red
const HOME_START = 52;  // positions 52-56 = home column cells
const HOME_END = 56;
export const WIN_POS = 57; // piece finished

// Absolute track positions that are safe (no capture)
export const SAFE_ABS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Track cells: TRACK_CELLS[absIdx] = [row, col] on 15×15 grid
export const TRACK_CELLS: [number, number][] = [
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0],
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],
  [0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],
  [14,8],[14,7],
];

export const RED_HOME_CELLS: [number, number][] = [[13,7],[12,7],[11,7],[10,7],[9,7]];
export const BLUE_HOME_CELLS: [number, number][] = [[1,7],[2,7],[3,7],[4,7],[5,7]];
export const RED_YARD_CELLS: [number, number][] = [[10,1],[10,3],[12,1],[12,3]];
export const BLUE_YARD_CELLS: [number, number][] = [[2,10],[2,12],[4,10],[4,12]];
export const CENTER_CELL: [number, number] = [7,7];

// ── Types ──────────────────────────────────────────────────────────────
export interface LudoPiece {
  id: number;   // 0-3
  pos: number;  // -1=yard, 0-51=main track (relative), 52-56=home col, 57=WIN
}

export interface LudoSide {
  name: string;
  profileId: string | null;
  socketId: string;
  pieces: LudoPiece[];
}

export interface LudoChatMsg {
  id: string;
  name: string;
  text: string;
  t: number;
}

export interface LudoMatch {
  id: string;
  code: string;
  status: 'waiting' | 'active' | 'finished';
  red: LudoSide;
  blue: LudoSide | null;
  currentTurn: LudoColor;
  diceRoll: number | null;
  diceRolled: boolean;
  movablePieceIds: number[];  // piece ids that can move after rolling
  consecutiveSixes: number;
  winnerColor: LudoColor | null;
  chat: LudoChatMsg[];
  spectatorSocketIds: string[];
  createdAt: number;
}

// ── In-memory store ────────────────────────────────────────────────────
const matchStore = new Map<string, LudoMatch>();
const socketIndex = new Map<string, string>(); // socketId → matchId

function genCode(): string {
  return 'LD-' + randomBytes(2).toString('hex').toUpperCase();
}

function genId(): string {
  return randomBytes(8).toString('hex');
}

function makePieces(): LudoPiece[] {
  return [0, 1, 2, 3].map(id => ({ id, pos: -1 }));
}

// ── Helpers ────────────────────────────────────────────────────────────

function relToAbs(relPos: number, color: LudoColor): number {
  if (color === 'red') return relPos;
  return (relPos + BLUE_OFFSET) % TRACK_LEN;
}

// Returns new position if move is valid, null if invalid (can't move or overshoot).
function calcNewPos(piece: LudoPiece, roll: number): number | null {
  if (piece.pos === WIN_POS) return null;
  if (piece.pos === -1) return roll === 6 ? 0 : null;
  const np = piece.pos + roll;
  return np > WIN_POS ? null : np;
}

function getMovablePieceIds(side: LudoSide, roll: number): number[] {
  return side.pieces.filter(p => calcNewPos(p, roll) !== null).map(p => p.id);
}

function resetDice(match: LudoMatch): void {
  match.diceRoll = null;
  match.diceRolled = false;
  match.movablePieceIds = [];
}

function nextTurn(match: LudoMatch): void {
  match.currentTurn = match.currentTurn === 'red' ? 'blue' : 'red';
  match.consecutiveSixes = 0;
  resetDice(match);
}

// ── Public API ─────────────────────────────────────────────────────────

export function createMatch(
  player: { socketId: string; name: string; profileId: string | null },
): LudoMatch {
  const id = genId();
  const code = genCode();
  const match: LudoMatch = {
    id, code,
    status: 'waiting',
    red: { name: player.name, profileId: player.profileId, socketId: player.socketId, pieces: makePieces() },
    blue: null,
    currentTurn: 'red',
    diceRoll: null,
    diceRolled: false,
    movablePieceIds: [],
    consecutiveSixes: 0,
    winnerColor: null,
    chat: [],
    spectatorSocketIds: [],
    createdAt: Date.now(),
  };
  matchStore.set(id, match);
  socketIndex.set(player.socketId, id);
  return match;
}

export function getMatch(id: string): LudoMatch | null {
  return matchStore.get(id) ?? null;
}

export function getMatchByCode(code: string): LudoMatch | null {
  for (const m of matchStore.values()) if (m.code === code) return m;
  return null;
}

export function getMatchForSocket(socketId: string): LudoMatch | null {
  const id = socketIndex.get(socketId);
  return id ? (matchStore.get(id) ?? null) : null;
}

export function getOpenMatches(): LudoMatch[] {
  const now = Date.now();
  return [...matchStore.values()]
    .filter(m => m.status !== 'finished' && now - m.createdAt < 3_600_000)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function joinMatch(
  matchId: string,
  player: { socketId: string; name: string; profileId: string | null },
): { role: 'blue' | 'spectator'; match: LudoMatch } {
  const match = matchStore.get(matchId);
  if (!match) throw new Error('Match not found.');
  if (match.status === 'finished') throw new Error('Match is finished.');

  if (match.red.socketId === player.socketId) {
    return { role: 'spectator', match }; // re-join as red (caller handles room join)
  }
  if (match.blue?.socketId === player.socketId) {
    return { role: 'blue', match };
  }

  if (!match.blue && match.status === 'waiting') {
    match.blue = {
      name: player.name, profileId: player.profileId,
      socketId: player.socketId, pieces: makePieces(),
    };
    match.status = 'active';
    socketIndex.set(player.socketId, matchId);
    return { role: 'blue', match };
  }

  if (!match.spectatorSocketIds.includes(player.socketId)) {
    match.spectatorSocketIds.push(player.socketId);
    socketIndex.set(player.socketId, matchId);
  }
  return { role: 'spectator', match };
}

export interface RollResult {
  roll: number;
  movablePieceIds: number[];
  autoEnded: boolean;
}

export function doRoll(matchId: string, socketId: string): RollResult {
  const match = matchStore.get(matchId);
  if (!match) throw new Error('Match not found.');
  if (match.status !== 'active') throw new Error('Game not active.');
  if (match.diceRolled) throw new Error('Already rolled this turn.');

  const side = match.currentTurn === 'red' ? match.red : match.blue;
  if (!side || side.socketId !== socketId) throw new Error('Not your turn.');

  const roll = Math.floor(Math.random() * 6) + 1;
  match.diceRoll = roll;
  match.diceRolled = true;

  if (roll === 6) {
    match.consecutiveSixes++;
    if (match.consecutiveSixes >= 3) {
      nextTurn(match);
      return { roll, movablePieceIds: [], autoEnded: true };
    }
  } else {
    match.consecutiveSixes = 0;
  }

  const movable = getMovablePieceIds(side, roll);
  match.movablePieceIds = movable;

  if (movable.length === 0) {
    nextTurn(match);
    return { roll, movablePieceIds: [], autoEnded: true };
  }

  return { roll, movablePieceIds: movable, autoEnded: false };
}

export interface MoveResult {
  captured: boolean;
  capturedColor: LudoColor | null;
  capturedPieceId: number | null;
  reached: boolean;
  turnEnded: boolean;
  winnerColor: LudoColor | null;
}

export function doMove(matchId: string, socketId: string, pieceId: number): MoveResult {
  const match = matchStore.get(matchId);
  if (!match) throw new Error('Match not found.');
  if (match.status !== 'active') throw new Error('Game not active.');
  if (!match.diceRolled) throw new Error('Roll first.');

  const color = match.currentTurn;
  const side = color === 'red' ? match.red : match.blue;
  const oppColor: LudoColor = color === 'red' ? 'blue' : 'red';
  const opponent = color === 'red' ? match.blue : match.red;

  if (!side || side.socketId !== socketId) throw new Error('Not your turn.');
  if (!match.movablePieceIds.includes(pieceId)) throw new Error('Piece cannot move with this roll.');

  const piece = side.pieces.find(p => p.id === pieceId);
  if (!piece) throw new Error('Piece not found.');

  const roll = match.diceRoll!;
  const np = calcNewPos(piece, roll);
  if (np === null) throw new Error('Invalid move.');

  piece.pos = np;
  match.movablePieceIds = [];

  // Check capture — only on main track, non-safe squares
  let captured = false;
  let capturedPieceId: number | null = null;

  if (np >= 0 && np < HOME_START && opponent) {
    const myAbs = relToAbs(np, color);
    if (!SAFE_ABS.has(myAbs)) {
      for (const oppPiece of opponent.pieces) {
        if (oppPiece.pos >= 0 && oppPiece.pos < HOME_START) {
          const oppAbs = relToAbs(oppPiece.pos, oppColor);
          if (oppAbs === myAbs) {
            oppPiece.pos = -1;
            captured = true;
            capturedPieceId = oppPiece.id;
            break;
          }
        }
      }
    }
  }

  const reached = np === WIN_POS;
  const allDone = side.pieces.every(p => p.pos === WIN_POS);

  let winnerColor: LudoColor | null = null;
  if (allDone) {
    match.winnerColor = color;
    match.status = 'finished';
    winnerColor = color;
    resetDice(match);
    return { captured, capturedColor: captured ? oppColor : null, capturedPieceId, reached, turnEnded: true, winnerColor };
  }

  // Roll 6 and not forfeit: extra turn
  if (roll === 6 && match.consecutiveSixes < 3) {
    resetDice(match);
    return { captured, capturedColor: captured ? oppColor : null, capturedPieceId, reached, turnEnded: false, winnerColor: null };
  }

  nextTurn(match);
  return { captured, capturedColor: captured ? oppColor : null, capturedPieceId, reached, turnEnded: true, winnerColor: null };
}

export function doResign(matchId: string, socketId: string): LudoColor {
  const match = matchStore.get(matchId);
  if (!match) throw new Error('Match not found.');
  if (match.status !== 'active') throw new Error('Game not active.');

  let winnerColor: LudoColor;
  if (match.red.socketId === socketId) winnerColor = 'blue';
  else if (match.blue?.socketId === socketId) winnerColor = 'red';
  else throw new Error('You are not a player.');

  match.winnerColor = winnerColor;
  match.status = 'finished';
  resetDice(match);
  return winnerColor;
}

export function doRematch(matchId: string, socketId: string): LudoMatch {
  const old = matchStore.get(matchId);
  if (!old) throw new Error('Match not found.');
  if (old.status !== 'finished') throw new Error('Match still active.');

  const isRed = old.red.socketId === socketId;
  const isBlue = old.blue?.socketId === socketId;
  if (!isRed && !isBlue) throw new Error('Not a player.');
  if (!old.blue) throw new Error('Cannot rematch solo.');

  // Swap colors
  const newRed  = isRed ? old.blue  : old.red;
  const newBlue = isRed ? old.red   : old.blue;

  const nm: LudoMatch = {
    id: genId(),
    code: genCode(),
    status: 'active',
    red:  { ...newRed,  pieces: makePieces() },
    blue: { ...newBlue, pieces: makePieces() },
    currentTurn: 'red',
    diceRoll: null,
    diceRolled: false,
    movablePieceIds: [],
    consecutiveSixes: 0,
    winnerColor: null,
    chat: [],
    spectatorSocketIds: [...old.spectatorSocketIds],
    createdAt: Date.now(),
  };

  matchStore.set(nm.id, nm);
  socketIndex.set(nm.red.socketId, nm.id);
  socketIndex.set(nm.blue!.socketId, nm.id);

  // Clean up old
  socketIndex.delete(old.red.socketId);
  socketIndex.delete(old.blue.socketId);
  for (const s of old.spectatorSocketIds) socketIndex.set(s, nm.id);
  matchStore.delete(matchId);

  return nm;
}

export function doLeave(socketId: string): { match: LudoMatch | null; wasPlayer: boolean } {
  const matchId = socketIndex.get(socketId);
  if (!matchId) return { match: null, wasPlayer: false };

  socketIndex.delete(socketId);
  const match = matchStore.get(matchId);
  if (!match) return { match: null, wasPlayer: false };

  match.spectatorSocketIds = match.spectatorSocketIds.filter(s => s !== socketId);

  const isRed  = match.red.socketId === socketId;
  const isBlue = match.blue?.socketId === socketId;

  if ((isRed || isBlue) && match.status === 'active') {
    match.winnerColor = isRed ? 'blue' : 'red';
    match.status = 'finished';
    resetDice(match);
    return { match, wasPlayer: true };
  }

  return { match, wasPlayer: false };
}

export function addChat(matchId: string, socketId: string, text: string): LudoChatMsg {
  const match = matchStore.get(matchId);
  if (!match) throw new Error('Match not found.');

  let name = 'Spectator';
  if (match.red.socketId === socketId) name = match.red.name;
  else if (match.blue?.socketId === socketId) name = match.blue.name;
  else if (!match.spectatorSocketIds.includes(socketId)) throw new Error('Not in match.');

  const msg: LudoChatMsg = {
    id: randomBytes(4).toString('hex'),
    name,
    text: text.trim().slice(0, 300),
    t: Date.now(),
  };
  match.chat.push(msg);
  if (match.chat.length > 200) match.chat = match.chat.slice(-200);
  return msg;
}

export function cleanupSocket(socketId: string): LudoMatch | null {
  return doLeave(socketId).match;
}
