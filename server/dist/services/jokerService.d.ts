export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
    suit: Suit;
    rank: Rank;
}
export interface PlayedCard {
    playerId: string;
    seatIndex: number;
    card: Card;
}
export interface JokerPlayer {
    id: string;
    socketId: string;
    name: string;
    profileId: string | null;
    seatIndex: number;
}
export interface JokerSettings {
    mode: 'classic' | 'nines_only';
    khishtiPenalty: number;
    exactBidMultiplier: number;
    zeroBidExactScore: number;
    missPenaltyPerTrick: number;
    bonusEnabled: boolean;
    spectatorsAllowed: boolean;
    privateTable: boolean;
    pulkaBonusPoints: number;
}
export interface JokerRoundResult {
    roundIndex: number;
    cardCount: number;
    declarations: Record<string, number>;
    taken: Record<string, number>;
    points: Record<string, number>;
    khishtiPlayers: string[];
    pulkaId: number | null;
    pulkaBonusPlayers: Record<string, number>;
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
    currentTrick: PlayedCard[];
    currentTrickLeaderSeat: number;
    currentPlaySeat: number;
    scores: Record<string, number>;
    roundHistory: JokerRoundResult[];
    pulkaExacts: Record<string, Record<number, number>>;
    chat: JokerChatMsg[];
    createdAt: number;
    updatedAt: number;
}
/**
 * Build and shuffle a 36-card deck (ranks 6–A per suit).
 */
export declare function createDeck(): Card[];
/**
 * Return the round plan (card-count array) for the given mode.
 * Classic:    [9,9,9,9, 9,8,7,6,5,4,3,2,1, 1,2,3,4,5,6,7,8,9, 9,9,9,9]
 * Nines-only: [9,9,9,9]
 */
export declare function getJokerRoundPlan(mode: 'classic' | 'nines_only'): number[];
/**
 * Assign a pulka id (integer) to each round that belongs to a pulka, null otherwise.
 * Classic:    rounds 0-3  -> pulka 1,  rounds 22-25 -> pulka 2
 * Nines-only: rounds 0-3  -> pulka 1
 */
export declare function computePulkaIds(mode: 'classic' | 'nines_only', roundPlan: number[]): (number | null)[];
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
 * Highest-ranked card of the led suit wins (no trump).
 */
export declare function resolveTrick(trick: PlayedCard[]): {
    winnerId: string;
    winnerSeat: number;
};
/**
 * Calculate score for one player for one round.
 *
 * Khishti:   declared ≥ 1 && actual === 0  →  -khishtiPenalty
 * Exact bid: actual === declared            →  declared === 0 ? zeroBidExactScore : declared * exactBidMultiplier
 * Miss:      actual !== declared            →  -(|actual - declared| * missPenaltyPerTrick)
 */
export declare function calcRoundScore(declared: number, actual: number, settings: Pick<JokerSettings, 'khishtiPenalty' | 'exactBidMultiplier' | 'zeroBidExactScore' | 'missPenaltyPerTrick'>): {
    points: number;
    khishti: boolean;
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