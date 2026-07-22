export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen';
export type XmPhase = 'lobby' | 'assign' | 'night' | 'day_announce' | 'speech' | 'vote' | 'last_words' | 'finished';
export type XmWinner = 'town' | 'mafia' | null;
export declare const XM_FOULS_TO_ELIMINATE = 4;
export interface XmSeat {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    role: XmRole | null;
    alive: boolean;
    fouls: number;
    eliminatedRound: number | null;
    eliminatedBy: 'vote' | 'mafia' | 'fouls' | null;
}
export interface XmNightState {
    mafiaVotes: Record<string, string>;
    donCheck: string | null;
    donResult: boolean | null;
    sheriffCheck: string | null;
    sheriffResult: boolean | null;
}
export interface XmAnnounce {
    round: number;
    killedUserId: string | null;
    killedName: string | null;
}
export interface XmMatch {
    id: string;
    code: string;
    phase: XmPhase;
    hostId: string;
    hostSocketId: string;
    hostName: string;
    hostConnected: boolean;
    maxSeats: number;
    seats: XmSeat[];
    spectators: {
        userId: string;
        socketId: string;
        nickname: string;
        connected: boolean;
    }[];
    settings: {
        speechSeconds: number;
        nightSeconds: number;
        voteSeconds: number;
        lastWordsSeconds: number;
    };
    round: number;
    speechOrder: string[];
    speechIdx: number;
    speechEndsAt: number;
    nominations: string[];
    nominatedBy: Record<string, string>;
    night: XmNightState;
    announce: XmAnnounce | null;
    votes: Record<string, string>;
    voteEndsAt: number;
    voteResult: {
        eliminatedUserId: string | null;
        tally: Record<string, number>;
    } | null;
    lastWordsUserId: string | null;
    lastWordsEndsAt: number;
    winner: XmWinner;
    reveal: {
        userId: string;
        nickname: string;
        seat: number;
        role: XmRole;
    }[] | null;
    dissolved: boolean;
    createdAt: number;
}
export interface XmSafeSeat {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    alive: boolean;
    fouls: number;
    eliminatedBy: XmSeat['eliminatedBy'];
    role: XmRole | null;
    isSpeaking: boolean;
    isNominated: boolean;
}
export interface XmSafeState {
    id: string;
    code: string;
    phase: XmPhase;
    hostId: string;
    hostName: string;
    hostSocketId: string;
    hostConnected: boolean;
    maxSeats: number;
    seats: XmSafeSeat[];
    spectatorCount: number;
    settings: XmMatch['settings'];
    round: number;
    amHost: boolean;
    amSpectator: boolean;
    mySeat: number | null;
    myRole: XmRole | null;
    myAlive: boolean;
    myFouls: number;
    mateIds: string[];
    speakingUserId: string | null;
    speechEndsAt: number;
    speechIdx: number;
    speechTotal: number;
    nominations: {
        userId: string;
        nickname: string;
        seat: number;
    }[];
    iNominated: boolean;
    nightEndsAt: number;
    iActedTonight: boolean;
    nightPrivate: string | null;
    announce: XmAnnounce | null;
    voteEndsAt: number;
    myVote: string | null;
    voteTally: Record<string, number>;
    voteResult: XmMatch['voteResult'];
    lastWordsUserId: string | null;
    lastWordsName: string | null;
    lastWordsEndsAt: number;
    winner: XmWinner;
    reveal: XmMatch['reveal'];
    dissolved: boolean;
    myUserId: string;
}
export interface XmListItem {
    id: string;
    code: string;
    hostName: string;
    seatCount: number;
    maxSeats: number;
    phase: XmPhase;
}
/** Role split for a given number of seated players (host excluded). */
export declare function roleCounts(n: number): {
    don: number;
    mafia: number;
    sheriff: number;
    citizen: number;
};
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxSeats?: number;
}): XmMatch;
export declare function getMatch(id: string): XmMatch | null;
export declare function getMatchByCode(code: string): XmMatch | null;
export declare function getMatchForSocket(socketId: string): XmMatch | null;
export declare function listMatches(): XmListItem[];
/** Join as a seat (during lobby) or reconnect. Post-start newcomers become spectators. */
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: XmMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): XmMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function dissolveMatch(matchId: string, _byUserId: string): XmMatch | null;
export declare function assignRoles(m: XmMatch): void;
export declare function startMatch(matchId: string, byUserId: string): XmMatch | null;
/** Host re-rolls the secret roles while still on the assign screen. */
export declare function reshuffleRoles(matchId: string, byUserId: string): XmMatch | null;
export declare function beginNight(matchId: string, byUserId: string): XmMatch | null;
/** Mafia member picks the kill target for tonight. */
export declare function mafiaVote(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
export declare function donCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
export declare function sheriffCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/** Host closes the night. Resolves the kill and moves to the morning announcement. */
export declare function endNight(matchId: string, byUserId: string): XmMatch | null;
export declare function beginDay(matchId: string, byUserId: string): XmMatch | null;
export declare function nextSpeaker(matchId: string, byUserId: string): XmMatch | null;
/** Timer fired for the current speaker (byUserId null) or host skipped. */
export declare function advanceSpeakerAuto(matchId: string): XmMatch | null;
export declare function extendSpeech(matchId: string, byUserId: string, seconds: number): XmMatch | null;
/** The current speaker nominates one living player for the day's vote. */
export declare function nominate(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
export declare function castVote(matchId: string, byUserId: string, nomineeUserId: string): XmMatch | null;
/** Host closes the vote early (timer or manual). */
export declare function endVote(matchId: string, byUserId: string | null): XmMatch | null;
export declare function giveFoul(matchId: string, byUserId: string, targetUserId: string, delta: number): XmMatch | null;
/** Host (or timer) ends the farewell speech; flow returns to the day/night loop. */
export declare function endLastWords(matchId: string, byUserId: string | null): XmMatch | null;
export declare function rematch(matchId: string, byUserId: string): XmMatch | null;
export declare function getSafeState(m: XmMatch, viewerUserId: string): XmSafeState;
//# sourceMappingURL=sxvaMafiaService.d.ts.map