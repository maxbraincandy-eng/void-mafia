interface VoiceMember { matchId: string; name: string; }
const voiceRooms  = new Map<string, Set<string>>();
const memberIndex = new Map<string, VoiceMember>();

export function voiceJoin(matchId: string, socketId: string, name: string): Array<{ socketId: string; name: string }> {
  let room = voiceRooms.get(matchId);
  if (!room) { room = new Set(); voiceRooms.set(matchId, room); }
  const existing = [...room].filter(s => s !== socketId).map(s => ({ socketId: s, name: memberIndex.get(s)?.name ?? 'Player' }));
  room.add(socketId);
  memberIndex.set(socketId, { matchId, name });
  return existing;
}

export function voiceLeave(socketId: string): string | null {
  const info = memberIndex.get(socketId);
  if (!info) return null;
  memberIndex.delete(socketId);
  const room = voiceRooms.get(info.matchId);
  if (room) { room.delete(socketId); if (room.size === 0) voiceRooms.delete(info.matchId); }
  return info.matchId;
}

export function voiceGetMatchId(socketId: string): string | null {
  return memberIndex.get(socketId)?.matchId ?? null;
}
