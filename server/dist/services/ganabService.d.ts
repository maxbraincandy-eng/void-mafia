export interface GanabCrown {
    nickname: string;
    createdAt: number;
}
/** Record a coronation. Deduped: one row per (player, nickname) is kept fresh. */
export declare function addCrown(playerId: string, rawNickname: string): Promise<void>;
export declare function listCrowned(limit?: number): Promise<GanabCrown[]>;
//# sourceMappingURL=ganabService.d.ts.map