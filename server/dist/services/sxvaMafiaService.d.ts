/**
 * The roles.
 *
 * The three optional ones are their own factions or their own problem:
 *  • doctor — town, saves one person a night from whatever came for them
 *  • maniac — nobody's friend, kills one person a night, wins alone
 *  • cult   — converts a player a night; wins when the table is all cult
 */
export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen' | 'doctor' | 'maniac' | 'cult';
export type XmPhase = 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech' | 'vote' | 'last_words' | 'finished';
export type XmWinner = 'town' | 'mafia' | 'maniac' | 'cult' | null;
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
    /**
     * In the cult — the leader, or somebody they converted.
     *
     * Kept apart from `role` because a convert keeps the card they were dealt: a
     * converted doctor still heals, they just win with the cult now. Mafia and the
     * maniac cannot be converted, so this never overlaps those factions.
     */
    cult: boolean;
    /**
     * They left, or the host removed them.
     *
     * Distinct from `connected: false`, which means a socket dropped and may come
     * back. `left` means stop sending them state — a broadcast that keeps
     * reaching someone who has walked away is how a dissolved room reopens on
     * their screen after they have closed it.
     */
    left: boolean;
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
    /** The doctor's patient tonight. Immune to every kill that lands. */
    doctorHeal: string | null;
    /** The maniac's target tonight. */
    maniacKill: string | null;
    /** Who the cult leader tried to convert, and whether it took. */
    cultConvert: string | null;
    cultResult: 'converted' | 'immune' | null;
}
export interface XmAnnounce {
    round: number;
    /**
     * Everyone who died in the night.
     *
     * A list, not one name: with a maniac at the table two people can die in the
     * same night, and an announcement that can only carry one of them is an
     * announcement that lies.
     */
    killed: {
        userId: string;
        nickname: string;
        seat: number;
    }[];
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
        doctor: number;
        maniac: number;
        cult: number;
    } | null;
    deck: XmRole[];
    log: XmLogEntry[];
    round: number;
    introRound: boolean;
    speechOrder: string[];
    speechIdx: number;
    speechEndsAt: number;
    nominations: string[];
    nominatedBy: Record<string, string>;
    night: XmNightState;
    nightEndsAt: number;
    announce: XmAnnounce | null;
    votes: Record<string, string>;
    /**
     * Which nominee is on the floor.
     *
     * The vote is sequential, the way a moderator runs it out loud: one candidate
     * at a time, hands up, count, next. A simultaneous secret ballot is a
     * different game — half of table mafia is watching who raises their hand and
     * when.
     */
    voteIdx: number;
    voteEndsAt: number;
    voteRevote: boolean;
    voteResult: {
        eliminatedUserId: string | null;
        tally: Record<string, number>;
    } | null;
    lastWordsUserId: string | null;
    lastWordsEndsAt: number;
    /** Farewells still owed — two can die in one night. */
    lastWordsQueue: string[];
    /** The doctor's previous patient: they may not heal the same person twice running. */
    lastHeal: string | null;
    floorGrab: {
        userId: string;
        until: number;
    } | null;
    winner: XmWinner;
    reveal: {
        userId: string;
        nickname: string;
        seat: number;
        role: XmRole;
    }[] | null;
    dissolved: boolean;
    /** The host walked away too — stop broadcasting to them. */
    hostLeft: boolean;
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
    /** In the cult — visible only to the cult, and to everyone at the reveal. */
    cult: boolean;
    /**
     * They have raised their hand in this vote.
     *
     * Public on purpose. A vote in table mafia happens with hands in the air —
     * seeing who votes, and how quickly, is most of the information in the game.
     */
    hasVoted: boolean;
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
    /** Am I in the cult (leader or converted)? */
    myCult: boolean;
    /** The doctor may not repeat a patient; this is who is off limits tonight. */
    healBlockedId: string | null;
    mateIds: string[];
    cards: {
        index: number;
        claimedById: string | null;
        claimedByName: string | null;
        claimedBySeat: number | null;
    }[];
    myCardIndex: number | null;
    introRound: boolean;
    speakingUserId: string | null;
    speechEndsAt: number;
    speechIdx: number;
    speechTotal: number;
    nextSpeaker: {
        nickname: string;
        seat: number;
    } | null;
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
    /** The nominee on the floor right now, and where they sit in the list. */
    voteCandidate: {
        userId: string;
        nickname: string;
        seat: number;
    } | null;
    voteIdx: number;
    voteTotal: number;
    /** True on the last candidate: everyone silent is counted for them. */
    voteIsLast: boolean;
    myVote: string | null;
    voteTally: Record<string, number>;
    voteResult: XmMatch['voteResult'];
    lastWordsUserId: string | null;
    lastWordsName: string | null;
    lastWordsEndsAt: number;
    floorGrabUserId: string | null;
    floorGrabUntil: number;
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
export interface XmRoleCounts {
    don: number;
    mafia: number;
    sheriff: number;
    doctor: number;
    maniac: number;
    cult: number;
    citizen: number;
}
/**
 * Role split for a given number of seated players (host excluded).
 *
 * The optional roles are off by default. They change the game a great deal —
 * a maniac makes the mafia's parity meaningless, a cult can take the table from
 * under everybody — so they are something a host turns on, not something that
 * appears because enough people sat down.
 */
