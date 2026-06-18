import type { DebateSide } from './debateService.js';

interface VoicePeer {
  socketId: string;
  playerId: string;
  username: string;
  side: DebateSide;
}

const rooms = new Map<string, Map<string, VoicePeer>>();

export function voiceJoin(debateId: string, playerId: string, socketId: string, side: DebateSide, username: string): VoicePeer[] {
  if (!rooms.has(debateId)) rooms.set(debateId, new Map());
  rooms.get(debateId)!.set(playerId, { socketId, side, playerId, username });
  return getVoicePeers(debateId, playerId);
}

export function voiceLeave(debateId: string, playerId: string): void {
  rooms.get(debateId)?.delete(playerId);
  if ((rooms.get(debateId)?.size ?? 0) === 0) rooms.delete(debateId);
}

export function getVoicePeers(debateId: string, excludePlayerId: string): VoicePeer[] {
  const room = rooms.get(debateId);
  if (!room) return [];
  return [...room.values()].filter(p => p.playerId !== excludePlayerId);
}

export function getVoicePeer(debateId: string, playerId: string): VoicePeer | null {
  return rooms.get(debateId)?.get(playerId) ?? null;
}

export function getSocketPeer(debateId: string, socketId: string): VoicePeer | null {
  const room = rooms.get(debateId);
  if (!room) return null;
  for (const peer of room.values()) {
    if (peer.socketId === socketId) return peer;
  }
  return null;
}
