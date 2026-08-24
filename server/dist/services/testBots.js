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
import { getPlayer } from './playerService.js';
export const BOT_PREFIX = 'bot_';
/** Is this id a test bot rather than a person? */
export function isBot(playerId) {
    return typeof playerId === 'string' && playerId.startsWith(BOT_PREFIX);
}
let counter = 0;
export function newBotId() {
    counter = (counter + 1) % 100000;
    return `${BOT_PREFIX}${Date.now().toString(36)}_${counter.toString(36)}`;
}
const NAMES = [
    'ბოტი ანა', 'ბოტი ბექა', 'ბოტი გია', 'ბოტი დათო', 'ბოტი ელენე', 'ბოტი ვანო',
    'ბოტი ზურა', 'ბოტი თეა', 'ბოტი ირმა', 'ბოტი კახა', 'ბოტი ლანა', 'ბოტი მაკა',
];
/** A readable name, distinct from the others already at the table. */
export function botName(taken) {
    const free = NAMES.find(n => !taken.includes(n));
    return free ?? `ბოტი ${taken.length + 1}`;
}
/**
 * Owner-only.
 *
 * Checked against the profile on the socket, never against anything a client
 * sent. Adding bots is a testing capability, and a testing capability that any
 * player can reach is a way to stuff other people's rooms.
 */
export async function isOwner(profileId) {
    if (!profileId || isBot(profileId))
        return false;
    try {
        const player = await getPlayer(profileId);
        return player?.moderatorLevel === 'owner';
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=testBots.js.map