/**
 * Test bots.
 *
 * WHAT THEY ARE FOR
 * ─────────────────
 * Filling a table when there is nobody to fill it with. A new game cannot be
 * tested by one person, and "get five friends online at the same time" is not a
 * test plan. An owner can seat bots, watch the whole thing run, and see the
 * timers, the phases and the broadcasts behave.
 *
 * WHAT THEY ARE NOT
 * ─────────────────
 * Not opponents, not filler for real lobbies, and not a growth trick. Only an
 * owner can add them, they say what they are on screen, and nothing they do
 * counts: their results never reach statistics or a leaderboard.
 *
 * THE ID RULE
 * ───────────
 * Every bot id starts with `bot_`. That prefix is the single check used
 * everywhere — to label them, to keep them out of statistics, and to make sure
 * one can never be mistaken for a person's profile id, which is a UUID.
 */
export declare const BOT_PREFIX = "bot_";
/** Is this id a test bot rather than a person? */
export declare function isBot(playerId: string | null | undefined): boolean;
export declare function newBotId(): string;
/** A readable name, distinct from the others already at the table. */
export declare function botName(taken: string[]): string;
/**
 * Owner-only.
 *
 * Checked against the profile on the socket, never against anything a client
 * sent. Adding bots is a testing capability, and a testing capability that any
 * player can reach is a way to stuff other people's rooms.
 */
export declare function isOwner(profileId: string | null | undefined): Promise<boolean>;
//# sourceMappingURL=testBots.d.ts.map