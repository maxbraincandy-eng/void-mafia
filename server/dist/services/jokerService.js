import { generateId } from '../utils/helpers.js';
// ─── In-memory store ─────────────────────────────────────────────────────────
const matchStore = new Map();
// ─── Utility helpers ─────────────────────────────────────────────────────────
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function generateMatchCode() {
    const digits = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
    return `JK-${digits}`;
}
function uniqueMatchCode() {
    let code;
    let attempts = 0;
    do {
        code = generateMatchCode();
        attempts++;
        if (attempts > 10000)
            throw new Error('Could not generate unique match code');
    } while ([...matchStore.values()].some(m => m.code === code));
    return code;
}
// ─── Utility exports ─────────────────────────────────────────────────────────
/**
 * Build and shuffle a 36-card deck (ranks 6–A per suit).
 */
export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    return shuffle(deck);
}
/**
 * Return the round plan (card-count array) for the given mode.
 * Classic:    [9,9,9,9, 9,8,7,6,5,4,3,2,1, 1,2,3,4,5,6,7,8,9, 9,9,9,9]
 * Nines-only: [9,9,9,9]
 */
export function getJokerRoundPlan(mode) {
    if (mode === 'nines_only') {
        return [9, 9, 9, 9];
    }
    return [
        9, 9, 9, 9,
        9, 8, 7, 6, 5, 4, 3, 2, 1,
        1, 2, 3, 4, 5, 6, 7, 8, 9,
        9, 9, 9, 9,
    ];
}
/**
 * Assign a pulka id (integer) to each round that belongs to a pulka, null otherwise.
 * Classic:    rounds 0-3  -> pulka 1,  rounds 22-25 -> pulka 2
 * Nines-only: rounds 0-3  -> pulka 1
 */
export function computePulkaIds(mode, roundPlan) {
    const result = new Array(roundPlan.length).fill(null);
    if (mode === 'nines_only') {
        // All 4 rounds belong to pulka 1
        for (let i = 0; i < roundPlan.length; i++) {
            result[i] = 1;
        }
        return result;
    }
    // Classic: first 4 rounds (0-3) = pulka 1, last 4 rounds (22-25) = pulka 2
    for (let i = 0; i <= 3 && i < roundPlan.length; i++)
        result[i] = 1;
    for (let i = 22; i <= 25 && i < roundPlan.length; i++)
        result[i] = 2;
    return result;
}
// ─── Game logic ───────────────────────────────────────────────────────────────
/**
 * Deal `cardCount` cards per player from a freshly shuffled deck.
 * Dealing starts from seat (dealerSeat+1)%4 going clockwise.
 * Updates match.hands in-place.
 */
export function dealRound(match) {
    const cardCount = match.roundPlan[match.currentRoundIndex];
    const deck = createDeck();
    // Reset hands
    const newHands = {};
    for (const player of match.players) {
        newHands[player.id] = [];
    }
    // Build dealing order: clockwise from seat after dealer
    const dealOrder = [];
    for (let offset = 1; offset <= 4; offset++) {
        const seat = (match.currentDealerSeat + offset) % 4;
        const player = match.players.find(p => p.seatIndex === seat);
        if (player)
            dealOrder.push(player);
    }
    // Deal one card at a time, round-robin
    let deckIndex = 0;
    for (let cardNum = 0; cardNum < cardCount; cardNum++) {
        for (const player of dealOrder) {
            if (deckIndex < deck.length) {
                newHands[player.id].push(deck[deckIndex++]);
            }
        }
    }
    match.hands = newHands;
}
/**
 * Validate a card play.
 * Returns an error string if invalid, null if valid.
 * Follow-suit: if trick is non-empty and player has the led suit, they must play it.
 */
export function validateCardPlay(hand, card, trick) {
    // Card must be in hand
    const inHand = hand.some(c => c.suit === card.suit && c.rank === card.rank);
    if (!inHand) {
        return 'Card is not in your hand.';
    }
    // If trick is empty, any card is fine (leading the trick)
    if (trick.length === 0) {
        return null;
    }
    const ledSuit = trick[0].card.suit;
    // If player is not playing the led suit, check they have no led-suit cards
    if (card.suit !== ledSuit) {
        const hasLedSuit = hand.some(c => c.suit === ledSuit);
        if (hasLedSuit) {
            return `You must follow suit (${ledSuit}).`;
        }
    }
    return null;
}
/**
 * Resolve the current trick.
 * Highest-ranked card of the led suit wins (no trump).
 */
export function resolveTrick(trick) {
    if (trick.length === 0) {
        throw new Error('Cannot resolve an empty trick.');
    }
    const ledSuit = trick[0].card.suit;
    let winner = trick[0];
    for (let i = 1; i < trick.length; i++) {
        const played = trick[i];
        if (played.card.suit === ledSuit && played.card.rank > winner.card.rank) {
            winner = played;
        }
    }
    return { winnerId: winner.playerId, winnerSeat: winner.seatIndex };
}
/**
 * Calculate score for one player for one round.
 *
 * Khishti:   declared ≥ 1 && actual === 0  →  -khishtiPenalty
 * Exact bid: actual === declared            →  declared === 0 ? zeroBidExactScore : declared * exactBidMultiplier
 * Miss:      actual !== declared            →  -(|actual - declared| * missPenaltyPerTrick)
 */
