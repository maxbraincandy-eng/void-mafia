const rooms = new Map();
export function voiceJoin(debateId, playerId, socketId, side, username) {
    if (!rooms.has(debateId))
        rooms.set(debateId, new Map());
    rooms.get(debateId).set(playerId, { socketId, side, playerId, username });
    return getVoicePeers(debateId, playerId);
}
export function voiceLeave(debateId, playerId) {
    rooms.get(debateId)?.delete(playerId);
    if ((rooms.get(debateId)?.size ?? 0) === 0)
        rooms.delete(debateId);
}
export function getVoicePeers(debateId, excludePlayerId) {
    const room = rooms.get(debateId);
    if (!room)
        return [];
    return [...room.values()].filter(p => p.playerId !== excludePlayerId);
}
export function getVoicePeer(debateId, playerId) {
    return rooms.get(debateId)?.get(playerId) ?? null;
}
export function getSocketPeer(debateId, socketId) {
    const room = rooms.get(debateId);
    if (!room)
        return null;
    for (const peer of room.values()) {
        if (peer.socketId === socketId)
            return peer;
    }
    return null;
}
//# sourceMappingURL=debateVoiceService.js.map