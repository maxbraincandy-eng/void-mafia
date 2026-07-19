export type CnStatus = 'waiting' | 'play' | 'finished';
export type CnColor = 0 | 1 | 2 | 3;
export interface CnPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    team: 0 | 1;
    isSpymaster: boolean;
}
export interface CnCard {
    word: string;
    color: CnColor;
    revealed: boolean;
}
export interface CnLogEntry {
    kind: 'clue' | 'guess' | 'pass' | 'end';
    team: 0 | 1;
    text: string;
}
export interface CnMatch {
    id: string;
    code: string;
    status: CnStatus;
    hostId: string;
    maxPlayers: number;
    players: CnPlayer[];
    board: CnCard[];
    startingTeam: 0 | 1;
    turnTeam: 0 | 1;
    clue: {
        word: string;
        number: number;
    } | null;
    guessesLeft: number;
    remaining: [number, number];
    winner: 0 | 1 | null;
    assassinFired: boolean;
    dissolved: boolean;
    log: CnLogEntry[];
    createdAt: number;
}
export interface CnPublicCard {
    word: string;
    revealed: boolean;
    color: CnColor | null;
}
export interface CnPublicState {
    id: string;
    code: string;
    status: CnStatus;
    hostId: string;
    maxPlayers: number;
    players: {
        userId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        team: 0 | 1;
        isSpymaster: boolean;
    }[];
    board: CnPublicCard[];
    startingTeam: 0 | 1;
    turnTeam: 0 | 1;
    clue: {
        word: string;
        number: number;
    } | null;
    guessesLeft: number;
    remaining: [number, number];
    winner: 0 | 1 | null;
    assassinFired: boolean;
    dissolved: boolean;
    log: CnLogEntry[];
    myTeam: 0 | 1 | null;
    amSpymaster: boolean;
    myUserId: string;
}
export interface CnListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: CnStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
}): CnMatch;
export declare function getMatch(id: string): CnMatch | null;
export declare function getMatchByCode(code: string): CnMatch | null;
export declare function getMatchForSocket(socketId: string): CnMatch | null;
export declare function listMatches(): CnListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: CnMatch;
    isNew: boolean;
} | null;
export declare function switchTeam(matchId: string, userId: string): CnMatch | null;
export declare function setSpymaster(matchId: string, userId: string): CnMatch | null;
export declare function leaveMatch(matchId: string, userId: string): CnMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
/** Explicit leave during active play — end the match for everyone. */
export declare function dissolveMatch(matchId: string, leaverId: string): CnMatch | null;
export declare function startMatch(matchId: string, byUserId: string): CnMatch | null;
export declare function giveClue(matchId: string, userId: string, word: string, number: number): CnMatch | null;
export declare function guessCard(matchId: string, userId: string, index: number): CnMatch | null;
export declare function passTurn(matchId: string, userId: string): CnMatch | null;
export declare function rematch(matchId: string, byUserId: string): CnMatch | null;
export declare function getSafeState(m: CnMatch, viewerUserId: string): CnPublicState;
//# sourceMappingURL=codenamesService.d.ts.map