import { generateMsgId } from '../utils/helpers.js';
export function createPlayerMessage(sender, text, channel, isMod = false, extra) {
    return {
        id: generateMsgId(),
        senderId: sender.id,
        senderName: sender.name,
        text: text.trim().slice(0, extra?.type === 'voice' ? 2000000 : 400),
        timestamp: Date.now(),
        channel,
        isSystem: false,
        seat: sender.seat,
        isMod,
        type: extra?.type ?? 'text',
        audioDuration: extra?.audioDuration,
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
    else if (msg.channel === 'yakuza') {
        room.yakuzaChat.push(msg);
        if (room.yakuzaChat.length > 200)
            room.yakuzaChat.shift();
    }
    else if (msg.channel === 'dead') {
        room.deadChat.push(msg);
        if (room.deadChat.length > 200)
            room.deadChat.shift();
    }
    else if (msg.channel === 'spectator') {
        room.spectatorChat.push(msg);
        if (room.spectatorChat.length > 200)
            room.spectatorChat.shift();
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
    // Spectator channel: only spectators can use it
    if (channel === 'spectator') {
        if (!player.isSpectator)
            return 'Spectator chat is only for spectators.';
        return null;
    }
    // Pre-game lobby: everyone (players and spectators alike) shares the room chat.
    if (phase === 'lobby' && channel === 'room')
        return null;
    // Spectators cannot use any other channel
    if (player.isSpectator)
        return 'Spectators can only use the spectator chat.';
    if (channel === 'mafia') {
        if (player.team !== 'mafia')
            return 'Mafia chat is restricted.';
        if (phase !== 'night')
            return 'Mafia chat is only available at night.';
        return null;
    }
    if (channel === 'yakuza') {
        if (player.team !== 'yakuza')
            return 'Yakuza chat is restricted.';
        if (phase !== 'night')
            return 'Yakuza chat is only available at night.';
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
    switch (phase) {
        case 'day':
        case 'game_over':
            return null;
        case 'speech': {
            const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
            if (player.id !== speakerId)
                return 'Wait for your turn to speak.';
            return null;
        }
        case 'final_words':
            if (player.id !== room.deathSpeakerId)
                return 'Only the eliminated player can speak now.';
            return null;
        default:
            // night, morning, role_reveal, trial_defense, voting: chat stays closed
            return 'Chat is closed during this phase.';
    }
}
//# sourceMappingURL=chatService.js.map