/**
 * Per-match voice membership for Checkers Push-to-Talk.
 * Completely independent from Mafia voice rooms and Community lounges.
 */
/**
 * Register a socket as a voice member of a match.
 * Returns the list of peers already in voice so the caller can
 * initiate WebRTC offers to each of them.
 */
export declare function voiceJoin(matchId: string, socketId: string, name: string): Array<{
    socketId: string;
    name: string;
}>;
/**
 * Remove a socket from any match voice room.
 * Returns the matchId the socket was in, or null if they weren't in voice.
 */
export declare function voiceLeave(socketId: string): string | null;
/**
 * Returns the matchId a socket is currently in voice for, or null.
 */
export declare function voiceGetMatchId(socketId: string): string | null;
//# sourceMappingURL=checkersVoiceService.d.ts.map