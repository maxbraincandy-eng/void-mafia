/**
 * What a test bot does with a hand.
 *
 * WHY THIS IS A SEPARATE, PURE FILE
 * ─────────────────────────────────
 * A bot that plays badly is fine — it exists so an owner with no other players
 * can watch the table work. A bot that plays *illegally* is not fine: it would
 * throw a `RuleError` inside the hand loop and stall the table for the human
 * sitting there. So the decision is a pure function of the legal actions the
 * engine has already published, it is unit-tested against a thousand random
 * spots, and it can never invent an action that was not offered.
 *
 * These are not opponents to learn from. They call too much, they bluff never,
 * and they are labelled as test bots everywhere they appear.
 */
import type { LegalActions, Action } from '../engine/betting.js';
export interface BotSpot {
    legal: LegalActions;
    /** The bot's two cards, in server notation. */
    hole: string[];
    /** The board so far, in server notation. */
    board: string[];
    /** Chips it would have to put in to call. */
    toCall: number;
    /** What is already in the middle. */
    pot: number;
    /** The bot's stack. */
    stack: number;
    /** 0..1, deterministic per decision — injected so tests can pin it. */
    roll: number;
}
/**
 * A rough 0..1 read of how good the hand is right now.
 *
 * Pre-flop it looks at the two cards; afterwards it evaluates what it actually
 * has. Crude on purpose: the point is that the bot folds rubbish, calls with
 * something, and occasionally raises with a real hand, so a human watching the
 * table sees all four actions happen.
 */
export declare function handStrength(hole: string[], board: string[]): number;
/**
 * Pick an action.
 *
 * Every branch returns something `legal` says is available, and a raise is
 * always clamped into `[minRaiseTo, maxRaiseTo]`. That is the whole contract:
 * the table must never stall because a bot asked for something impossible.
 */
export declare function decide(spot: BotSpot): Action;
//# sourceMappingURL=botPolicy.d.ts.map