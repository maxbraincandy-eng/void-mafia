export type SpyfallStatus = 'waiting' | 'play' | 'voting' | 'reveal' | 'finished';
export type SpyfallOutcome = 'spy_caught' | 'spy_escaped' | 'wrong_accused' | 'spy_guessed' | 'spy_wrong';
/** How long jurors have to respond to a mid-round accusation before it lapses. */
export declare const ACCUSE_SECONDS = 30;
export interface SpyfallPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    score: number;
    isSpy: boolean;
    role: string | null;
    vote: string | null;
    accusationUsed: boolean;
}
/**
 * A live mid-round accusation (classic Spyfall). One player accuses another;
 * every other connected player is a juror who must agree for the round to end.
 * A single "no" (or the deadline lapsing) dismisses it and resumes discussion.
 */
export interface SpyfallAccusation {
    accuserId: string;
    accuserName: string;
    targetId: string;
    targetName: string;
    agree: string[];
    disagree: string[];
    deadline: number;
}
export interface SpyfallReveal {
    spyId: string;
    spyName: string;
    location: string;
    locationEmoji: string;
    outcome: SpyfallOutcome;
    accusedName: string | null;
    guessedLocation: string | null;
    votes: {
        nickname: string;
        targetName: string;
    }[];
}
export interface SpyfallMatch {
    id: string;
    code: string;
    status: SpyfallStatus;
    hostId: string;
    maxPlayers: number;
    players: SpyfallPlayer[];
    settings: {
        rounds: number;
        discussSeconds: number;
    };
    round: number;
    locationIdx: number | null;
    usedLocationIdxs: number[];
    endsAt: number;
    accusation: SpyfallAccusation | null;
    pausedMsLeft: number | null;
    reveal: SpyfallReveal | null;
    winnerIds: string[];
    dissolved: boolean;
    createdAt: number;
}
export interface SpyfallAccusationView {
    accuserId: string;
    accuserName: string;
    targetId: string;
    targetName: string;
    agreeIds: string[];
    disagreeIds: string[];
    jurorCount: number;
    deadline: number;
}
export interface SpyfallPublicState {
    id: string;
    code: string;
    status: SpyfallStatus;
    hostId: string;
    maxPlayers: number;
    players: {
        userId: string;
        socketId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        score: number;
        hasVoted: boolean;
    }[];
    settings: {
        rounds: number;
        discussSeconds: number;
    };
    round: number;
    endsAt: number;
    pausedMsLeft: number | null;
    locations: {
        name: string;
        emoji: string;
    }[];
    amSpy: boolean;
    myLocation: string | null;
    myLocationEmoji: string | null;
    myRole: string | null;
    myVote: string | null;
    accusation: SpyfallAccusationView | null;
    myAccusationUsed: boolean;
    reveal: SpyfallReveal | null;
    winnerIds: string[];
    dissolved: boolean;
    myUserId: string;
}
export interface SpyfallListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: SpyfallStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
    rounds?: number;
    discussSeconds?: number;
}): SpyfallMatch;
export declare function getMatch(id: string): SpyfallMatch | null;
export declare function getMatchByCode(code: string): SpyfallMatch | null;
export declare function getMatchForSocket(socketId: string): SpyfallMatch | null;
export declare function listMatches(): SpyfallListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: SpyfallMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): SpyfallMatch | null;
/** Re-attach a player who came back on a new socket. See liesService.resumeForUser. */
export declare function resumeForUser(userId: string, socketId: string): SpyfallMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
/** Explicit leave during active play — end the match for everyone. */
export declare function dissolveMatch(matchId: string, leaverId: string): SpyfallMatch | null;
export declare function startMatch(matchId: string, byUserId: string): SpyfallMatch | null;
/** Host cuts discussion short, or the timer fires (byUserId=null). */
export declare function beginVoting(matchId: string, byUserId: string | null): SpyfallMatch | null;
export declare function castVote(matchId: string, byUserId: string, targetId: string): SpyfallMatch | null;
/** The spy stops the round and names the location. Allowed during play or voting. */
export declare function spyGuess(matchId: string, byUserId: string, locationName: string): SpyfallMatch | null;
/** Any player (once per round) accuses another of being the spy, pausing the clock. */
export declare function startAccusation(matchId: string, byUserId: string, targetId: string): SpyfallMatch | null;
/** A juror agrees to / refuses the pending accusation. Auto-resolves when all have answered. */
export declare function respondAccusation(matchId: string, byUserId: string, agree: boolean): SpyfallMatch | null;
/** Deadline lapsed: any silent juror counts as a refusal, so the accusation fails. */
export declare function forceResolveAccusation(matchId: string): SpyfallMatch | null;
/** Host advances from reveal: next round, or final results after the last one. */
export declare function nextRound(matchId: string, byUserId: string): SpyfallMatch | null;
export declare function rematch(matchId: string, byUserId: string): SpyfallMatch | null;
export declare function getSafeState(m: SpyfallMatch, viewerUserId: string): SpyfallPublicState;
//# sourceMappingURL=spyfallService.d.ts.map