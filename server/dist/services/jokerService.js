import { generateId } from '../utils/helpers.js';
export const KHISHTI_PENALTIES = [0, 100, 200, 500];
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
 * Build and shuffle a 38-card deck (ranks 6–A per suit + 2 jokers).
 */
export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    deck.push({ suit: 'J', rank: 0 });
    deck.push({ suit: 'J', rank: 0 });
    return shuffle(deck);
}
/**
 * The deals of a game, and the four columns they are written in.
 *
 * Both structures people actually play:
 *
 *   classic     — up 1…9, four nines, back down 9…1, four nines. 26 deals, and
 *                 the score sheet's four columns are exactly those four stages.
 *   nines_only  — four blocks of four nines. 16 deals, four columns of four.
 *
 * The columns matter beyond bookkeeping: პრემია is won or lost over a whole
 * column, so where one ends is a rule, not a layout choice.
 */
const PLANS = {
    classic: [
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [9, 9, 9, 9],
        [9, 8, 7, 6, 5, 4, 3, 2, 1],
        [9, 9, 9, 9],
    ],
    nines_only: [
        [9, 9, 9, 9],
        [9, 9, 9, 9],
        [9, 9, 9, 9],
        [9, 9, 9, 9],
    ],
};
export function getJokerRoundPlan(mode) {
    return PLANS[mode].flat();
}
/** Which პულკა (column) each deal belongs to, numbered from 1. */
export function computePulkaIds(mode, _roundPlan) {
    return PLANS[mode].flatMap((block, i) => block.map(() => i + 1));
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
    // Joker can always be played
    if (card.suit === 'J') {
        const inHand = hand.some(c => c.suit === 'J' && c.rank === 0);
        return inHand ? null : 'Card is not in your hand.';
    }
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
 *
 * The joker still beats everything — including ხიშტი — and may hand the trick
 * to whoever it was given to. Otherwise the highest trump wins, and if no trump
 * was played, the highest card of the led suit.
 */
export function resolveTrick(trick, players, trumpSuit = null) {
    if (trick.length === 0) {
        throw new Error('Cannot resolve an empty trick.');
    }
    // First joker in the trick wins (or gives the trick to jokerTarget)
    const jokerPlay = trick.find(p => p.card.suit === 'J');
    if (jokerPlay) {
        const targetId = jokerPlay.jokerTarget ?? jokerPlay.playerId;
        const targetPlayer = players.find(p => p.id === targetId);
        return { winnerId: targetId, winnerSeat: targetPlayer?.seatIndex ?? jokerPlay.seatIndex };
    }
    const ledSuit = trick[0].card.suit;
    const trumps = trumpSuit && trumpSuit !== 'J'
        ? trick.filter(p => p.card.suit === trumpSuit)
        : [];
    const contenders = trumps.length > 0 ? trumps : trick.filter(p => p.card.suit === ledSuit);
    let winner = contenders[0] ?? trick[0];
    for (const played of contenders) {
        if (played.card.rank > winner.card.rank)
            winner = played;
    }
    return { winnerId: winner.playerId, winnerSeat: winner.seatIndex };
}
/**
 * The one bid the LAST declarer of a deal is not allowed to make.
 *
 * The bids must never add up to exactly the number of cards: if they did, every
 * player could make their word and the hand would have no edge to it. So the
 * last player is pushed off that number — with six cards dealt and 1+4+1
 * already called, they cannot pass, because passing would make it add up. They
 * must go up, and someone will lose a trick they promised (წაგლეჯვა) or be
 * handed one they did not want (შეტენვა).
 *
 * Returns null while it is not yet the last player's turn.
 */
export function forbiddenBid(match) {
    const declared = match.players.filter(p => match.declarations[p.id] !== null);
    if (declared.length !== match.players.length - 1)
        return null;
    const cardCount = match.roundPlan[match.currentRoundIndex] ?? 0;
    const sum = declared.reduce((n, p) => n + (match.declarations[p.id] ?? 0), 0);
    const forbidden = cardCount - sum;
    return forbidden >= 0 && forbidden <= cardCount ? forbidden : null;
}
/**
 * Where the hand stands: more promised than there are tricks (someone will be
 * torn off one — წაგლეჯვა), or fewer (someone will be stuffed — შეტენვა).
 */
export function bidTension(match) {
    const cardCount = match.roundPlan[match.currentRoundIndex] ?? 0;
    const sum = match.players.reduce((n, p) => n + (match.declarations[p.id] ?? 0), 0);
    const diff = sum - cardCount;
    return { sum, diff, kind: diff > 0 ? 'tear' : diff < 0 ? 'stuff' : 'even' };
}
/**
 * What one deal is worth to one player.
 *
 * Keeping your word:
 *   პასი (0) …  50        1 … 100     2 … 150     3 … 200     4 … 250
 *   5 … 300     6 … 350    7 … 400     8 … 450
 *   and taking the WHOLE deal is worth 100 per card — nine of nine is 900,
 *   four of four is 400 — because there is nothing left to lose by then.
 *
 * Breaking it — stuffed with a trick you did not want, or torn off one you
 * promised — costs whatever the host set the ხიშტი at: a flat fall of 100, 200
 * or 500, or, when they set it to zero, the soft rule of ten a trick for what
 * was actually taken. Missing by one and missing by four cost the same, because
 * the promise is the whole of it.
 */
export function calcRoundScore(declared, actual, cardCount, khishtiPenalty = 0) {
    const khishti = declared > 0 && actual === 0;
    if (actual === declared) {
        const points = declared === cardCount && cardCount > 0 ? 100 * cardCount : 50 + 50 * declared;
        return { points, khishti, exact: true };
    }
    return { points: khishtiPenalty > 0 ? -khishtiPenalty : 10 * actual, khishti, exact: false };
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
    const { bonusEnabled } = match.settings;
    const declarations = {};
    const taken = {};
    const points = {};
    const khishtiPlayers = [];
    for (const player of match.players) {
        const declared = match.declarations[player.id] ?? 0;
        const actual = match.tricksTaken[player.id] ?? 0;
        declarations[player.id] = declared;
        taken[player.id] = actual;
        const { points: pts, khishti, exact } = calcRoundScore(declared, actual, cardCount, match.settings.khishtiPenalty ?? 0);
        points[player.id] = pts;
        if (khishti)
            khishtiPlayers.push(player.id);
        match.scores[player.id] = (match.scores[player.id] ?? 0) + pts;
        // How many deals of this pulka they have kept their word in so far.
        if (pulkaId !== null) {
            if (!match.pulkaExacts[player.id])
                match.pulkaExacts[player.id] = {};
            const prev = match.pulkaExacts[player.id][pulkaId] ?? 0;
            match.pulkaExacts[player.id][pulkaId] = exact ? prev + 1 : prev;
        }
    }
    const result = {
        roundIndex,
        cardCount,
        trumpSuit: match.trumpSuit,
        declarations,
        taken,
        points,
        khishtiPlayers,
        pulkaId,
        premiumPlayers: {},
        premiumPenalties: {},
    };
    match.roundHistory.push(result);
    // The premium is settled when the column is full, because it is about the
    // whole column — not about this deal.
    const isPulkaEnd = pulkaId !== null && match.pulkaIds[roundIndex + 1] !== pulkaId;
    if (bonusEnabled && isPulkaEnd) {
        const { bonus, penalty } = settlePremium(match, pulkaId);
        result.premiumPlayers = bonus;
        result.premiumPenalties = penalty;
    }
    match.updatedAt = Date.now();
    return result;
}
/**
 * პრემია — the reward for a clean column.
 *
 * Keep your word in every deal of a pulka — never stuffed, never torn — and
 * your best deal of that pulka counts twice. Everyone else loses their own best
 * deal of the same pulka. That is why a pulka is played as one thing rather
 * than four separate hands: one broken word in the fourth deal costs the whole
 * column.
 *
 * At most three players can ever manage it: the bids never add up to the cards
 * dealt, so somebody breaks their word in every single deal.
 */
function settlePremium(match, pulkaId) {
    const rounds = match.roundHistory.filter(r => r.pulkaId === pulkaId);
    const bonus = {};
    const penalty = {};
    if (rounds.length === 0)
        return { bonus, penalty };
    // Best DEAL of the column — a fall is never anybody's best, so the floor is 0.
    const best = (id) => Math.max(0, ...rounds.map(r => r.points[id] ?? 0));
    const cleanSweep = (id) => rounds.every(r => (r.taken[id] ?? 0) === (r.declarations[id] ?? 0));
    const winners = match.players.filter(p => cleanSweep(p.id));
    if (winners.length === 0)
        return { bonus, penalty };
    for (const w of winners) {
        const b = best(w.id);
        if (b > 0) {
            bonus[w.id] = b;
            match.scores[w.id] = (match.scores[w.id] ?? 0) + b;
        }
    }
    for (const other of match.players) {
        if (winners.some(w => w.id === other.id))
            continue;
        const lost = best(other.id);
        if (lost > 0) {
            penalty[other.id] = lost;
            match.scores[other.id] = (match.scores[other.id] ?? 0) - lost;
        }
    }
    return { bonus, penalty };
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
    const botPlayerIds = [];
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
        trumpSuit: null,
        trumpChooserSeat: 1,
        currentTrick: [],
        currentTrickLeaderSeat: 1,
        currentPlaySeat: 1,
        scores,
        roundHistory: [],
        pulkaExacts,
        botPlayerIds,
        chat: [],
        dissolved: false,
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
 *
 * `dissolved` separates "the table broke up" from "the game was played out" —
 * the end screen says a different thing for each.
 */
export function finishMatch(match, dissolved = false) {
    match.status = 'finished';
    if (dissolved)
        match.dissolved = true;
    match.updatedAt = Date.now();
    setTimeout(() => {
        matchStore.delete(match.id);
    }, 10 * 60 * 1000);
}
//# sourceMappingURL=jokerService.js.map