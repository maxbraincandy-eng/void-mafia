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
import { getMatch, pickCard, mafiaVote, donCheck, sheriffCheck, nominate, castVote, } from './sxvaMafiaService.js';
import { isBot } from './testBots.js';
/** Deterministic-enough choice; bots are not meant to be clever. */
function pick(list, salt) {
    if (list.length === 0)
        return null;
    return list[Math.abs(salt) % list.length] ?? null;
}
const aliveBots = (m) => m.seats.filter(s => isBot(s.userId) && s.alive && !s.left);
const isMafiaRole = (seat) => seat.role === 'mafia' || seat.role === 'don';
/**
 * Let one bot make one move.
 *
 * Returns true if anything changed, so the caller can broadcast and schedule
 * the next tick. Every move goes through the same service function a player's
 * socket would call — a bot has no private path into the game.
 */
export function tick(matchId) {
    const m = getMatch(matchId);
    if (!m || m.dissolved || m.phase === 'finished')
        return false;
    const salt = m.round * 31 + m.log.length * 7 + m.phase.length;
    // ── The deal: take a face-down card ──────────────────────────────────────
    if (m.phase === 'assign') {
        const waiting = aliveBots(m).find(s => s.cardIndex === null);
        if (!waiting)
            return false;
        const taken = new Set(m.seats.map(s => s.cardIndex).filter(i => i !== null));
        const free = m.deck.map((_, i) => i).filter(i => !taken.has(i));
        const choice = pick(free, salt + waiting.seat);
        if (choice === null)
            return false;
        return Boolean(pickCard(matchId, waiting.userId, choice));
    }
    // ── Night: mafia pick a target, don and sheriff check somebody ───────────
    if (m.phase === 'night') {
        const alive = m.seats.filter(s => s.alive && !s.left);
        for (const seat of aliveBots(m)) {
            if (isMafiaRole(seat) && !m.night.mafiaVotes[seat.userId]) {
                const targets = alive.filter(s => !isMafiaRole(s));
                const target = pick(targets, salt + seat.seat);
                if (target && mafiaVote(matchId, seat.userId, target.userId))
                    return true;
            }
            if (seat.role === 'don' && m.night.donCheck === null) {
                const target = pick(alive.filter(s => s.userId !== seat.userId), salt + seat.seat * 3);
                if (target && donCheck(matchId, seat.userId, target.userId))
                    return true;
            }
            if (seat.role === 'sheriff' && m.night.sheriffCheck === null) {
                const target = pick(alive.filter(s => s.userId !== seat.userId), salt + seat.seat * 5);
                if (target && sheriffCheck(matchId, seat.userId, target.userId))
                    return true;
            }
        }
        return false;
    }
    // ── Day: the bot holding the floor puts somebody up, sometimes ───────────
    if (m.phase === 'speech' && !m.introRound) {
        const speakerId = m.speechOrder[m.speechIdx];
        if (!speakerId || !isBot(speakerId))
            return false;
        if (m.nominatedBy[speakerId] !== undefined)
            return false;
        // Not every speech ends in a nomination, or every day would have a vote.
        if ((salt + m.speechIdx) % 3 !== 0)
            return false;
        const candidates = m.seats.filter(s => s.alive && !s.left && s.userId !== speakerId);
        const target = pick(candidates, salt + m.speechIdx);
        return Boolean(target && nominate(matchId, speakerId, target.userId));
    }
    // ── Vote ─────────────────────────────────────────────────────────────────
    if (m.phase === 'vote') {
        const waiting = aliveBots(m).find(s => !m.votes[s.userId]);
        if (!waiting || m.nominations.length === 0)
            return false;
        const choice = pick(m.nominations.filter(id => id !== waiting.userId), salt + waiting.seat);
        if (!choice)
            return false;
        return Boolean(castVote(matchId, waiting.userId, choice));
    }
    return false;
}
/** Does this match have any bots at all? Cheap enough to ask before scheduling. */
export function hasBots(matchId) {
    const m = getMatch(matchId);
    return Boolean(m && m.seats.some(s => isBot(s.userId)));
}
//# sourceMappingURL=xmBotDriver.js.map