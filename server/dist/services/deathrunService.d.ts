export type DrStatus = 'waiting' | 'countdown' | 'running' | 'duel' | 'over';
export type DrRole = 'runner' | 'death';
export declare const COUNTDOWN_MS = 5000;
export declare const ROUND_MS = 240000;
export declare const DUEL_MS = 60000;
export declare const OVER_MS = 8000;
export declare const DUEL_HP = 3;
export declare const SWING_COOLDOWN_MS = 650;
export declare const SWING_RANGE = 2.6;
export declare const SWING_ARC = 1.15;
export interface DrPlayer {
    userId: string;
    socketId: string;
    nickname: string;
    seat: number;
    connected: boolean;
    role: DrRole;
    alive: boolean;
    finished: boolean;
    hp: number;
    /** best time in ms to finish the course, all-time in this room */
    best: number | null;
    wins: number;
    escapes: number;
    kills: number;
    /** how many rounds since this player was last the Death (rotation fairness) */
    sinceDeath: number;
    x: number;
    y: number;
    z: number;
    ry: number;
}
export interface DrMatch {
    id: string;
    code: string;
    status: DrStatus;
    hostId: string;
    maxPlayers: number;
    map: string;
    players: DrPlayer[];
    round: number;
    /** epoch ms the current phase ends (0 = no deadline) */
    phaseEndsAt: number;
    startedAt: number;
    /** trapId → epoch ms it may next be fired */
    trapCooldown: Record<string, number>;
    /** trapId → epoch ms it last fired (clients replay from here) */
    trapFired: Record<string, number>;
    duellists: string[];
    lastWinner: string | null;
    log: {
        id: string;
        text: string;
        at: number;
    }[];
    createdAt: number;
}
export interface DrListItem {
    id: string;
    code: string;
    status: DrStatus;
    players: number;
    maxPlayers: number;
    host: string;
    map: string;
}
export declare function createMatch(hostId: string, socketId: string, nickname: string, opts: {
    maxPlayers?: number;
    map?: string;
}): DrMatch;
export declare function getMatch(id: string): DrMatch | null;
export declare function getMatchByCode(code: string): DrMatch | null;
export declare function matchOfPlayer(userId: string): DrMatch | null;
export declare function listMatches(): DrListItem[];
export declare function joinMatch(matchId: string, userId: string, socketId: string, nickname: string): {
    match: DrMatch;
    isNew: boolean;
} | null;
export declare function leaveMatch(matchId: string, userId: string): DrMatch | null;
export declare function disconnectSocket(socketId: string): string | null;
export declare function startRound(m: DrMatch): boolean;
/** countdown → running. Called by the timer in the socket layer. */
export declare function beginRun(m: DrMatch): void;
export declare function fireTrap(m: DrMatch, userId: string, trapId: string, cooldownMs: number): {
    ok: true;
    at: number;
} | {
    ok: false;
    error: string;
};
/** A runner reports their own death (trap contact or a fall). */
export declare function reportDeath(m: DrMatch, userId: string, cause: string): void;
/** A runner reaches the gate. Returns their course time in ms. */
export declare function reportFinish(m: DrMatch, userId: string): number | null;
/** True when nobody is left running — everyone is dead or through the gate. */
export declare function runOver(m: DrMatch): boolean;
/** running → duel (or straight to the scoreboard if nobody made it). */
export declare function toDuel(m: DrMatch): boolean;
/**
 * A sword hit. The attacker's client does the range/arc test and names its
 * victim; we re-check membership and liveness so a stale client can't kill
 * someone who already left the duel.
 */
export declare function swordHit(m: DrMatch, attackerId: string, victimId: string): {
    dead: boolean;
    victim: DrPlayer;
} | null;
/** Has the duel resolved? */
export declare function duelResult(m: DrMatch): 'death' | 'runners' | null;
export declare function endRound(m: DrMatch, winner: 'death' | 'runners', why: string): void;
/** over → waiting, ready for the host (or the auto-timer) to start again. */
export declare function resetToLobby(m: DrMatch): void;
export declare function move(m: DrMatch, userId: string, x: number, y: number, z: number, ry: number): void;
export declare function getState(m: DrMatch): {
    id: string;
    code: string;
    status: DrStatus;
    hostId: string;
    map: string;
    round: number;
    phaseEndsAt: number;
    startedAt: number;
    trapFired: Record<string, number>;
    trapCooldown: Record<string, number>;
    duellists: string[];
    lastWinner: string | null;
    maxPlayers: number;
    log: {
        id: string;
        text: string;
        at: number;
    }[];
    players: {
        userId: string;
        nickname: string;
        seat: number;
        connected: boolean;
        role: DrRole;
        alive: boolean;
        finished: boolean;
        hp: number;
        best: number | null;
        wins: number;
        escapes: number;
        kills: number;
    }[];
};
export type DrState = ReturnType<typeof getState>;
//# sourceMappingURL=deathrunService.d.ts.map