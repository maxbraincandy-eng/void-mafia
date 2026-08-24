/**
 * Test bots for მაფია ჰოსტით.
 *
 * WHAT THEY DO
 * ────────────
 * Everything a seated player must do for the game to move: take a card at the
 * deal, act at night if their role has a night action, and vote when a vote is
 * running. They do not speak — the speeches are the host's to pace, and a bot
 * has nothing to say.
 *
 * WHAT THEY ARE FOR
 * ─────────────────
 * A moderator alone cannot test a game that needs four players. With bots, an
 * owner can run the whole loop — deal, night, day, nominations, vote, last
 * words, win — and see the timers and broadcasts behave.
 *
 * HOW THEY ARE PACED
 * ──────────────────
 * One action per tick, not a burst. A night that resolves between two frames
 * tells you nothing about whether the night works; watching one player act at
 * a time does. `tick` returns whether it did something, so the caller knows
 * whether to broadcast and come back.
 */
/**
 * Let one bot make one move.
 *
 * Returns true if anything changed, so the caller can broadcast and schedule
 * the next tick. Every move goes through the same service function a player's
 * socket would call — a bot has no private path into the game.
 */
export declare function tick(matchId: string): boolean;
/** Does this match have any bots at all? Cheap enough to ask before scheduling. */
export declare function hasBots(matchId: string): boolean;
//# sourceMappingURL=xmBotDriver.d.ts.map