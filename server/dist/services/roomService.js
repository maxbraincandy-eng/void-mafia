import { DEFAULT_DYNAMIC_EVENTS, } from '../types/index.js';
import { generateId, generateRoomCode, nameToAvatar } from '../utils/helpers.js';
// ── In-Memory Store ───────────────────────────────────────────────────
const rooms = new Map();
// ── Default Spectator Queue Settings ─────────────────────────────────
export const DEFAULT_SPECTATOR_QUEUE = {
    enabled: true,
    allowSpectatorsToQueue: true,
    autoPromoteOnNextRound: true,
};
// ── Default Settings ──────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 60,
    roleRevealDuration: 8,
    speechDuration: 45,
    allowDoctorSelfHeal: true,
    tieVoteRule: 'no_elimination',
    minPlayers: 4,
    isPrivate: false,
    password: '',
    startWithNight: false,
    rotatingSpeech: false,
    trialDefense: { enabled: false, secondsPerCandidate: 30 },
    dynamicEvents: DEFAULT_DYNAMIC_EVENTS,
    spectatorQueue: DEFAULT_SPECTATOR_QUEUE,
    roles: {
        mafia: 0,
        don: 0,
        sheriff: 0,
        doctor: 0,
        bodyguard: 0,
        spy: 0,
        vigilante: 0,
        escort: 0,
        maniac: 0,
        jester: 0,
        cult_leader: 0,
        veteran: 0,
        tracker: 0,
        arsonist: 0,
        mayor: 0,
        yakuza: 0,
        shogun: 0,
    },
};
// ── CRUD ──────────────────────────────────────────────────────────────
export function createRoom(hostSocketId, hostName, profileId, settings, clanId) {
    const id = generateId();
    const code = generateRoomCode();
    const hostPlayer = {
        id: generateId(),
        name: hostName.trim().slice(0, 24) || 'Player',
        avatar: nameToAvatar(hostName),
        avatarUrl: null,
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
        profileId,
        isSpectator: false,
        isQueuedNextRound: false,
        queuePosition: null,
        lastWill: null,
        isModerator: false,
        moderatorLevel: null,
        deathType: null,
        foulCount: 0,
    };
    const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...(settings || {}),
        spectatorQueue: {
            ...DEFAULT_SPECTATOR_QUEUE,
            ...(settings?.spectatorQueue || {}),
        },
        roles: { ...DEFAULT_SETTINGS.roles, ...(settings?.roles || {}) },
        dynamicEvents: settings?.dynamicEvents
            ? {
                ...DEFAULT_SETTINGS.dynamicEvents,
                ...settings.dynamicEvents,
                allowed: { ...DEFAULT_SETTINGS.dynamicEvents.allowed, ...(settings.dynamicEvents.allowed ?? {}) },
            }
            : DEFAULT_SETTINGS.dynamicEvents,
        trialDefense: settings?.trialDefense
            ? { ...DEFAULT_SETTINGS.trialDefense, ...settings.trialDefense }
            : DEFAULT_SETTINGS.trialDefense,
    };
    const room = {
        id,
        code,
        hostId: hostPlayer.id,
        phase: 'lobby',
        players: new Map([[hostPlayer.id, hostPlayer]]),
        nextRoundQueue: [],
        day: 0,
        timer: 0,
        maxTimer: 0,
        chat: [],
        mafiaChat: [],
        deadChat: [],
        nightActions: new Map(),
        votes: new Map(),
        killedLastNight: [],
        savedLastNight: false,
        winner: null,
        settings: mergedSettings,
        speechOrder: [],
        currentSpeakerIdx: 0,
        daySkipVotes: [],
        createdAt: Date.now(),
        isPaused: false,
        dousedPlayers: new Set(),
        newlyConvertedCultists: [],
        spectateQueue: [],
        spectatorChat: [],
        startedAt: 0,
        mafiaKillTarget: null,
        nominations: new Map(),
        tribunalCandidates: [],
        deathSpeakerId: null,
        finalWordsReason: null,
        pendingWinner: null,
        activeFoul: null,
        trialDefenseState: null,
        speechStartSeat: 0,
        clanId: clanId ?? null,
        clanRoom: !!clanId,
        activeEvent: null,
        eventsLog: [],
        lastDoctorTarget: null,
        gameTimeline: [],
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
export function addPlayer(room, socketId, name, profileId) {
    // Re-join: find existing player by profileId or name (active players)
    for (const player of room.players.values()) {
        if (profileId && player.profileId === profileId) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
        if (!profileId && player.name === name.trim()) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
    }
    // Re-join: check next-round queue
    for (const player of room.nextRoundQueue) {
        if (profileId && player.profileId === profileId) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
        if (!profileId && player.name === name.trim()) {
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
        avatarUrl: null,
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
        profileId,
        isSpectator: false,
        isQueuedNextRound: false,
        queuePosition: null,
        lastWill: null,
        isModerator: false,
        moderatorLevel: null,
        deathType: null,
        foulCount: 0,
    };
    room.players.set(player.id, player);
    return player;
}
/** Add a spectator-only player (no seat, no role). Can later queue for next round. */
export function addSpectatorPlayer(room, socketId, name, profileId) {
    // Re-join check
    for (const player of room.players.values()) {
        if (profileId && player.profileId === profileId) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
        if (!profileId && player.name === name.trim()) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
    }
    // Also check queue
    for (const player of room.nextRoundQueue) {
        if (profileId && player.profileId === profileId) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
        if (!profileId && player.name === name.trim()) {
            player.socketId = socketId;
            player.isConnected = true;
            return player;
        }
    }
    const player = {
        id: generateId(),
        name: name.trim().slice(0, 24) || 'Player',
        avatar: nameToAvatar(name),
        avatarUrl: null,
        socketId,
        isHost: false,
        isAlive: false,
        isConnected: true,
        isReady: false,
        role: null,
        team: null,
        voteTarget: null,
        hasActedThisPhase: false,
        seat: 0,
        joinedAt: Date.now(),
        profileId,
        isSpectator: true,
        isQueuedNextRound: false,
        queuePosition: null,
        lastWill: null,
        isModerator: false,
        moderatorLevel: null,
        deathType: null,
        foulCount: 0,
    };
    room.players.set(player.id, player);
    return player;
}
/**
 * Move a spectator into the next-round queue.
 * Returns the assigned queue position (1-based).
 */
export function enqueueForNextRound(room, playerId) {
    const player = room.players.get(playerId);
    if (!player)
        throw new Error('Player not found.');
    if (!player.isSpectator)
        throw new Error('Only spectators can join the queue.');
    if (player.isQueuedNextRound)
        throw new Error('Already in queue.');
    const activePlayers = [...room.players.values()].filter(p => !p.isSpectator && !p.isQueuedNextRound);
    if (activePlayers.length + room.nextRoundQueue.length >= 16) {
        throw new Error('Queue is full — no available seats for next round.');
    }
    const position = room.nextRoundQueue.length + 1;
    player.isQueuedNextRound = true;
    player.queuePosition = position;
    room.nextRoundQueue.push(player);
    return position;
}
/**
 * Remove a player from the next-round queue and re-number remaining positions.
 */
export function dequeueFromNextRound(room, playerId) {
    const idx = room.nextRoundQueue.findIndex(p => p.id === playerId);
    if (idx === -1)
        throw new Error('Player is not in the queue.');
    const player = room.nextRoundQueue[idx];
    player.isQueuedNextRound = false;
    player.queuePosition = null;
    room.nextRoundQueue.splice(idx, 1);
    room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
}
/**
 * Promote queued players to active slots at the start of a new round.
 */
export function promoteQueuedPlayers(room) {
    const activePlayers = [...room.players.values()].filter(p => !p.isSpectator && !p.isQueuedNextRound);
    const freeSlots = 16 - activePlayers.length;
    if (freeSlots <= 0 || room.nextRoundQueue.length === 0)
        return [];
    const toPromote = room.nextRoundQueue.splice(0, Math.min(freeSlots, room.nextRoundQueue.length));
    for (const player of toPromote) {
        player.isSpectator = false;
        player.isQueuedNextRound = false;
        player.queuePosition = null;
        player.isAlive = true;
        player.seat = getNextSeat(room);
    }
    room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
    return toPromote;
}
export function removePlayer(room, playerId) {
    const queueIdx = room.nextRoundQueue.findIndex(p => p.id === playerId);
    if (queueIdx !== -1) {
        room.nextRoundQueue[queueIdx].isQueuedNextRound = false;
        room.nextRoundQueue[queueIdx].queuePosition = null;
        room.nextRoundQueue.splice(queueIdx, 1);
        room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
    }
    const player = room.players.get(playerId);
    if (!player)
        return;
    if (room.phase === 'lobby') {
        room.players.delete(playerId);
        reassignSeats(room);
        if (player.isHost && room.players.size > 0) {
            const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
            next.isHost = true;
            room.hostId = next.id;
        }
    }
    else {
        player.isConnected = false;
        player.socketId = '';
    }
}
export function transferHost(room, newHostId) {
    const newHost = room.players.get(newHostId);
    if (!newHost)
        throw new Error('Player not found.');
    if (newHost.isSpectator)
        throw new Error('Cannot make a spectator the host.');
    const current = room.players.get(room.hostId);
    if (current)
        current.isHost = false;
    newHost.isHost = true;
    room.hostId = newHostId;
}
export function getPlayerBySocket(room, socketId) {
    for (const p of room.players.values()) {
        if (p.socketId === socketId)
            return p;
    }
    for (const p of room.nextRoundQueue) {
        if (p.socketId === socketId)
            return p;
    }
    return undefined;
}
export function getPlayerByProfile(room, profileId) {
    for (const p of room.players.values()) {
        if (p.profileId === profileId)
            return p;
    }
    for (const p of room.nextRoundQueue) {
        if (p.profileId === profileId)
            return p;
    }
    return undefined;
}
export function getHostPlayer(room) {
    return room.players.get(room.hostId);
}
export function getAlivePlayers(room) {
    return [...room.players.values()].filter(p => p.isAlive && !p.isSpectator);
}
// ── Public View Builder ───────────────────────────────────────────────
export function toPublicRoom(room, viewerPlayerId) {
    const isGameOver = room.phase === 'game_over';
    // Viewer may be in active players OR in next-round queue
    const viewer = room.players.get(viewerPlayerId) ?? room.nextRoundQueue.find(p => p.id === viewerPlayerId);
    const isMafia = viewer?.team === 'mafia';
    const isCultLeader = viewer?.role === 'cult_leader';
    const isYakuza = viewer?.team === 'yakuza';
    const isViewerSpectatorOrQueued = viewer ? (viewer.isSpectator || viewer.isQueuedNextRound) : false;
    const mapToPublic = (p) => ({
        id: p.id,
        socketId: p.socketId,
        name: p.name,
        avatar: p.avatar,
        avatarUrl: p.avatarUrl,
        isHost: p.isHost,
        isAlive: p.isAlive,
        isConnected: p.isConnected,
        isReady: p.isReady,
        role: (p.id === viewerPlayerId || isGameOver || isViewerSpectatorOrQueued) ? p.role : null,
        team: (p.id === viewerPlayerId || isGameOver || isViewerSpectatorOrQueued) ? p.team : null,
        // Mafia sees fellow mafia roles
        ...(isMafia && p.team === 'mafia' ? { role: p.role, team: p.team } : {}),
        // Cult leader sees all cult members
        ...(isCultLeader && p.team === 'cult' ? { role: p.role, team: p.team } : {}),
        // Yakuza team members see each other
        ...(isYakuza && p.team === 'yakuza' ? { role: p.role, team: p.team } : {}),
        voteTarget: (room.phase === 'voting' && room.activeEvent?.key !== 'anonymous_voting') ? p.voteTarget : null,
        hasActed: p.id === viewerPlayerId ? p.hasActedThisPhase : false,
        seat: p.seat,
        profileId: p.profileId,
        isModerator: p.isModerator,
        moderatorLevel: p.moderatorLevel,
        isSpectator: p.isSpectator,
        isQueuedNextRound: p.isQueuedNextRound,
        queuePosition: p.queuePosition,
        deathType: p.deathType,
        foulCount: p.foulCount ?? 0,
    });
    const players = [...room.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map(mapToPublic);
    const nextRoundQueue = room.nextRoundQueue.map(mapToPublic);
    const isDeadViewer = viewer ? (!viewer.isAlive || viewer.isSpectator || viewer.isQueuedNextRound) : false;
    return {
        id: room.id,
        code: room.code,
        phase: room.phase,
        day: room.day,
        timer: room.timer,
        maxTimer: room.maxTimer,
        players,
        nextRoundQueue,
        chat: room.chat.slice(-100),
        mafiaChat: isMafia ? room.mafiaChat.slice(-100) : [],
        deadChat: isDeadViewer && !viewer?.isSpectator ? room.deadChat.slice(-100) : [],
        spectatorChat: viewer?.isSpectator ? room.spectatorChat.slice(-100) : [],
        killedLastNight: room.killedLastNight,
        savedLastNight: room.savedLastNight,
        winner: room.winner,
        settings: room.settings,
        activeRoleCounts: computeActiveRoleCounts(room),
        currentSpeakerId: room.speechOrder[room.currentSpeakerIdx] ?? null,
        daySkipVoteCount: room.daySkipVotes.length,
        spectatorCount: [...room.players.values()].filter(p => p.isSpectator).length,
        isPaused: room.isPaused,
        nominations: Object.fromEntries(room.nominations),
        tribunalCandidates: room.tribunalCandidates,
        deathSpeakerId: room.deathSpeakerId ?? null,
        finalWordsReason: room.finalWordsReason ?? null,
        activeFoul: room.activeFoul ?? null,
        trialDefenseState: room.trialDefenseState ?? null,
        clanId: room.clanId,
        clanRoom: room.clanRoom,
        activeEvent: room.activeEvent,
        mafiaVotes: isMafia && room.phase === 'night'
            ? (() => {
                const votes = {};
                for (const action of room.nightActions.values()) {
                    if (action.role !== 'mafia' && action.role !== 'don')
                        continue;
                    const voter = room.players.get(action.actorId);
                    const target = room.players.get(action.targetId);
                    if (voter && target) {
                        votes[action.actorId] = { voterName: voter.name, targetName: target.name };
                    }
                }
                return votes;
            })()
            : null,
    };
}
export function toRoomListItem(room) {
    const host = room.players.get(room.hostId);
    return {
        id: room.id,
        code: room.code,
        playerCount: room.players.size,
        phase: room.phase,
        createdAt: room.createdAt,
        hostName: host?.name ?? 'Unknown',
        isPrivate: room.settings.isPrivate ?? false,
    };
}
function computeActiveRoleCounts(room) {
    const counts = {};
    if (room.phase === 'lobby') {
        for (const [role, count] of Object.entries(room.settings.roles)) {
            if (count > 0)
                counts[role] = count;
        }
    }
    else {
        for (const p of room.players.values()) {
            if (!p.isSpectator && !p.isQueuedNextRound && p.role) {
                counts[p.role] = (counts[p.role] ?? 0) + 1;
            }
        }
    }
    return counts;
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
export function setPlayerAvatarUrl(room, profileId, avatarUrl) {
    for (const p of room.players.values()) {
        if (p.profileId === profileId)
            p.avatarUrl = avatarUrl;
    }
    for (const p of room.nextRoundQueue) {
        if (p.profileId === profileId)
            p.avatarUrl = avatarUrl;
    }
}
// ── Rematch: reset room to lobby keeping players ───────────────────────
export function rematchRoom(room) {
    room.phase = 'lobby';
    room.day = 0;
    room.timer = 0;
    room.maxTimer = 0;
    room.nightActions = new Map();
    room.votes = new Map();
    room.chat = [];
    room.mafiaChat = [];
    room.deadChat = [];
    room.killedLastNight = [];
    room.savedLastNight = false;
    room.winner = null;
    room.speechOrder = [];
    room.currentSpeakerIdx = 0;
    room.daySkipVotes = [];
    room.isPaused = false;
    room.dousedPlayers = new Set();
    room.newlyConvertedCultists = [];
    room.startedAt = 0;
    room.nominations = new Map();
    room.tribunalCandidates = [];
    room.deathSpeakerId = null;
    room.finalWordsReason = null;
    room.activeFoul = null;
    room.pendingWinner = null;
    room.activeFoul = null;
    room.trialDefenseState = null;
    room.activeEvent = null;
    room.eventsLog = [];
    room.lastDoctorTarget = null;
    room.gameTimeline = [];
    // Promote queued spectators to active lobby
    promoteQueuedPlayers(room);
    for (const p of room.players.values()) {
        p.role = null;
        p.team = null;
        p.voteTarget = null;
        p.hasActedThisPhase = false;
        if (!p.isSpectator) {
            p.isAlive = true;
        }
        p.isReady = false;
        p.lastWill = null;
        p.deathType = null;
        p.foulCount = 0;
    }
}
//# sourceMappingURL=roomService.js.map