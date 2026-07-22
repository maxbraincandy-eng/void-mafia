export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen';
export type XmPhase = 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech' | 'vote' | 'last_words' | 'finished';
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
    lastCheck: string | null;
    cardIndex: number | null;
}
export interface XmLogEntry {
    round: number;
    phase: 'night' | 'day' | 'foul' | 'game';
    text: string;
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
        floorControl: boolean;
    };
    roleConfig: {
        don: number;
        mafia: number;
        sheriff: number;
    } | null;
    deck: XmRole[];
    log: XmLogEntry[];
    round: number;
    speechOrder: string[];
    speechIdx: number;
    speechEndsAt: number;
    nominations: string[];
    nominatedBy: Record<string, string>;
    night: XmNightState;
    nightEndsAt: number;
    announce: XmAnnounce | null;
    votes: Record<string, string>;
    voteEndsAt: number;
    voteRevote: boolean;
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
    setup: {
        don: number;
        mafia: number;
        sheriff: number;
        citizen: number;
    };
    roleConfigCustom: boolean;
    round: number;
    amHost: boolean;
    amSpectator: boolean;
    mySeat: number | null;
    myRole: XmRole | null;
    myAlive: boolean;
    myFouls: number;
    mateIds: string[];
    cards: {
        index: number;
        claimedById: string | null;
        claimedByName: string | null;
        claimedBySeat: number | null;
    }[];
    myCardIndex: number | null;
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
    nightAllActed: boolean;
    mafiaPicks: {
        userId: string;
        nickname: string;
        targetId: string;
        targetName: string;
    }[];
    announce: XmAnnounce | null;
    voteEndsAt: number;
    voteRevote: boolean;
    myVote: string | null;
    voteTally: Record<string, number>;
    voteResult: XmMatch['voteResult'];
    lastWordsUserId: string | null;
    lastWordsName: string | null;
    lastWordsEndsAt: number;
    log: XmLogEntry[];
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
/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export declare function effectiveCounts(m: XmMatch): {
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
/** Lobby only: the host hands the moderator role to a seated player and takes
 * that player's seat in return (a straight swap). */
export declare function transferHost(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/** Shuffle the role composition into a face-down deck. Roles aren't assigned to
 * seats yet — each player claims a card during the assign phase, and the card's
 * hidden role becomes theirs. */
export declare function dealCards(m: XmMatch): void;
export declare function startMatch(matchId: string, byUserId: string): XmMatch | null;
/** A player takes one of the face-down cards; its hidden role becomes theirs. */
export declare function pickCard(matchId: string, byUserId: string, cardIndex: number): XmMatch | null;
/** Host configures the role composition (lobby or assign). Pass null to reset to auto. */
export declare function setRoleConfig(matchId: string, byUserId: string, cfg: {
    don: number;
    mafia: number;
    sheriff: number;
} | null): XmMatch | null;
/** Host tweaks timers / floor control. Durations only editable before play starts. */
export declare function setSettings(matchId: string, byUserId: string, patch: Partial<XmMatch['settings']>): XmMatch | null;
/** Host re-deals the cards while still on the assign screen (everyone re-picks). */
export declare function reshuffleRoles(matchId: string, byUserId: string): XmMatch | null;
/** First night only: the mafia open their eyes and get to know each other. */
export declare function beginMafiaMeet(matchId: string, byUserId: string): XmMatch | null;
/** Host closes the acquaintance screen; the first night's actions begin. */
export declare function endMafiaMeet(matchId: string, byUserId: string): XmMatch | null;
export declare function beginNight(matchId: string, byUserId: string): XmMatch | null;
/** Mafia member picks the kill target for tonight. */
export declare function mafiaVote(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
export declare function donCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
export declare function sheriffCheck(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/** Host closes the night. */
export declare function endNight(matchId: string, byUserId: string): XmMatch | null;
/** Night timer fired — resolve whatever was chosen. */
export declare function advanceNightAuto(matchId: string): XmMatch | null;
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