export declare function roleCounts(n: number): XmRoleCounts;
/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export declare function effectiveCounts(m: XmMatch): XmRoleCounts;
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
/**
 * Seat a test bot.
 *
 * Separate from `joinMatch` because a bot has no socket: there is no id to
 * store, nothing to reconnect, and nothing to broadcast to. Lobby only — a bot
 * cannot walk into a game that has already dealt, for the same reason a person
 * cannot.
 */
export declare function joinMatchAsBot(matchId: string, botId: string, nickname: string): XmMatch | null;
export declare function leaveMatch(matchId: string, userId: string): XmMatch | null;
/**
 * Who is still in the room and should be sent state.
 *
 * The host counts unless they have left — and when they dissolve the room they
 * have left. Without that, the person who just closed the room receives the
 * closed room back, which reopens it on their screen; pressing "leave" then
 * dissolves it again, and they are in a loop they cannot get out of.
 */
export declare function recipients(m: XmMatch): {
    userId: string;
    socketId: string;
}[];
/**
 * The host removes a player.
 *
 * In the lobby the seat simply goes. In a live game the player is eliminated
 * and recorded as fouled out, because that is what a removal mid-game IS in
 * hosted mafia — the moderator is not deleting a person, they are ruling them
 * out of the round, and the protocol should say so.
 */
export declare function kickPlayer(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/**
 * Reconnect.
 *
 * State is broadcast to stored socket ids, and a phone that locks its screen or
 * changes network comes back with a NEW one — so the old handle is dead and the
 * player's table simply stops updating. Nothing errors; they just freeze while
 * everyone else plays on. Asking on reconnect is what un-freezes them.
 *
 * Someone the host removed does not come back this way: `left` with a fouls
 * ruling is a decision, not a dropped connection.
 */
export declare function resumeForUser(userId: string, socketId: string): XmMatch | null;
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
    doctor?: number;
    maniac?: number;
    cult?: number;
} | null): XmMatch | null;
/** Host tweaks timers / floor control. Durations only editable before play starts. */
export declare function setSettings(matchId: string, byUserId: string, patch: Partial<XmMatch['settings']>): XmMatch | null;
/** Host re-deals the cards while still on the assign screen (everyone re-picks). */
export declare function reshuffleRoles(matchId: string, byUserId: string): XmMatch | null;
/**
 * The doctor picks tonight's patient.
 *
 * Not the same person two nights running — otherwise one player is simply
 * immortal and the mafia has nothing to aim at. Healing yourself is allowed;
 * healing yourself every night is not, by the same rule.
 */
export declare function doctorHeal(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/** The maniac picks tonight's target. Nobody's friend, so anyone but themselves. */
export declare function maniacKill(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/**
 * The cult leader tries to convert somebody.
 *
 * Whether it takes is decided at resolution, not here: the leader finds out
 * with everyone else's night, which is what makes trying it on a quiet player
 * a real gamble rather than a free probe.
 */
export declare function cultConvert(matchId: string, byUserId: string, targetUserId: string): XmMatch | null;
/** First night only: the mafia open their eyes and get to know each other. */
export declare function beginMafiaMeet(matchId: string, byUserId: string): XmMatch | null;
/** Host closes the acquaintance screen; the day-0 introduction circle begins —
 * everyone speaks in turn, no nominations, then the first night falls. */
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
/**
 * Vote for whoever is currently on the floor.
 *
 * One vote each, and it cannot be moved: a hand raised in a real game cannot be
 * un-raised once the moderator has counted it. `nomineeUserId` is still checked
 * against the candidate actually up, so a client cannot vote ahead for someone
 * whose turn has not come.
 */
export declare function castVote(matchId: string, byUserId: string, nomineeUserId: string): XmMatch | null;
/** The candidate on the floor right now, if the vote is running. */
export declare function currentCandidate(m: XmMatch): string | null;
/**
 * Move to the next candidate — or close the vote.
 *
 * Past the last candidate, everyone who has not voted is counted for that last
 * one. That is the standing rule in table mafia: if you sat on your hands all
 * the way down the list, your vote goes to the last name on it. Without it, a
 * player can abstain their way out of every elimination.
 */
export declare function nextCandidate(matchId: string, byUserId: string): XmMatch | null;
/** Host closes the vote early (timer or manual). */
export declare function endVote(matchId: string, byUserId: string | null): XmMatch | null;
export declare function giveFoul(matchId: string, byUserId: string, targetUserId: string, delta: number): XmMatch | null;
export declare const FLOOR_GRAB_MS = 6000;
export declare function grabFloor(matchId: string, byUserId: string): XmMatch | null;
/** Host (or timer) ends the farewell speech; flow returns to the day/night loop. */
export declare function endLastWords(matchId: string, byUserId: string | null): XmMatch | null;
export declare function rematch(matchId: string, byUserId: string): XmMatch | null;
export declare function getSafeState(m: XmMatch, viewerUserId: string): XmSafeState;
//# sourceMappingURL=sxvaMafiaService.d.ts.map