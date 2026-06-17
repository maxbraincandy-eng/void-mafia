/**
 * Per-match voice membership for Ludo Push-to-Talk.
 * Mirrors checkersVoiceService but namespaced for Ludo.
 */
export declare function voiceJoin(matchId: string, socketId: string, name: string): Array<{
    socketId: string;
    name: string;
}>;
export declare function voiceLeave(socketId: string): string | null;
export declare function voiceGetMatchId(socketId: string): string | null;
//# sourceMappingURL=ludoVoiceService.d.ts.map