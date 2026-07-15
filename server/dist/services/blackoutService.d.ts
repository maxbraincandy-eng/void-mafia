export type BlackoutStatus = 'waiting' | 'play' | 'meeting' | 'finished';
export type BlackoutRole = 'killer' | 'crew';
export type BlackoutSpecialty = 'security' | 'hacker' | null;
export type BlackoutWinner = 'killers' | 'crew' | null;
export declare const WORLD_W = 1600;
export declare const WORLD_H = 1200;
export declare const LIGHTS_ON_MS = 30000;
export declare const LIGHTS_OFF_MS = 15000;
export declare const MEETING_MS = 60000;
export declare const KILL_DIST = 84;
export declare const REPORT_DIST = 130;
export declare const KILL_COOLDOWN_MS = 20000;
export declare const SABOTAGE_COOLDOWN_MS = 35000;
export declare const DOOR_LOCK_MS = 8000;
export declare const HACK_COOLDOWN_MS = 30000;
export declare const DOOR_HACK_DIST = 170;
export declare const EMERGENCY_DIST = 130;
export declare const DOORS: {
    id: string;
    x: number;
    y: number;
}[];
export interface BlackoutPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    alive: boolean;
    role: BlackoutRole;
    specialty: BlackoutSpecialty;
    x: number;
    y: number;
}
export interface BlackoutCorpse {
    userId: string;
    nickname: string;
    seat: number;
    x: number;
    y: number;
}
export interface BlackoutChatMsg {
    id: string;
    userId: string;
    nickname: string;
    text: string;
    ts: number;
}
export interface BlackoutMeeting {
    reporterId: string;
    reporterName: string;
    /** null when the meeting came from the emergency button, not a body. */
    bodyName: string | null;
    endsAt: number;
    /** voterId → targetUserId | 'skip' */
    votes: Record<string, string>;
}
export interface BlackoutEject {
    userId: string | null;
    nickname: string | null;
    role: BlackoutRole | null;
    tie: boolean;
}
export interface BlackoutMatch {
    id: string;
    code: string;
    status: BlackoutStatus;
    hostId: string;
    maxPlayers: number;
    players: BlackoutPlayer[];
    lightsOn: boolean;
    lightsChangeAt: number;
    corpses: BlackoutCorpse[];
    meeting: BlackoutMeeting | null;
    lastEject: BlackoutEject | null;
    killCooldownUntil: Record<string, number>;
    /** Killer-team sabotage (force blackout) cooldown. */
    sabotageCooldownUntil: number;
    /** doorId → lockedUntil epoch ms. */
    doors: Record<string, number>;
    /** Hacker per-player door-lock cooldown. */
    hackCooldownUntil: Record<string, number>;
    /** userIds that already used their one emergency call. */
    emergencyUsed: string[];
    winner: BlackoutWinner;
    chat: BlackoutChatMsg[];
    round: number;
    createdAt: number;
}
export interface BlackoutPublicPlayer {
    userId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    alive: boolean;
    x: number;
    y: number;
}
export interface BlackoutPublicState {
    id: string;
    code: string;
    status: BlackoutStatus;
    hostId: string;
    maxPlayers: number;
    players: BlackoutPublicPlayer[];
    lightsOn: boolean;
    lightsChangeAt: number;
    corpses: BlackoutCorpse[];
    meeting: {
        reporterName: string;
        bodyName: string | null;
        endsAt: number;
        votedIds: string[];
    } | null;
    lastEject: BlackoutEject | null;
    winner: BlackoutWinner;
    /** Killer teammates — only sent to killer viewers; revealed to all on finish. */
    killers: string[] | null;
    myRole: BlackoutRole | null;
    mySpecialty: BlackoutSpecialty;
    myUserId: string;
    myKillCooldownUntil: number;
    sabotageCooldownUntil: number;
    doors: Record<string, number>;
    myHackCooldownUntil: number;
    myEmergencyUsed: boolean;
    chat: BlackoutChatMsg[];
    round: number;
}
export interface BlackoutListItem {
    id: string;
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: BlackoutStatus;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
}): BlackoutMatch;
export declare function getMatch(id: string): BlackoutMatch | null;
export declare function getMatchByCode(code: string): BlackoutMatch | null;
export declare function getMatchForSocket(socketId: string): BlackoutMatch | null;
export declare function listMatches(): BlackoutListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: BlackoutMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): BlackoutMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function startMatch(matchId: string, byUserId: string): BlackoutMatch | null;
/** Killer team forces the lights out early. Timer must be rescheduled by caller. */
export declare function sabotage(matchId: string, userId: string): {
    match: BlackoutMatch;
} | {
    error: string;
};
/** Emergency button in the corridor — one call per player per game, lights on only. */
export declare function emergency(matchId: string, userId: string): {
    match: BlackoutMatch;
} | {
    error: string;
};
/** Hacker seals a doorway for a few seconds (escape tool). */
export declare function hackDoor(matchId: string, userId: string, doorId: string): {
    match: BlackoutMatch;
} | {
    error: string;
};
/** Called by the lights timer. Flips lights and schedules the next flip time. */
export declare function toggleLights(matchId: string): BlackoutMatch | null;
export declare function move(socketId: string, x: number, y: number): {
    matchId: string;
    userId: string;
    x: number;
    y: number;
} | null;
export declare function kill(matchId: string, killerId: string, targetId: string): {
    match: BlackoutMatch;
} | {
    error: string;
};
export declare function report(matchId: string, reporterId: string): {
    match: BlackoutMatch;
} | {
    error: string;
};
export declare function vote(matchId: string, voterId: string, targetId: string): {
    match: BlackoutMatch;
    allVoted: boolean;
} | {
    error: string;
};
/** Tally votes, eject, reset the round. Returns the match (possibly finished). */
export declare function endMeeting(matchId: string): BlackoutMatch | null;
export declare function rematch(matchId: string, byUserId: string): BlackoutMatch | null;
export declare function sendChat(matchId: string, userId: string, nickname: string, text: string): {
    match: BlackoutMatch;
    msg: BlackoutChatMsg;
} | null;
export declare function getSafeState(m: BlackoutMatch, viewerUserId: string): BlackoutPublicState;
//# sourceMappingURL=blackoutService.d.ts.map