export function calcRoundScore(declared, actual, settings) {
    if (declared > 0 && actual === 0) {
        return { points: -settings.khishtiPenalty, khishti: true };
    }
    if (actual === declared) {
        const points = declared === 0 ? settings.zeroBidExactScore : declared * settings.exactBidMultiplier;
        return { points, khishti: false };
    }
    const points = -(Math.abs(actual - declared) * settings.missPenaltyPerTrick);
    return { points, khishti: false };
}
// ─── Score application ────────────────────────────────────────────────────────
/**
 * Called when all tricks in a round are done.
 * Calculates scores, checks pulka bonus, updates match in-place, returns the round result.
 */
export function applyRoundScores(match) {
    const roundIndex = match.currentRoundIndex;
    const cardCount = match.roundPlan[roundIndex];
    const pulkaId = match.pulkaIds[roundIndex];
    const { pulkaBonusPoints, bonusEnabled } = match.settings;
    const declarations = {};
    const taken = {};
    const points = {};
    const khishtiPlayers = [];
    const pulkaBonusPlayers = {};
    for (const player of match.players) {
        const declared = match.declarations[player.id] ?? 0;
        const actual = match.tricksTaken[player.id] ?? 0;
        declarations[player.id] = declared;
        taken[player.id] = actual;
        const { points: pts, khishti } = calcRoundScore(declared, actual, match.settings);
        points[player.id] = pts;
        if (khishti) {
            khishtiPlayers.push(player.id);
        }
        // Update running score
        match.scores[player.id] = (match.scores[player.id] ?? 0) + pts;
        // Pulka tracking: only if bonus is enabled and round was exact (not khishti)
        if (bonusEnabled && pulkaId !== null && !khishti && pts >= 0) {
            if (!match.pulkaExacts[player.id]) {
                match.pulkaExacts[player.id] = {};
            }
            const prev = match.pulkaExacts[player.id][pulkaId] ?? 0;
            const next = prev + 1;
            match.pulkaExacts[player.id][pulkaId] = next;
            // Award pulka bonus if player has been exact in all 4 rounds of this pulka
            if (next >= 4) {
                pulkaBonusPlayers[player.id] = pulkaBonusPoints;
                match.scores[player.id] += pulkaBonusPoints;
            }
        }
    }
    const result = {
        roundIndex,
        cardCount,
        declarations,
        taken,
        points,
        khishtiPlayers,
        pulkaId,
        pulkaBonusPlayers,
    };
    match.roundHistory.push(result);
    match.updatedAt = Date.now();
    return result;
}
// ─── CRUD ─────────────────────────────────────────────────────────────────────
export function createMatch(creator, settings) {
    const id = generateId();
    const code = uniqueMatchCode();
    const roundPlan = getJokerRoundPlan(settings.mode);
    const pulkaIds = computePulkaIds(settings.mode, roundPlan);
    const scores = {};
    const tricksTaken = {};
    const declarations = {};
    const hands = {};
    const pulkaExacts = {};
    scores[creator.id] = 0;
    tricksTaken[creator.id] = 0;
    declarations[creator.id] = null;
    hands[creator.id] = [];
    pulkaExacts[creator.id] = {};
    const now = Date.now();
    const match = {
        id,
        code,
        status: 'waiting',
        settings,
        players: [creator],
        spectatorSocketIds: [],
        roundPlan,
        pulkaIds,
        currentRoundIndex: 0,
        currentDealerSeat: 0,
        hands,
        declarations,
        currentDeclarationSeat: 1, // seat after dealer
        tricksTaken,
        currentTrick: [],
        currentTrickLeaderSeat: 1,
        currentPlaySeat: 1,
        scores,
        roundHistory: [],
        pulkaExacts,
        chat: [],
        createdAt: now,
        updatedAt: now,
    };
    matchStore.set(id, match);
    return match;
}
export function getMatch(id) {
    return matchStore.get(id);
}
export function getMatchByCode(code) {
    for (const match of matchStore.values()) {
        if (match.code === code)
            return match;
    }
    return undefined;
}
export function deleteMatch(id) {
    matchStore.delete(id);
}
export function getOpenMatches() {
    return [...matchStore.values()].filter(m => m.status === 'waiting' && !m.settings.privateTable);
}
export function getMatchForSocket(socketId) {
    for (const match of matchStore.values()) {
        const isPlayer = match.players.some(p => p.socketId === socketId);
        if (isPlayer)
            return match;
        if (match.spectatorSocketIds.includes(socketId))
            return match;
    }
    return undefined;
}
/**
 * Mark the match as finished and schedule its deletion after 10 minutes.
 */
export function finishMatch(match) {
    match.status = 'finished';
    match.updatedAt = Date.now();
    setTimeout(() => {
        matchStore.delete(match.id);
    }, 10 * 60 * 1000);
}
//# sourceMappingURL=jokerService.js.map