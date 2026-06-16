// Independent in-memory voice-membership bookkeeping for Community lounges.
// Deliberately has zero knowledge of Room/Phase/game state — see voiceService.ts
// for the (unrelated) Mafia game-room voice equivalent.
// loungeId → socketId → member
const state = new Map();
function ensureLounge(loungeId) {
    if (!state.has(loungeId))
        state.set(loungeId, new Map());
    return state.get(loungeId);
}
/** Add a member. Returns existing members (for offer negotiation). */
export function join(loungeId, member) {
    const members = ensureLounge(loungeId);
    const existing = Array.from(members.values()).filter(m => m.socketId !== member.socketId);
    members.set(member.socketId, member);
    return existing;
}
/** Remove a socket from whichever lounge it's in. Returns what was removed. */
export function leave(socketId) {
    const removed = [];
    for (const [loungeId, members] of state.entries()) {
        if (members.has(socketId)) {
            members.delete(socketId);
            removed.push({ loungeId, remaining: Array.from(members.values()) });
        }
        if (members.size === 0)
            state.delete(loungeId);
    }
    return removed;
}
export function getMembers(loungeId) {
    return Array.from(state.get(loungeId)?.values() ?? []);
}
export function getMember(loungeId, socketId) {
    return state.get(loungeId)?.get(socketId) ?? null;
}
export function getMemberByPlayerId(loungeId, playerId) {
    const members = state.get(loungeId);
    if (!members)
        return null;
    for (const m of members.values())
        if (m.playerId === playerId)
            return m;
    return null;
}
export function setRole(loungeId, socketId, role) {
    const m = state.get(loungeId)?.get(socketId);
    if (!m)
        return null;
    m.role = role;
    if (role !== 'listener')
        m.handRaised = false;
    return m;
}
export function setHandRaised(loungeId, socketId, raised) {
    const m = state.get(loungeId)?.get(socketId);
    if (!m)
        return null;
    m.handRaised = raised;
    return m;
}
/** Remove a specific member from a lounge (kick). Returns the removed member, if any. */
export function removeMember(loungeId, targetSocketId) {
    const members = state.get(loungeId);
    if (!members)
        return null;
    const m = members.get(targetSocketId) ?? null;
    if (m) {
        members.delete(targetSocketId);
        if (members.size === 0)
            state.delete(loungeId);
    }
    return m;
}
export function getLoungeIdForSocket(socketId) {
    for (const [loungeId, members] of state.entries()) {
        if (members.has(socketId))
            return loungeId;
    }
    return null;
}
export function getCounts(loungeId) {
    const members = Array.from(state.get(loungeId)?.values() ?? []);
    const speakerCount = members.filter(m => m.role === 'host' || m.role === 'speaker').length;
    const listenerCount = members.filter(m => m.role === 'listener').length;
    return { listenerCount, speakerCount };
}
/** Returns the lounge both sockets share (for offer-relay authorization), or null. */
export function getSharedLounge(socketId1, socketId2) {
    for (const [loungeId, members] of state.entries()) {
        if (members.has(socketId1) && members.has(socketId2))
            return loungeId;
    }
    return null;
}
//# sourceMappingURL=loungeVoiceService.js.map