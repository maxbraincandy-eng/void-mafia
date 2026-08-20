export type AliasStatus = 'waiting' | 'play' | 'finished';
export interface AliasPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    team: 0 | 1;
}
export interface AliasTurn {
    team: 0 | 1;
    describerId: string;
    endsAt: number;
    correct: number;
    skipped: number;
    /** Words resolved this turn, for the end-of-turn recap (word + gotIt). */
    log: {
        word: string;
        got: boolean;
    }[];
}
export interface AliasMatch {
    id: string;
    code: string;
    status: AliasStatus;
    hostId: string;
    maxPlayers: number;
    players: AliasPlayer[];
    settings: {
        targetScore: number;
        roundSeconds: number;
    };
    scores: [number, number];
    deck: string[];
    deckPos: number;
    /** Rotating describer index per team. */
    describerIdx: [number, number];
    activeTeam: 0 | 1;
    turn: AliasTurn | null;
    currentWord: string | null;
    winner: 0 | 1 | null;
    dissolved: boolean;
    round: number;
    createdAt: number;
}
export interface AliasPublicState {
    id: string;
    code: string;
    status: AliasStatus;
    hostId: string;
    maxPlayers: number;
    players: {
        userId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        team: 0 | 1;
    }[];
    settings: {
        targetScore: number;
        roundSeconds: number;
    };
    scores: [number, number];
    activeTeam: 0 | 1;
    turn: {
        team: 0 | 1;
        describerId: string;
        describerName: string;
        endsAt: number;
        correct: number;
        skipped: number;
    } | null;
    /** When it's between turns, the player who may press "start" for the active team. */
    nextDescriberId: string | null;
    lastTurnLog: {
        word: string;
        got: boolean;
    }[] | null;
    /** The word — only ever populated for the active describer. */
    myWord: string | null;
    amDescriber: boolean;
    myTeam: 0 | 1 | null;
    winner: 0 | 1 | null;
    dissolved: boolean;
    myUserId: string;
    round: number;
}
export interface AliasListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: AliasStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
    targetScore?: number;
    roundSeconds?: number;
}): AliasMatch;
export declare function getMatch(id: string): AliasMatch | null;
export declare function getMatchByCode(code: string): AliasMatch | null;
export declare function getMatchForSocket(socketId: string): AliasMatch | null;
export declare function listMatches(): AliasListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: AliasMatch;
    isNew: boolean;
} | null;
export declare function switchTeam(matchId: string, userId: string): AliasMatch | null;
export declare function leaveMatch(matchId: string, userId: string): AliasMatch | null;
/** Re-attach a player who came back on a new socket. See liesService.resumeForUser. */
export declare function resumeForUser(userId: string, socketId: string): AliasMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
/** Explicit leave during active play — end the match for everyone. */
export declare function dissolveMatch(matchId: string, leaverId: string): AliasMatch | null;
export declare function startMatch(matchId: string, byUserId: string): AliasMatch | null;
/** The next describer of the active team starts their timed turn. */
export declare function startTurn(matchId: string, byUserId: string): AliasMatch | null;
/** Describer marks the current word. got=true → +1, got=false → skip (−1, min 0). */
export declare function markWord(matchId: string, byUserId: string, got: boolean): AliasMatch | null;
/** Called by the turn timer when time is up. Advances to the other team. */
export declare function endTurn(matchId: string): AliasMatch | null;
export declare function rematch(matchId: string, byUserId: string): AliasMatch | null;
export declare function getSafeState(m: AliasMatch, viewerUserId: string): AliasPublicState;
//# sourceMappingURL=aliasService.d.ts.map