export type UnoColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type UnoCardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export type UnoStatus = 'waiting' | 'active' | 'color_choice' | 'finished';
export type GameColor = 'red' | 'blue' | 'green' | 'yellow';
export interface UnoCard {
    id: string;
    color: UnoColor;
    type: UnoCardType;
    value?: number;
}
export interface UnoSettings {
    maxPlayers: number;
    spectatorsAllowed: boolean;
    stackingEnabled: boolean;
    unoPenaltyEnabled: boolean;
}
export interface UnoPlayer {
    userId: string;
    nickname: string;
    socketId: string;
    seat: number;
    connected: boolean;
    calledUno: boolean;
}
export interface UnoMatch {
    id: string;
    code: string;
    status: UnoStatus;
    hostId: string;
    players: UnoPlayer[];
    spectatorIds: string[];
    settings: UnoSettings;
    deck: UnoCard[];
    discardPile: UnoCard[];
    hands: Record<string, UnoCard[]>;
    currentPlayerIndex: number;
    direction: 1 | -1;
    currentColor: GameColor | null;
    pendingDrawCount: number;
    pendingDrawType: 'draw2' | 'wild4' | null;
    winnerId: string | null;
    voiceSessionId: string;
    chat: UnoChatMsg[];
    createdAt: number;
}
export interface UnoChatMsg {
    userId: string;
    nickname: string;
    text: string;
    ts: number;
}
export interface UnoListItem {
    id: string;
    code: string;
    status: UnoStatus;
    playerCount: number;
    maxPlayers: number;
    playerNicknames: string[];
}
export interface UnoPublicState {
    id: string;
    code: string;
    status: UnoStatus;
    hostId: string;
    players: Array<{
        userId: string;
        nickname: string;
        socketId: string;
        seat: number;
        connected: boolean;
        calledUno: boolean;
        cardCount: number;
    }>;
    spectatorCount: number;
    settings: UnoSettings;
    topDiscard: UnoCard | null;
    currentColor: GameColor | null;
    currentPlayerId: string | null;
    direction: 1 | -1;
    pendingDrawCount: number;
    deckSize: number;
    winnerId: string | null;
    voiceSessionId: string;
    chat: UnoChatMsg[];
    myHand: UnoCard[];
    myUserId: string;
}
export declare function createMatch(hostId: string, hostSocketId: string, nickname: string, opts?: Partial<UnoSettings>): UnoMatch;
export declare function getMatch(matchId: string): UnoMatch | null;
export declare function getMatchByCode(code: string): UnoMatch | null;
export declare function getMatchForSocket(socketId: string): UnoMatch | null;
export declare function listMatches(): UnoListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: UnoMatch;
    isNew: boolean;
} | null;
export declare function spectateMatch(matchId: string, socketId: string): UnoMatch | null;
export declare function leaveMatch(matchId: string, userId: string, socketId: string): UnoMatch | null;
export declare function startMatch(matchId: string, hostId: string): UnoMatch | null;
export declare function playCard(matchId: string, userId: string, cardId: string, chosenColor?: GameColor): {
    match: UnoMatch;
    error?: string;
} | null;
export declare function drawCard(matchId: string, userId: string): {
    match: UnoMatch;
    drawnCard?: UnoCard;
    error?: string;
} | null;
export declare function callUno(matchId: string, userId: string): UnoMatch | null;
export declare function applyUnoPenaltyIfNeeded(m: UnoMatch): void;
export declare function sendChat(matchId: string, userId: string, nickname: string, text: string): {
    match: UnoMatch;
    msg: UnoChatMsg;
} | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function rematch(matchId: string, hostId: string): UnoMatch | null;
export declare function getSafeState(m: UnoMatch, viewerUserId: string): UnoPublicState;
//# sourceMappingURL=unoService.d.ts.map