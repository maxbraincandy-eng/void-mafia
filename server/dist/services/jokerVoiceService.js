/**
 * Per-match voice membership for Joker card game Push-to-Talk.
 * Completely independent from other game voice rooms.
 */
const voiceRooms = new Map(); // matchId → socketId set
const memberIndex = new Map(); // socketId → info
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
export function voiceGetMatchId(socketId) {
    return memberIndex.get(socketId)?.matchId ?? null;
}
//# sourceMappingURL=jokerVoiceService.js.map