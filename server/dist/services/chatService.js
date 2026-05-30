import { generateMsgId } from '../utils/helpers.js';
export function createPlayerMessage(sender, text, channel) {
    return {
        id: generateMsgId(),
        senderId: sender.id,
        senderName: sender.name,
        text: text.trim().slice(0, 400),
        timestamp: Date.now(),
        channel,
        isSystem: false,
        seat: sender.seat,
    };
}
export function createSystemMessage(text, channel = 'room') {
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
export function addMessage(room, msg) {
    if (msg.channel === 'mafia') {
        room.mafiaChat.push(msg);
        if (room.mafiaChat.length > 200)
            room.mafiaChat.shift();
    }
    else {
        room.chat.push(msg);
        if (room.chat.length > 400)
            room.chat.shift();
    }
}
/** Validate chat permissions. Returns error string or null. */
export function validateChat(room, player, channel) {
    const { phase } = room;
    if (channel === 'mafia') {
        if (player.team !== 'mafia')
            return 'Mafia chat is restricted.';
        if (phase !== 'night')
            return 'Mafia chat is only available at night.';
        return null;
    }
    if (channel === 'dead') {
        if (player.isAlive)
            return 'Dead chat is only for eliminated players.';
        return null;
    }
    // Room channel
    if (!player.isAlive)
        return 'Eliminated players cannot speak in room chat.';
    if (phase === 'night')
        return 'No talking during the night.';
    return null;
}
//# sourceMappingURL=chatService.js.map