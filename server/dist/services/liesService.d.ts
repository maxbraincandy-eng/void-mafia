import { type LiesQuestion } from '../liesQuestions.js';
export type LiesStatus = 'waiting' | 'writing' | 'guessing' | 'reveal' | 'finished';
export declare const TRUTH_POINTS = 1000;
export declare const FOOL_POINTS = 500;
export interface LiesPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    score: number;
    bluff: string | null;
    guessId: string | null;
}
/** A shuffled option shown in the guessing phase. */
interface LiesOption {
    id: string;
    text: string;
    isTruth: boolean;
    authorIds: string[];
}
export interface LiesRevealEntry {
    optionId: string;
    text: string;
    isTruth: boolean;
    authorNames: string[];
    pickedBy: {
        userId: string;
        nickname: string;
    }[];
}
export interface LiesReveal {
    prompt: string;
    truth: string;
    category: string;
    entries: LiesRevealEntry[];
    deltas: {
        userId: string;
        nickname: string;
        delta: number;
    }[];
}
export interface LiesMatch {
    id: string;
    code: string;
    status: LiesStatus;
    hostId: string;
    maxPlayers: number;
    players: LiesPlayer[];
    settings: {
        rounds: number;
        writeSeconds: number;
        guessSeconds: number;
    };
    round: number;
    question: LiesQuestion | null;
    usedQuestionIds: string[];
    options: LiesOption[] | null;
    endsAt: number;
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
    players: {
        userId: string;
        socketId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        score: number;
        done: boolean;
    }[];
    settings: {
        rounds: number;
        writeSeconds: number;
        guessSeconds: number;
    };
    round: number;
    prompt: string | null;
    category: string | null;
    endsAt: number;
    myBluff: string | null;
    bluffRejected: boolean;
    options: {
        id: string;
        text: string;
        mine: boolean;
    }[] | null;
    myGuess: string | null;
    reveal: LiesReveal | null;
    winnerIds: string[];
    dissolved: boolean;
    myUserId: string;
}
export interface LiesListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: LiesStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
    rounds?: number;
}): LiesMatch;
export declare function getMatch(id: string): LiesMatch | null;
export declare function getMatchByCode(code: string): LiesMatch | null;
export declare function getMatchForSocket(socketId: string): LiesMatch | null;
export declare function listMatches(): LiesListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: LiesMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): LiesMatch | null;
/**
 * Re-attach a player who came back on a new socket.
 *
 * A phone that locks its screen for half a minute gets a fresh socket id, and
 * the match still holds the dead one — so the player stops receiving state and
 * their screen freezes mid-round while their voice, on a separate connection,
 * carries on as if nothing happened. Identity is what survives that, so this
 * looks the player up by id and re-points the row.
 *
 * Also the answer to a full page reload: the client keeps nothing, the server
 * remembers which match this player is in, so asking is enough to get back.
 */
export declare function resumeForUser(userId: string, socketId: string): LiesMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
/** Explicit leave during active play — end the match for everyone. */
export declare function dissolveMatch(matchId: string, leaverId: string): LiesMatch | null;
export declare function startMatch(matchId: string, byUserId: string): LiesMatch | null;
export type BluffResult = 'ok' | 'rejected_truth' | 'invalid';
/** Submit a bluff during the writing phase. Rejects an empty bluff or the truth. */
export declare function submitBluff(matchId: string, byUserId: string, text: string): {
    match: LiesMatch;
    result: BluffResult;
} | null;
export declare function clearRejected(userId: string): void;
/** Build shuffled options (merged bluffs + truth) and move to guessing. */
export declare function beginGuessing(m: LiesMatch): void;
/** Pick which option is the truth. A player may not pick their own bluff. */
export declare function submitGuess(matchId: string, byUserId: string, optionId: string): LiesMatch | null;
/** Force the current phase to end (timer fired). */
export declare function forcePhaseEnd(matchId: string): LiesMatch | null;
/** Host advances from reveal: next round, or final results after the last one. */
export declare function nextRound(matchId: string, byUserId: string): LiesMatch | null;
export declare function rematch(matchId: string, byUserId: string): LiesMatch | null;
export declare function getSafeState(m: LiesMatch, viewerUserId: string): LiesPublicState;
export {};
//# sourceMappingURL=liesService.d.ts.map