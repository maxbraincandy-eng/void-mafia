import { ChatMessage, ChatChannel, Room, Player } from '../types/index.js';
import { generateMsgId } from '../utils/helpers.js';

export function createPlayerMessage(
  sender: Player,
  text: string,
  channel: ChatChannel,
  isMod = false,
): ChatMessage {
  return {
    id: generateMsgId(),
    senderId: sender.id,
    senderName: sender.name,
    text: text.trim().slice(0, 400),
    timestamp: Date.now(),
    channel,
    isSystem: false,
    seat: sender.seat,
    isMod,
  };
}

export function createSystemMessage(text: string, channel: ChatChannel = 'room'): ChatMessage {
  return {
    id: generateMsgId(),
    senderId: 'system',
    senderName: 'VOID',
    text,
    timestamp: Date.now(),
    channel,
    isSystem: true,
  };
}

export function addMessage(room: Room, msg: ChatMessage): void {
  if (msg.channel === 'mafia') {
    room.mafiaChat.push(msg);
    if (room.mafiaChat.length > 200) room.mafiaChat.shift();
  } else if (msg.channel === 'dead') {
    room.deadChat.push(msg);
    if (room.deadChat.length > 200) room.deadChat.shift();
  } else if (msg.channel === 'spectator') {
    room.spectatorChat.push(msg);
    if (room.spectatorChat.length > 200) room.spectatorChat.shift();
  } else {
    room.chat.push(msg);
    if (room.chat.length > 400) room.chat.shift();
  }
}

/** Validate chat permissions. Returns error string or null. */
export function validateChat(
  room: Room,
  player: Player,
  channel: ChatChannel,
): string | null {
  const { phase } = room;

  // Spectator channel: only spectators can use it
  if (channel === 'spectator') {
    if (!player.isSpectator) return 'Spectator chat is only for spectators.';
    return null;
  }

  // Spectators cannot use any other channel
  if (player.isSpectator) return 'Spectators can only use the spectator chat.';

  if (channel === 'mafia') {
    if (player.team !== 'mafia') return 'Mafia chat is restricted.';
    if (phase !== 'night') return 'Mafia chat is only available at night.';
    return null;
  }

  if (channel === 'dead') {
    if (player.isAlive) return 'Dead chat is only for eliminated players.';
    return null;
  }

  // Room channel
  if (!player.isAlive) return 'Eliminated players cannot speak in room chat.';
  if (phase === 'night') return 'No talking during the night.';
  return null;
}
