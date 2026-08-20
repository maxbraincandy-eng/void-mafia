export type DrawStatus = 'waiting' | 'choosing' | 'drawing' | 'turnend' | 'finished';
export interface DrawSeg {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    c: string;
    w: number;
}
export interface DrawPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    score: number;
    guessedThisTurn: boolean;
    roundScore: number;
}
export interface DrawMatch {
    id: string;
    code: string;
    status: DrawStatus;
    hostId: string;
    maxPlayers: number;
    players: DrawPlayer[];
    settings: {
        rounds: number;
        drawSeconds: number;
    };
    deck: string[];
    deckPos: number;
    turnOrder: string[];
    turnIdx: number;
    round: number;
    drawerId: string | null;
    word: string | null;
    wordChoices: string[];
    endsAt: number;
    correctThisTurn: number;
    segs: DrawSeg[];
    lastWord: string | null;
    winner: string | null;
    dissolved: boolean;
    createdAt: number;
}
export interface DrawPublicPlayer {
    userId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    score: number;
    guessedThisTurn: boolean;
}
export interface DrawPublicState {
    id: string;
    code: string;
    status: DrawStatus;
    hostId: string;
    maxPlayers: number;
    players: DrawPublicPlayer[];
    settings: {
        rounds: number;
        drawSeconds: number;
    };
    round: number;
    totalRounds: number;
    drawerId: string | null;
    drawerName: string | null;
    amDrawer: boolean;
    /** Only the drawer sees the actual word / choices. Everyone sees the mask. */
    myWord: string | null;
    myChoices: string[] | null;
    wordMask: string | null;
    revealedWord: string | null;
    endsAt: number;
    iGuessed: boolean;
    winnerId: string | null;
    dissolved: boolean;
    myUserId: string;
}
export interface DrawListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: DrawStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
    rounds?: number;
    drawSeconds?: number;
}): DrawMatch;
export declare function getMatch(id: string): DrawMatch | null;
export declare function getMatchByCode(code: string): DrawMatch | null;
export declare function getMatchForSocket(socketId: string): DrawMatch | null;
export declare function listMatches(): DrawListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: DrawMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): DrawMatch | null;
/** Explicit leave during active play — end the match for everyone. */
export declare function dissolveMatch(matchId: string, leaverId: string): DrawMatch | null;
/** Re-attach a player who came back on a new socket. See liesService.resumeForUser. */
export declare function resumeForUser(userId: string, socketId: string): DrawMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function startMatch(matchId: string, byUserId: string): DrawMatch | null;
/** Enter the word-choice phase for the current turn's drawer. */
export declare function beginChoosing(m: DrawMatch): void;
export declare function chooseWord(matchId: string, byUserId: string, word: string): DrawMatch | null;
/** Auto-pick the first choice if the drawer dawdles. */
export declare function autoChoose(matchId: string): DrawMatch | null;
export type GuessOut = {
    kind: 'correct';
    nickname: string;
    allGuessed: boolean;
} | {
    kind: 'chat';
    nickname: string;
    text: string;
} | null;
export declare function guess(matchId: string, userId: string, text: string): GuessOut;
/** Time up or everyone guessed → reveal, brief scoreboard, then advance. */
export declare function endTurn(matchId: string): DrawMatch | null;
export declare function nextTurn(matchId: string): DrawMatch | null;
export declare function rematch(matchId: string, byUserId: string): DrawMatch | null;
export declare function addSeg(matchId: string, byUserId: string, seg: DrawSeg): boolean;
export declare function clearCanvas(matchId: string, byUserId: string): boolean;
export declare function getSafeState(m: DrawMatch, viewerUserId: string): DrawPublicState;
//# sourceMappingURL=drawService.d.ts.map