/**
 * Per-match voice membership for WWW (What? Where? When?) Push-to-Talk.
 * Completely independent from Mafia voice rooms and Community lounges.
 */

interface VoiceMember {
  matchId: string;
  name: string;
}

const voiceRooms  = new Map<string, Set<string>>(); // matchId → socketId set
const memberIndex = new Map<string, VoiceMember>(); // socketId → info

/**
 * Register a socket as a voice member of a match.
 * Returns the list of peers already in voice so the caller can
 * initiate WebRTC offers to each of them.
 */
export function voiceJoin(
  matchId: string,
  socketId: string,
  name: string,
): Array<{ socketId: string; name: string }> {
  let room = voiceRooms.get(matchId);
  if (!room) { room = new Set(); voiceRooms.set(matchId, room); }

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
export function voiceLeave(socketId: string): string | null {
  const info = memberIndex.get(socketId);
  if (!info) return null;

  memberIndex.delete(socketId);
  const room = voiceRooms.get(info.matchId);
  if (room) {
    room.delete(socketId);
    if (room.size === 0) voiceRooms.delete(info.matchId);
  }
  return info.matchId;
}

/**
 * Returns the matchId a socket is currently in voice for, or null.
 */
export function voiceGetMatchId(socketId: string): string | null {
  return memberIndex.get(socketId)?.matchId ?? null;
}
