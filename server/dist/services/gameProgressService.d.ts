/**
 * Game completion → XP and daily-quest progress, for games that had neither.
 *
 * Mafia, checkers, ludo and joker keep their own reward code; nothing here
 * touches them. This covers the party games that ended with nothing: a
 * finished round of UNO or Codenames gave no XP and did not count toward
 * "play 3 games today", which says games, not Mafia games.
 *
 * TWO HALVES
 *
 * `observe` is pure and synchronous. Each game module calls it from its
 * `broadcastState`, the one place every state change already passes through,
 * so no game's rules were edited to add a reward. It notices the moment a
 * match reaches a natural end and turns it into one completion event per
 * eligible player.
 *
 * `recordCompletion` is the only writer. One transaction claims the
 * completion, pays the XP, writes the ledger and advances the quest; a replay
 * of the same event conflicts on the claim and changes nothing.
 *
 * WHY THE SESSION ID IS NOT THE MATCH ID
 *
 * Every rematch in these games reuses the match id. Keyed on that, a second
 * game at the same table would have been refused as a duplicate of the first.
 * The tracker counts games per match (`gen`) and the session id carries it,
 * plus a per-process boot id: matches live in memory and die with the process,
 * so a match id can never span two boots.
 */
import type { UnoMatch } from './unoService.js';
import type { AliasMatch } from './aliasService.js';
import type { BlackoutMatch } from './blackoutService.js';
import type { CnMatch } from './codenamesService.js';
import type { DrawMatch } from './drawService.js';
import type { LiesMatch } from './liesService.js';
import type { SpyfallMatch } from './spyfallService.js';
import type { WhoSaidMatch } from './whoSaidService.js';
export type GameId = 'uno' | 'alias' | 'blackout' | 'codenames' | 'draw' | 'lies' | 'spyfall' | 'whosaid';
export interface GameCompletion {
    /** One game, not one room: `${boot}:${game}:${matchId}:${gen}`. */
    sessionId: string;
    game: GameId;
    /** The player's profile id. A guest's is a socket id and has no account. */
    userId: string;
    outcome: 'win' | 'played';
    completedAt: number;
}
export interface CompletionResult {
    granted: boolean;
    /** Why nothing was granted, when it was not. */
    reason?: 'no_account' | 'duplicate' | 'invalid' | 'error';
    xp: number;
    questBonus: number;
}
/**
 * XP per finished game. The same shape as checkers (20 a win, 5 otherwise) and
 * inside the range ludo (25/8) and joker (30/5) already pay. New amounts:
 * approve or change them here, in one place.
 */
export declare const XP_RULES: {
    readonly win: 20;
    readonly played: 5;
};
/** A game shorter than this is not counted — it keeps instant farms out. */
export declare const MIN_GAME_MS = 60000;
/** Nobody gets credit for a table that ended with fewer people than this. */
export declare const MIN_PRESENT = 2;
interface Seat {
    userId: string;
    won: boolean;
    present: boolean;
}
interface Adapter<M> {
    game: GameId;
    /** A game is under way — not the lobby, not over. */
    playing: (m: M) => boolean;
    /** Over, AND over because it was played out: a winner exists. */
    completed: (m: M) => boolean;
    /** Seated players only. Spectators live elsewhere on every match type. */
    seats: (m: M) => Seat[];
}
export declare const ADAPTERS: {
    readonly uno: {
        game: "uno";
        playing: (m: UnoMatch) => boolean;
        completed: (m: UnoMatch) => boolean;
        seats: (m: UnoMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly alias: {
        game: "alias";
        playing: (m: AliasMatch) => boolean;
        completed: (m: AliasMatch) => boolean;
        seats: (m: AliasMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly blackout: {
        game: "blackout";
        playing: (m: BlackoutMatch) => boolean;
        completed: (m: BlackoutMatch) => boolean;
        seats: (m: BlackoutMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly codenames: {
        game: "codenames";
        playing: (m: CnMatch) => boolean;
        completed: (m: CnMatch) => boolean;
        seats: (m: CnMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly draw: {
        game: "draw";
        playing: (m: DrawMatch) => boolean;
        completed: (m: DrawMatch) => boolean;
        seats: (m: DrawMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly lies: {
        game: "lies";
        playing: (m: LiesMatch) => boolean;
        completed: (m: LiesMatch) => boolean;
        seats: (m: LiesMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly spyfall: {
        game: "spyfall";
        playing: (m: SpyfallMatch) => boolean;
        completed: (m: SpyfallMatch) => boolean;
        seats: (m: SpyfallMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
    readonly whosaid: {
        game: "whosaid";
        playing: (m: WhoSaidMatch) => boolean;
        completed: (m: WhoSaidMatch) => boolean;
        seats: (m: WhoSaidMatch) => {
            userId: string;
            won: boolean;
            present: boolean;
        }[];
    };
};
/**
 * Look at a match; if it has just been played to the end, return one event
 * per player who earned it. Returns [] on every other call, including every
 * repeat broadcast of the same finished state.
 */
export declare function observe<M extends {
    id: string;
    status: string;
}>(a: Adapter<M>, m: M, now?: number): GameCompletion[];
/** `observe`, then record each event. For `broadcastState`: never throws, never waits. */
export declare function trackCompletion<M extends {
    id: string;
    status: string;
}>(a: Adapter<M>, m: M): void;
/** For tests: forget every match. */
export declare function __resetTracking(): void;
/**
 * Pay one completion: XP, its ledger row, and a step of the volume quest.
 *
 * All or nothing, in one transaction. The player's row is locked first, which
 * does two jobs: two different games finishing together for one player take
 * turns instead of both writing the same quest step, and the level is computed
 * from a total nobody else is changing.
 *
 * The claim in `legacy_xp_grants` is the idempotency key. It is the table the
 * ledger already uses for "at most once ever", so no schema change was needed.
 */
export declare function recordCompletion(ev: GameCompletion): Promise<CompletionResult>;
export {};
//# sourceMappingURL=gameProgressService.d.ts.map