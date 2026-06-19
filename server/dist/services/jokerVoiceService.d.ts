/**
 * Per-match voice membership for Joker card game Push-to-Talk.
 * Completely independent from other game voice rooms.
 */
export declare function voiceJoin(matchId: string, socketId: string, name: string): Array<{
    socketId: string;
    name: string;
}>;
export declare function voiceLeave(socketId: string): string | null;
export declare function voiceGetMatchId(socketId: string): string | null;
//# sourceMappingURL=jokerVoiceService.d.ts.map