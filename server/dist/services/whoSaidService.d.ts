/**
 * ვინ თქვა? — one player reads an absurd line aloud, everybody else guesses
 * who it was.
 *
 * WHY THIS IS A GAME AND NOT A QUIZ
 * ─────────────────────────────────
 * The room is already on voice for every other game here, and voice is used
 * only to talk. This makes the voice itself the thing being played: the reader
 * has to sound like somebody else for fifteen seconds to people who know
 * exactly what they sound like, and everybody else has to listen harder than
 * they ever do on a call.
 *
 * NOTHING IS RECORDED
 * ───────────────────
 * The line is read live and heard live. No audio is captured, uploaded or
 * stored anywhere — the server holds a phrase index and a set of votes, and
 * both are gone when the match ends.
 *
 * THE ONE SECRET
 * ──────────────
 * Who is reading. It is sent to the reader and to nobody else, per viewer, in
 * `getSafeState` — the same shape ჯაშუში uses for the spy. A client that could
 * see the reader would end the game, and it would look completely normal from
 * the outside.
 *
 * Pure logic — no socket.io. In-memory Maps, reconnect-aware join, per-viewer
 * safe state, three-hour sweep, as the Alias/UNO/Spyfall services do.
 */
export type WhoSaidStatus = 'waiting' | 'reading' | 'voting' | 'reveal' | 'finished';
export interface WhoSaidPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    score: number;
    /** How many times this player has been the reader, for a fair rotation. */
    timesRead: number;
    /**
     * They pressed leave, as opposed to dropping off the network.
     *
     * The two have to be told apart. `emitToPlayers` finds a player's live socket
     * by identity and re-points the row to it, which is what makes reconnecting
     * work — and it means a player who deliberately left, and whose socket is
     * still very much open, is found again on the next broadcast and marked
     * present. They would be sent a round they had walked out of, and counted as
     * a voter it then waited for.
     */
    left: boolean;
    /** Who they accused this round, or null. */
    vote: string | null;
}
export interface WhoSaidReveal {
    readerId: string;
    readerName: string;
    phrase: string;
    /** Who guessed right. */
    correct: string[];
    /** How many were fooled. */
    fooled: number;
    points: Record<string, number>;
}
export interface WhoSaidMatch {
    id: string;
    code: string;
    hostId: string;
    status: WhoSaidStatus;
    players: WhoSaidPlayer[];
    maxPlayers: number;
    rounds: number;
    round: number;
    /** Who is reading this round. Never leaves the server except to them. */
    readerId: string | null;
    phraseIndex: number | null;
    usedPhrases: number[];
    /** When the current phase ends, ms since the epoch. */
    endsAt: number;
    reveal: WhoSaidReveal | null;
    createdAt: number;
    updatedAt: number;
}
/** What a client is allowed to know. */
export interface WhoSaidPublicState {
    id: string;
    code: string;
    hostId: string;
    status: WhoSaidStatus;
    round: number;
    rounds: number;
    endsAt: number;
    players: {
        userId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        score: number;
        hasVoted: boolean;
    }[];
    /** True only for the player who is reading. */
    youAreReading: boolean;
    /** The line — only ever sent to the reader, and only while they are reading. */
    phrase: string | null;
    /** Whom this viewer voted for. */
    yourVote: string | null;
    reveal: WhoSaidReveal | null;
    maxPlayers: number;
}
export interface WhoSaidListItem {
    id: string;
    code: string;
    hostName: string;
    players: number;
    maxPlayers: number;
    status: WhoSaidStatus;
}
export declare const MIN_PLAYERS = 3;
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts?: {
    maxPlayers?: number;
    rounds?: number;
}): WhoSaidMatch;
export declare function getMatch(id: string): WhoSaidMatch | null;
export declare function getMatchByCode(code: string): WhoSaidMatch | null;
export declare function getMatchForSocket(socketId: string): WhoSaidMatch | null;
export declare function listMatches(): WhoSaidListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: WhoSaidMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): WhoSaidMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function resumeForUser(userId: string, socketId: string): WhoSaidMatch | null;
export declare function startMatch(matchId: string, byUserId: string): WhoSaidMatch | null;
/** Reading is over: open the vote. The host may cut it short. */
export declare function beginVoting(matchId: string, byUserId: string | null): WhoSaidMatch | null;
/**
 * Accuse somebody.
 *
 * The reader cannot vote, nobody can vote for themselves, and a vote for a
 * player who is not in the match is dropped rather than stored — a vote that
 * cannot be scored would silently turn into a point for the reader.
 */
export declare function castVote(matchId: string, byUserId: string, targetId: string): WhoSaidMatch | null;
/** Close the round, score it, and show who it was. */
export declare function finishRound(m: WhoSaidMatch): void;
/** Called by the socket layer when the vote clock runs out. */
export declare function forceFinishRound(matchId: string): WhoSaidMatch | null;
export declare function nextRound(matchId: string, byUserId: string): WhoSaidMatch | null;
export declare function rematch(matchId: string, byUserId: string): WhoSaidMatch | null;
/**
 * What this viewer may see.
 *
 * The phrase goes to the reader alone, and only while they are reading — once
 * voting starts even they do not need it, and leaving it in the payload would
 * mean the one client that has it is also the one that could be screenshotted
 * over somebody's shoulder.
 *
 * Nobody's vote is visible until the reveal. A board showing live votes turns
 * the round into "wait and follow whoever is confident".
 */
export declare function getSafeState(m: WhoSaidMatch, viewerUserId: string): WhoSaidPublicState;
/**
 * Who a state broadcast should go to.
 *
 * Everybody still in the match, whether or not they are currently connected —
 * a player whose phone slept must get the round back the moment they return —
 * but never somebody who pressed leave.
 */
export declare function recipients(m: WhoSaidMatch): WhoSaidPlayer[];
/** For tests: forget every match. */
export declare function __reset(): void;
//# sourceMappingURL=whoSaidService.d.ts.map