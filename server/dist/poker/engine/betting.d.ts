/**
 * What a player is allowed to do, and what it costs.
 *
 * Every one of these rules is enforced on the server and nowhere else. The
 * client is told the same numbers so it can draw buttons, but the client's
 * opinion is never consulted: `applyAction` recomputes all of this from the
 * hand state before it touches a chip.
 *
 * THE TWO RULES PEOPLE GET WRONG
 * ──────────────────────────────
 * 1. A raise must be at least as big as the last raise. Opening bet aside, if
 *    the bet went 100 → 300 (a raise of 200), the next raise must reach 500.
 * 2. An all-in that is SHORT of a full raise does not re-open the betting.
 *    Someone who has already called 300 cannot re-raise because a short stack
 *    dribbled it to 380; they may only call the extra 80 or fold. This is the
 *    rule that separates a real engine from a toy, and it is why `minRaiseTo`
 *    and "who has acted" are tracked separately from "who has matched".
 */
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn';
export interface Action {
    type: ActionType;
    /** For `raise`: the TOTAL this street after the raise, not the increment. */
    amount?: number;
}
export interface BettingSeat {
    playerId: string;
    seat: number;
    stack: number;
    committedThisStreet: number;
    folded: boolean;
    allIn: boolean;
    /** Has acted since the last aggressive action on this street. */
    actedThisRound: boolean;
}
export interface BettingContext {
    seats: BettingSeat[];
    /** Highest amount committed this street by anyone. */
    betToMatch: number;
    /** The smallest legal total a raise may go to. */
    minRaiseTo: number;
}
export interface LegalActions {
    seat: number;
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    /** Chips to ADD to call. Capped at the stack, i.e. a call may be an all-in. */
    callAmount: number;
    canRaise: boolean;
    /** Legal raise range as TOTAL this street. */
    minRaiseTo: number;
    maxRaiseTo: number;
    canAllIn: boolean;
    allInTo: number;
}
export declare function legalActions(ctx: BettingContext, seat: BettingSeat): LegalActions;
export interface ValidationError {
    code: string;
    message: string;
}
/**
 * Is this action legal right now? Returns null when it is.
 *
 * Separated from applying it so the socket layer can reject and log a bad
 * action without any chance of half-applying it.
 */
export declare function validateAction(ctx: BettingContext, seat: BettingSeat, action: Action): ValidationError | null;
/**
 * Has the street finished?
 *
 * Everyone still in has either folded, is all-in, or has acted since the last
 * aggression AND matched the bet. The "acted" half is what gives the big blind
 * their option pre-flop when everybody merely calls.
 */
export declare function isBettingRoundComplete(ctx: BettingContext): boolean;
//# sourceMappingURL=betting.d.ts.map