export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';
export type Rank = 0 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
    suit: Suit;
    rank: Rank;
}
export interface PlayedCard {
    playerId: string;
    seatIndex: number;
    card: Card;
    jokerTarget?: string;
}
export interface JokerPlayer {
    id: string;
    socketId: string;
    name: string;
    profileId: string | null;
    seatIndex: number;
    isBot?: boolean;
    avatar?: string;
    avatarUrl?: string | null;
}
export interface JokerSettings {
    mode: 'classic' | 'nines_only';
    bonusEnabled: boolean;
    spectatorsAllowed: boolean;
    privateTable: boolean;
    /**
     * What a broken word costs — chosen by the host before the first deal,
     * because tables disagree about it and always have.
     *
     * 0 keeps the soft rule (ten a trick for what was actually taken, never
     * below zero); 100 / 200 / 500 make it a real fall. Both readings of ხიშტი
     * are in here: the table that plays it as a consolation and the table that
     * plays it as a punishment.
     */
    khishtiPenalty: number;
}
export declare const KHISHTI_PENALTIES: readonly [0, 100, 200, 500];
export interface JokerRoundResult {
    roundIndex: number;
    cardCount: number;
    trumpSuit: Suit | null;
    declarations: Record<string, number>;
    taken: Record<string, number>;
    points: Record<string, number>;
    khishtiPlayers: string[];
    pulkaId: number | null;
    /** Premium: best deal of the pulka doubled, for a player who was exact in all of it. */
    premiumPlayers: Record<string, number>;
    /** Premium: everyone else loses their best deal of that pulka. */
    premiumPenalties: Record<string, number>;
}
export interface JokerChatMsg {
    senderId: string;
    senderName: string;
    text: string;
    ts: number;
}
export interface JokerMatch {
    id: string;
    code: string;
    status: 'waiting' | 'declaration' | 'playing' | 'round_end' | 'finished';
    settings: JokerSettings;
    players: JokerPlayer[];
    spectatorSocketIds: string[];
    roundPlan: number[];
    pulkaIds: (number | null)[];
    currentRoundIndex: number;
    currentDealerSeat: number;
    hands: Record<string, Card[]>;
    declarations: Record<string, number | null>;
    currentDeclarationSeat: number;
    tricksTaken: Record<string, number>;
    /**
     * ხიშტი — the trump suit for this deal, named by the first player to declare
     * (the "host" of the hand, left of the dealer). null = უხიშტოდ, no trump.
     */
    trumpSuit: Suit | null;
    /** The seat that names the trump: the first declarer of this deal. */
    trumpChooserSeat: number;
    currentTrick: PlayedCard[];
    currentTrickLeaderSeat: number;
    currentPlaySeat: number;
    scores: Record<string, number>;
    roundHistory: JokerRoundResult[];
    pulkaExacts: Record<string, Record<number, number>>;
    botPlayerIds: string[];
    chat: JokerChatMsg[];
    createdAt: number;
    updatedAt: number;
}
/**
 * Build and shuffle a 38-card deck (ranks 6–A per suit + 2 jokers).
 */
export declare function createDeck(): Card[];
export declare function getJokerRoundPlan(mode: 'classic' | 'nines_only'): number[];
/** Which პულკა (column) each deal belongs to, numbered from 1. */
export declare function computePulkaIds(mode: 'classic' | 'nines_only', _roundPlan: number[]): (number | null)[];
/**
 * Deal `cardCount` cards per player from a freshly shuffled deck.
 * Dealing starts from seat (dealerSeat+1)%4 going clockwise.
 * Updates match.hands in-place.
 */
export declare function dealRound(match: JokerMatch): void;
/**
 * Validate a card play.
 * Returns an error string if invalid, null if valid.
 * Follow-suit: if trick is non-empty and player has the led suit, they must play it.
 */
export declare function validateCardPlay(hand: Card[], card: Card, trick: PlayedCard[]): string | null;
/**
 * Resolve the current trick.
 *
 * The joker still beats everything — including ხიშტი — and may hand the trick
 * to whoever it was given to. Otherwise the highest trump wins, and if no trump
 * was played, the highest card of the led suit.
 */
export declare function resolveTrick(trick: PlayedCard[], players: JokerPlayer[], trumpSuit?: Suit | null): {
    winnerId: string;
    winnerSeat: number;
};
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
export declare function forbiddenBid(match: JokerMatch): number | null;
/**
 * Where the hand stands: more promised than there are tricks (someone will be
 * torn off one — წაგლეჯვა), or fewer (someone will be stuffed — შეტენვა).
 */
export declare function bidTension(match: JokerMatch): {
    sum: number;
    diff: number;
    kind: 'tear' | 'stuff' | 'even';
};
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
export declare function calcRoundScore(declared: number, actual: number, cardCount: number, khishtiPenalty?: number): {
    points: number;
    khishti: boolean;
    exact: boolean;
};
/**
 * Called when all tricks in a round are done.
 * Calculates scores, checks pulka bonus, updates match in-place, returns the round result.
 */
export declare function applyRoundScores(match: JokerMatch): JokerRoundResult;
export declare function createMatch(creator: JokerPlayer, settings: JokerSettings): JokerMatch;
export declare function getMatch(id: string): JokerMatch | undefined;
export declare function getMatchByCode(code: string): JokerMatch | undefined;
export declare function deleteMatch(id: string): void;
export declare function getOpenMatches(): JokerMatch[];
export declare function getMatchForSocket(socketId: string): JokerMatch | undefined;
/**
 * Mark the match as finished and schedule its deletion after 10 minutes.
 */
export declare function finishMatch(match: JokerMatch): void;
//# sourceMappingURL=jokerService.d.ts.map