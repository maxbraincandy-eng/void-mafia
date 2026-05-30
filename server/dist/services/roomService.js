import { generateId, generateRoomCode, nameToAvatar } from '../utils/helpers.js';
// ── In-Memory Store ───────────────────────────────────────────────────
const rooms = new Map();
// ── Default Settings ──────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 60,
    roleRevealDuration: 8,
    allowDoctorSelfHeal: true,
    tieVoteRule: 'no_elimination',
    minPlayers: 4,
    roles: {
        mafia: 2,
        don: 0,
        sheriff: 1,
        doctor: 1,
        maniac: 0,
        jester: 0,
    },
};
// ── CRUD ──────────────────────────────────────────────────────────────
export function createRoom(hostSocketId, hostName, settings) {
    const id = generateId();
    const code = generateRoomCode();
    const hostPlayer = {
        id: generateId(),
        name: hostName.trim().slice(0, 24) || 'Player',
        avatar: nameToAvatar(hostName),
        socketId: hostSocketId,
        isHost: true,
        isAlive: true,
        isConnected: true,
        isReady: false,
        role: null,
        team: null,
        voteTarget: null,
        hasActedThisPhase: false,
        seat: 1,
        joinedAt: Date.now(),
    };
    const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...(settings || {}),
        roles: { ...DEFAULT_SETTINGS.roles, ...(settings?.roles || {}) },
    };
    const room = {
        id,
        code,
        hostId: hostPlayer.id,
        phase: 'lobby',
        players: new Map([[hostPlayer.id, hostPlayer]]),
        day: 0,
        timer: 0,
        maxTimer: 0,
        chat: [],
        mafiaChat: [],
        nightActions: new Map(),
        votes: new Map(),
        killedLastNight: [],
        savedLastNight: false,
        winner: null,
        settings: mergedSettings,
        createdAt: Date.now(),
    };
    rooms.set(id, room);
    return room;
}
export function getRoom(id) {
    return rooms.get(id);
}
export function getRoomByCode(code) {
    for (const room of rooms.values()) {
        if (room.code === code.toUpperCase().trim())
            return room;
    }
    return undefined;
}
export function deleteRoom(id) {
    rooms.delete(id);
}
export function addPlayer(room, socketId, name) {
    // Re-join: find existing player by name (reconnect scenario)
    for (const player of room.players.values()) {
        if (player.name === name.trim()) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
    }
    if (room.phase !== 'lobby')
        throw new Error('Game already started — cannot join.');
    if (room.players.size >= 16)
        throw new Error('Room is full (max 16 players).');
    const seat = getNextSeat(room);
    const player = {
        id: generateId(),
        name: name.trim().slice(0, 24) || 'Player',
        avatar: nameToAvatar(name),
        socketId,
        isHost: false,
        isAlive: true,
        isConnected: true,
        isReady: false,
        role: null,
        team: null,
        voteTarget: null,
        hasActedThisPhase: false,
        seat,
        joinedAt: Date.now(),
    };
    room.players.set(player.id, player);
    return player;
}
export function removePlayer(room, playerId) {
    const player = room.players.get(playerId);
    if (!player)
        return;
    if (room.phase === 'lobby') {
        room.players.delete(playerId);
        reassignSeats(room);
        // Re-assign host if needed
        if (player.isHost && room.players.size > 0) {
            const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
            next.isHost = true;
            room.hostId = next.id;
        }
    }
    else {
        // During game, mark as disconnected but keep in room
        player.isConnected = false;
        player.socketId = '';
    }
}
export function getPlayerBySocket(room, socketId) {
    for (const p of room.players.values()) {
        if (p.socketId === socketId)
            return p;
    }
    return undefined;
}
export function getHostPlayer(room) {
    return room.players.get(room.hostId);
}
export function getAlivePlayers(room) {
    return [...room.players.values()].filter(p => p.isAlive);
}
// ── Public View Builder ───────────────────────────────────────────────
export function toPublicRoom(room, viewerPlayerId) {
    const isGameOver = room.phase === 'game_over';
    const viewer = room.players.get(viewerPlayerId);
    const isMafia = viewer?.team === 'mafia';
    const players = [...room.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.isHost,
        isAlive: p.isAlive,
        isConnected: p.isConnected,
        isReady: p.isReady,
        // Role is revealed: a) to the player themselves, b) game over, c) dead players
        role: (p.id === viewerPlayerId || isGameOver || !viewer?.isAlive) ? p.role : null,
        team: (p.id === viewerPlayerId || isGameOver || !viewer?.isAlive) ? p.team : null,
        voteTarget: room.phase === 'voting' ? p.voteTarget : null,
        hasActed: p.hasActedThisPhase,
        seat: p.seat,
    }));
    return {
        id: room.id,
        code: room.code,
        phase: room.phase,
        day: room.day,
        timer: room.timer,
        maxTimer: room.maxTimer,
        players,
        chat: room.chat.slice(-100),
        mafiaChat: isMafia ? room.mafiaChat.slice(-100) : [],
        killedLastNight: room.killedLastNight,
        savedLastNight: room.savedLastNight,
        winner: room.winner,
        settings: room.settings,
    };
}
// ── Helpers ───────────────────────────────────────────────────────────
function getNextSeat(room) {
    const used = new Set([...room.players.values()].map(p => p.seat));
    let seat = 1;
    while (used.has(seat))
        seat++;
    return seat;
}
function reassignSeats(room) {
    const sorted = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    sorted.forEach((p, i) => { p.seat = i + 1; });
}
export function getAllRooms() {
    return [...rooms.values()];
}
//# sourceMappingURL=roomService.js.map