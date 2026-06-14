export type ClanWarStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export interface ClanWar {
    id: string;
    challengerClanId: string;
    challengerClanName: string;
    defenderClanId: string;
    defenderClanName: string;
    status: ClanWarStatus;
    challengerWins: number;
    defenderWins: number;
    startedAt: number | null;
    endsAt: number | null;
    createdAt: number;
    winnerClanId: string | null;
}
/** Create a pending war between two clans (challenger issues the challenge). */
export declare function challengeClan(challengerClanId: string, defenderClanId: string): Promise<ClanWar>;
/** Defender accepts the war → sets status to active and starts the timer. */
export declare function acceptWar(warId: string, defenderClanId: string): Promise<ClanWar>;
/** Defender declines the war → sets status to cancelled. */
export declare function declineWar(warId: string, defenderClanId: string): Promise<ClanWar>;
/**
 * Called after a game ends. If the winning clan is involved in an active war, record the win.
 * Returns the updated war (or null if not applicable).
 */
export declare function recordWarGame(gameId: string, winnerClanId: string, loserClanId: string): Promise<ClanWar | null>;
/** Returns the current active or pending war for a clan (or null). */
export declare function getActiveWar(clanId: string): Promise<ClanWar | null>;
/** Returns last N completed wars for a clan. */
export declare function getWarHistory(clanId: string, limit?: number): Promise<ClanWar[]>;
//# sourceMappingURL=clanWarService.d.ts.map