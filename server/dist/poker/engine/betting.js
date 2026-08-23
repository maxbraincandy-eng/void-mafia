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
export function legalActions(ctx, seat) {
    const toCall = Math.max(0, ctx.betToMatch - seat.committedThisStreet);
    const maxTo = seat.committedThisStreet + seat.stack;
    const canAct = !seat.folded && !seat.allIn && seat.stack > 0;
    /*
     * A raise needs enough chips to get past the current bet at all; if the most
     * they can reach is the bet itself, calling is all they have.
     *
     * And it needs the action to be OPEN to them. `actedThisRound` is cleared for
     * everyone behind whenever a full raise lands, and left alone by a short
     * all-in — so a player who has already called and is now facing nothing but
     * that short all-in may call the extra or fold, but may not re-raise. This is
     * the rule that stops a table using a desperate short stack as a lever to
     * re-open betting against someone who is already committed.
     */
    const canRaise = canAct && maxTo > ctx.betToMatch && !seat.actedThisRound;
    return {
        seat: seat.seat,
        canFold: canAct,
        canCheck: canAct && toCall === 0,
        canCall: canAct && toCall > 0,
        callAmount: Math.min(toCall, seat.stack),
        canRaise,
        // The minimum is the standard min-raise, unless the player cannot reach it,
        // in which case their only raise is all-in for less.
        minRaiseTo: canRaise ? Math.min(Math.max(ctx.minRaiseTo, ctx.betToMatch + 1), maxTo) : 0,
        maxRaiseTo: canRaise ? maxTo : 0,
        canAllIn: canAct,
        allInTo: maxTo,
    };
}
/**
 * Is this action legal right now? Returns null when it is.
 *
 * Separated from applying it so the socket layer can reject and log a bad
 * action without any chance of half-applying it.
 */
export function validateAction(ctx, seat, action) {
    const legal = legalActions(ctx, seat);
    if (seat.folded)
        return { code: 'FOLDED', message: 'You have folded this hand.' };
    if (seat.allIn)
        return { code: 'ALL_IN', message: 'You are already all-in.' };
    switch (action.type) {
        case 'fold':
            return legal.canFold ? null : { code: 'CANNOT_FOLD', message: 'Cannot fold now.' };
        case 'check':
            return legal.canCheck ? null : { code: 'CANNOT_CHECK', message: 'There is a bet to call.' };
        case 'call':
            return legal.canCall ? null : { code: 'CANNOT_CALL', message: 'There is nothing to call.' };
        case 'allIn':
            return legal.canAllIn ? null : { code: 'CANNOT_ALL_IN', message: 'Cannot go all-in now.' };
        case 'raise': {
            if (!legal.canRaise)
                return { code: 'CANNOT_RAISE', message: 'Cannot raise now.' };
            const to = Math.floor(action.amount ?? 0);
            if (!Number.isFinite(to))
                return { code: 'BAD_AMOUNT', message: 'Raise amount is not a number.' };
            if (to > legal.maxRaiseTo)
                return { code: 'RAISE_TOO_BIG', message: 'You do not have that many chips.' };
            if (to < legal.minRaiseTo)
                return { code: 'RAISE_TOO_SMALL', message: `Minimum raise is ${legal.minRaiseTo}.` };
            return null;
        }
        default:
            return { code: 'UNKNOWN_ACTION', message: 'Unknown action.' };
    }
}
/**
 * Has the street finished?
 *
 * Everyone still in has either folded, is all-in, or has acted since the last
 * aggression AND matched the bet. The "acted" half is what gives the big blind
 * their option pre-flop when everybody merely calls.
 */
export function isBettingRoundComplete(ctx) {
    const live = ctx.seats.filter(s => !s.folded);
    if (live.length <= 1)
        return true;
    const canStillAct = live.filter(s => !s.allIn && s.stack > 0);
    if (canStillAct.length === 0)
        return true;
    // One player left with chips and everyone else all-in: nothing left to decide
    // once they have matched the bet.
    return canStillAct.every(s => s.actedThisRound && s.committedThisStreet === ctx.betToMatch);
}
//# sourceMappingURL=betting.js.map