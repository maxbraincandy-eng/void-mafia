// roomId → channel → socketId → VoiceMember
const state = new Map();
function ensureRoom(roomId) {
    if (!state.has(roomId)) {
        state.set(roomId, new Map([
            ['room', new Map()],
            ['mafia', new Map()],
        ]));
    }
    return state.get(roomId);
}
/** Returns null if allowed, or an error string if not. */
export function canJoin(room, playerId, channel) {
    const player = room.players.get(playerId);
    if (!player)
        return 'Player not found.';
    if (!player.isConnected)
        return 'Player is not connected.';
    if (channel === 'room') {
        if (!player.isAlive && room.phase !== 'lobby') {
            return 'Dead players cannot join room voice.';
        }
        return null;
    }
    if (channel === 'mafia') {
        if (room.phase !== 'night')
            return 'Mafia voice is only available during night.';
        if (!player.isAlive)
            return 'Dead players cannot join mafia voice.';
        if (player.team !== 'mafia')
            return 'Only Mafia members can join mafia voice.';
        return null;
    }
    return 'Unknown channel.';
}
/** Add a member. Returns list of EXISTING members (for offer negotiation). */
export function join(roomId, channel, member) {
    const ch = ensureRoom(roomId).get(channel);
    const existing = Array.from(ch.values()).filter(m => m.socketId !== member.socketId);
    ch.set(member.socketId, member);
    return existing;
}
/** Remove socket from all voice channels. Returns what was removed. */
export function leave(socketId) {
    const removed = [];
    for (const [roomId, channels] of state.entries()) {
        for (const [channel, members] of channels.entries()) {
            if (members.has(socketId)) {
                members.delete(socketId);
                removed.push({ roomId, channel, remaining: Array.from(members.values()) });
            }
        }
        // Prune empty room entries
        if ([...channels.values()].every(m => m.size === 0))
            state.delete(roomId);
    }
    return removed;
}
export function getMembers(roomId, channel) {
    return Array.from(state.get(roomId)?.get(channel)?.values() ?? []);
}
//# sourceMappingURL=voiceService.js.map