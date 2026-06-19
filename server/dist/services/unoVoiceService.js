/**
 * Per-match voice membership for UNO Push-to-Talk.
 * Completely independent from Mafia voice rooms and Community lounges.
 */
const voiceRooms = new Map(); // matchId → socketId set
const memberIndex = new Map(); // socketId → info
/**
 * Register a socket as a voice member of a match.
 * Returns the list of peers already in voice so the caller can
 * initiate WebRTC offers to each of them.
 */
export function voiceJoin(matchId, socketId, name) {
    let room = voiceRooms.get(matchId);
    if (!room) {
        room = new Set();
        voiceRooms.set(matchId, room);
    }
    const existing = [...room]
        .filter(s => s !== socketId)
        .map(s => ({ socketId: s, name: memberIndex.get(s)?.name ?? 'Player' }));
    room.add(socketId);
    memberIndex.set(socketId, { matchId, name });
    return existing;
}
/**
 * Remove a socket from any match voice room.
 * Returns the matchId the socket was in, or null if they weren't in voice.
 */
export function voiceLeave(socketId) {
    const info = memberIndex.get(socketId);
    if (!info)
        return null;
    memberIndex.delete(socketId);
    const room = voiceRooms.get(info.matchId);
    if (room) {
        room.delete(socketId);
        if (room.size === 0)
            voiceRooms.delete(info.matchId);
    }
    return info.matchId;
}
/**
 * Returns the matchId a socket is currently in voice for, or null.
 */
export function voiceGetMatchId(socketId) {
    return memberIndex.get(socketId)?.matchId ?? null;
}
//# sourceMappingURL=unoVoiceService.js.map