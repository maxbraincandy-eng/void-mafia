import type { Room } from '../types/index.js';

export type VoiceChannel = 'room' | 'mafia' | 'yakuza';

export interface VoiceMember {
  socketId: string;
  playerId: string;
  name: string;
}

// roomId → channel → socketId → VoiceMember
const state = new Map<string, Map<VoiceChannel, Map<string, VoiceMember>>>();

function ensureRoom(roomId: string): Map<VoiceChannel, Map<string, VoiceMember>> {
  if (!state.has(roomId)) {
    state.set(roomId, new Map([
      ['room',   new Map()],
      ['mafia',  new Map()],
      ['yakuza', new Map()],
    ]));
  }
  return state.get(roomId)!;
}

/** Returns null if allowed, or an error string if not. */
export function canJoin(room: Room, playerId: string, channel: VoiceChannel): string | null {
  const player = room.players.get(playerId);
  if (!player)            return 'Player not found.';
  if (!player.isConnected) return 'Player is not connected.';

  if (channel === 'room') {
    if (!player.isAlive && room.phase !== 'lobby') {
      return 'Dead players cannot join room voice.';
    }
    return null;
  }

  if (channel === 'mafia') {
    if (room.phase !== 'night')    return 'Mafia voice is only available during night.';
    if (!player.isAlive)           return 'Dead players cannot join mafia voice.';
    if (player.team !== 'mafia')   return 'Only Mafia members can join mafia voice.';
    return null;
  }

  if (channel === 'yakuza') {
    if (room.phase !== 'night')    return 'Yakuza voice is only available during night.';
    if (!player.isAlive)           return 'Dead players cannot join Yakuza voice.';
    if (player.team !== 'yakuza')  return 'Only Yakuza faction members can join Yakuza voice.';
    return null;
  }

  return 'Unknown channel.';
}

/** Add a member. Returns list of EXISTING members (for offer negotiation). */
export function join(roomId: string, channel: VoiceChannel, member: VoiceMember): VoiceMember[] {
  const ch = ensureRoom(roomId).get(channel)!;
  const existing = Array.from(ch.values()).filter(m => m.socketId !== member.socketId);
  ch.set(member.socketId, member);
  return existing;
}

/** Remove socket from all voice channels. Returns what was removed. */
export function leave(socketId: string): Array<{
  roomId: string;
  channel: VoiceChannel;
  remaining: VoiceMember[];
}> {
  const removed: Array<{ roomId: string; channel: VoiceChannel; remaining: VoiceMember[] }> = [];

  for (const [roomId, channels] of state.entries()) {
    for (const [channel, members] of channels.entries()) {
      if (members.has(socketId)) {
        members.delete(socketId);
        removed.push({ roomId, channel, remaining: Array.from(members.values()) });
      }
    }
    // Prune empty room entries
    if ([...channels.values()].every(m => m.size === 0)) state.delete(roomId);
  }

  return removed;
}

export function getMembers(roomId: string, channel: VoiceChannel): VoiceMember[] {
  return Array.from(state.get(roomId)?.get(channel)?.values() ?? []);
}

/** Returns null if player may transmit in this channel right now, or an error string. */
export function canTransmitVoice(room: Room, playerId: string, channel: VoiceChannel): string | null {
  const player = room.players.get(playerId);
  if (!player)             return 'Player not found.';
  if (!player.isAlive)     return 'Dead players cannot transmit voice.';
  if (player.isSpectator)  return 'Spectators cannot transmit voice.';

  if (channel === 'room') {
    if (room.phase === 'night') return 'Public voice is disabled during night.';
    if (room.phase === 'speech') {
      const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
      if (playerId !== speakerId) return 'Only the current speaker may transmit.';
    }
    return null;
  }

  if (channel === 'mafia') {
    if (room.phase !== 'night')  return 'Mafia voice is only available during night.';
    if (player.team !== 'mafia') return 'Only Mafia members can transmit in this channel.';
    return null;
  }

  if (channel === 'yakuza') {
    if (room.phase !== 'night')    return 'Yakuza voice is only available during night.';
    if (player.team !== 'yakuza')  return 'Only Yakuza faction members can transmit in this channel.';
    return null;
  }

  return 'Unknown channel.';
}

/** Returns the voice channel that both sockets share (for offer-relay authorization). */
export function getSharedChannel(socketId1: string, socketId2: string): VoiceChannel | null {
  for (const [, channels] of state.entries()) {
    for (const [channel, members] of channels.entries()) {
      if (members.has(socketId1) && members.has(socketId2)) {
        return channel;
      }
    }
  }
  return null;
}


/** Remove one socket from a specific channel. Returns remaining members, or null if socket wasn't in that channel. */
export function removeFromChannel(
  socketId: string,
  channel: VoiceChannel,
): { roomId: string; remaining: VoiceMember[] } | null {
  for (const [roomId, channels] of state.entries()) {
    const ch = channels.get(channel);
    if (ch?.has(socketId)) {
      ch.delete(socketId);
      return { roomId, remaining: Array.from(ch.values()) };
    }
  }
  return null;
}
