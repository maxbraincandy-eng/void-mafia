import { DEFAULT_DYNAMIC_EVENTS, } from '../types/index.js';
import { generateId, generateRoomCode, nameToAvatar } from '../utils/helpers.js';
import { isVipSync } from './vipService.js';
export function generateVoiceSessionId() {
    return generateId();
}
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
    roleRevealDuration: 3,
    speechDuration: 45,
    allowDoctorSelfHeal: true,
    tieVoteRule: 'no_elimination',
    minPlayers: 4,
    isPrivate: false,
    password: '',
    startWithNight: false,
    rotatingSpeech: true,
    mafiaCanSelfKill: true,
    ranked: true,
    hostSkipPrivilege: false,
    trialDefense: { enabled: false, secondsPerCandidate: 30 },
    dynamicEvents: DEFAULT_DYNAMIC_EVENTS,
    spectatorQueue: DEFAULT_SPECTATOR_QUEUE,
    donMode: false,
    planningNightDuration: 60,
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
export function createRoom(hostSocketId, hostName, profileId, settings, clanId, roomName) {
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
        name: roomName?.trim().slice(0, 30) ?? '',
        hostId: hostPlayer.id,
        phase: 'lobby',
        players: new Map([[hostPlayer.id, hostPlayer]]),
        nextRoundQueue: [],
        day: 0,
        timer: 0,
        maxTimer: 0,
        chat: [],
        mafiaChat: [],
        yakuzaChat: [],
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
        voiceSessionId: generateVoiceSessionId(),
        donModeState: null,
        donModeratorId: null,
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
    // Joining the queue is a public commitment to a seat, so it ends invisible
    // spectating. Otherwise the queue list and the player list would disagree
    // about who is about to sit down.
    player.invisibleSpectator = false;
    player.isQueuedNextRound = true;
    // A verified player enters ahead of everyone without a badge, and behind
    // everyone with one — so the perk is "skip the unverified", never "skip the
    // person who paid before you". Without that second half the queue would
    // reshuffle among VIPs on every join and nobody's position would hold.
    const insertAt = isVipSync(player.profileId)
        ? room.nextRoundQueue.findIndex(p => !isVipSync(p.profileId))
        : -1;
    if (insertAt === -1)
        room.nextRoundQueue.push(player);
    else
        room.nextRoundQueue.splice(insertAt, 0, player);
    room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
    return player.queuePosition;
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
        player.invisibleSpectator = false;
        player.seat = getNextSeat(room);
    }
    room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
    return toPromote;
}
/**
 * Lobby-only: an active player steps out to the spectator bench.
 * Frees their seat number; they keep listening (spectators may always listen).
 */
export function becomeSpectator(room, playerId) {
    const player = room.players.get(playerId);
    if (!player)
        throw new Error('Player not found.');
    if (player.isSpectator)
        return player;
    if (room.donModeratorId === playerId)
        room.donModeratorId = null;
    player.isSpectator = true;
    player.isAlive = false;
    player.isReady = false;
    player.seat = 0;
    player.role = null;
    player.team = null;
    player.voteTarget = null;
    return player;
}
/**
 * Lobby-only: a spectator takes the next free seat and becomes an active player.
 * Clears any next-round queue entry (they're seated now).
 */
export function becomePlayer(room, playerId) {
    const player = room.players.get(playerId);
    if (!player)
        throw new Error('Player not found.');
    if (!player.isSpectator)
        return player;
    const active = [...room.players.values()].filter(p => !p.isSpectator);
    if (active.length >= 16)
        throw new Error('Room is full (max 16 players).');
    const qIdx = room.nextRoundQueue.findIndex(p => p.id === playerId);
    if (qIdx !== -1) {
        room.nextRoundQueue.splice(qIdx, 1);
        room.nextRoundQueue.forEach((p, i) => { p.queuePosition = i + 1; });
    }
    player.isSpectator = false;
    player.isQueuedNextRound = false;
    player.queuePosition = null;
    player.isAlive = true;
    player.isReady = false;
    // Sitting down ends invisibility. The flag only hides spectators, so leaving
    // it set would not hide them — it would just keep showing them the "you are
    // invisible" indicator while everyone can see them.
    player.invisibleSpectator = false;
    player.seat = getNextSeat(room);
    return player;
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
    // Vacate the Don-mode moderator seat if its holder leaves.
    if (room.donModeratorId === playerId)
        room.donModeratorId = null;
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
    // Moderators (and the host running the table) see through the anonymous perk,
    // so a player can't use an alias to dodge moderation.
    const viewerSeesThroughAnon = !!(viewer?.isModerator || viewer?.isHost);
    const mapToPublic = (p) => {
        // Anonymous perk: replace name/avatar for everyone but the player themselves,
        // while the game is live and the viewer isn't a mod. Roles already unlock at
        // game over via isGameOver, and identity unmasks at the same moment.
        //
        // INCOGNITO does not unmask at game over. The perk above is a round-long
        // costume; incognito is "nobody in this room knows who I am", and lifting it
        // on the results screen would answer that question for everyone watching.
        const anon = !!p.anonAlias && p.id !== viewerPlayerId && !viewerSeesThroughAnon
            && (p.incognito || !isGameOver);
        return {
            id: p.id,
            socketId: p.socketId,
            name: anon ? p.anonAlias : p.name,
            avatar: anon ? '🎭' : p.avatar,
            avatarUrl: anon ? null : p.avatarUrl,
            isHost: p.isHost,
            isAlive: p.isAlive,
            isConnected: p.isConnected,
            isReady: p.isReady,
            // Roles are revealed only to the player themselves and once the game is over.
            // Spectators and next-round queued players must NOT see anyone's role mid-game.
            role: (p.id === viewerPlayerId || isGameOver) ? p.role : null,
            team: (p.id === viewerPlayerId || isGameOver) ? p.team : null,
            // Mafia sees fellow mafia roles
            ...(isMafia && p.team === 'mafia' ? { role: p.role, team: p.team } : {}),
            // Cult leader sees all cult members
            ...(isCultLeader && p.team === 'cult' ? { role: p.role, team: p.team } : {}),
            // Yakuza team members see each other
            ...(isYakuza && p.team === 'yakuza' ? { role: p.role, team: p.team } : {}),
            // Votes are SECRET while the tribunal runs: each player only sees their
            // OWN pick; who-voted-for-whom is revealed after voting ends via
            // game:vote_breakdown. hasVoted lets the UI show voting progress.
            voteTarget: (room.phase === 'voting' && p.id === viewerPlayerId) ? p.voteTarget : null,
            hasVoted: room.phase === 'voting' ? !!p.voteTarget : false,
            hasActed: p.id === viewerPlayerId ? p.hasActedThisPhase : false,
            seat: p.seat,
            // The disguise was leaking straight through this field. Name and avatar were
            // replaced, but the real profile id went out untouched — and the client
            // resolves the verification badge, the equipped name colour and the whole
            // profile popup FROM the profile id. An alias with your own blue badge and
            // your own purple name beside it is not a disguise, it is a label.
            // Every client site guards on this being truthy, so null degrades quietly.
            profileId: anon ? null : p.profileId,
            // Same reasoning as profileId: a moderator shield over an alias narrows the
            // room down to a handful of people, and often to one.
            isModerator: anon ? false : p.isModerator,
            moderatorLevel: anon ? null : p.moderatorLevel,
            isSpectator: p.isSpectator,
            isQueuedNextRound: p.isQueuedNextRound,
            queuePosition: p.queuePosition,
            deathType: p.deathType,
            foulCount: p.foulCount ?? 0,
            ...(p.isBot ? { isBot: true } : {}),
            ...(anon ? { isAnon: true } : {}),
            // Self-only: tell the invisible spectator they ARE invisible so the UI can
            // show the indicator + toggle. Never leaked to others (they don't get this
            // row at all — see isHiddenFrom).
            ...(p.id === viewerPlayerId && p.invisibleSpectator ? { invisibleSpectator: true } : {}),
            // Self-only: what the room is calling you. Never on anyone else's row.
            ...(p.id === viewerPlayerId && p.incognito ? { incognito: true, myAlias: p.anonAlias ?? null } : {}),
        };
    };
    // Invisibility perk: an invisible spectator is dropped from the list entirely
    // for every viewer except themselves. They still get full state (they ARE a
    // viewer), they just don't appear in anyone else's player/spectator list.
    const isHiddenFrom = (p) => !!p.invisibleSpectator && p.isSpectator && p.id !== viewerPlayerId;
    const players = [...room.players.values()]
        .filter(p => !isHiddenFrom(p))
        .sort((a, b) => a.seat - b.seat)
        .map(mapToPublic);
    const nextRoundQueue = room.nextRoundQueue.map(mapToPublic);
    const isDeadViewer = viewer ? (!viewer.isAlive || viewer.isSpectator || viewer.isQueuedNextRound) : false;
    return {
        id: room.id,
        code: room.code,
        name: room.name,
        phase: room.phase,
        day: room.day,
        timer: room.timer,
        maxTimer: room.maxTimer,
        players,
        nextRoundQueue,
        chat: room.chat.slice(-100),
        mafiaChat: isMafia ? room.mafiaChat.slice(-100) : [],
        yakuzaChat: isYakuza ? room.yakuzaChat.slice(-100) : [],
        deadChat: isDeadViewer && !viewer?.isSpectator ? room.deadChat.slice(-100) : [],
        spectatorChat: viewer?.isSpectator ? room.spectatorChat.slice(-100) : [],
        killedLastNight: room.killedLastNight,
        savedLastNight: room.savedLastNight,
        winner: room.winner,
        settings: room.settings,
        activeRoleCounts: computeActiveRoleCounts(room),
        currentSpeakerId: room.speechOrder[room.currentSpeakerIdx] ?? null,
        daySkipVoteCount: room.daySkipVotes.length,
        // Invisible spectators are not counted for anyone but themselves — the
        // count must match the list, which hides them.
        spectatorCount: [...room.players.values()].filter(p => p.isSpectator && (!p.invisibleSpectator || p.id === viewerPlayerId)).length,
        isPaused: room.isPaused,
        nominations: Object.fromEntries(room.nominations),
        tribunalCandidates: room.tribunalCandidates,
        deathSpeakerId: room.deathSpeakerId ?? null,
        finalWordsReason: room.finalWordsReason ?? null,
        activeFoul: room.activeFoul ?? null,
        trialDefenseState: room.trialDefenseState ?? null,
        clanId: room.clanId,
        clanRoom: room.clanRoom,
        skin: room.skin ?? null,
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
        donModeState: room.donModeState
            ? {
                tieCandidates: room.donModeState.tieCandidates,
                defenseQueue: room.donModeState.defenseQueue,
                currentDefenseIdx: room.donModeState.currentDefenseIdx,
                doubleElimYes: Object.values(room.donModeState.doubleEliminationVotes).filter(v => v).length,
                doubleElimNo: Object.values(room.donModeState.doubleEliminationVotes).filter(v => !v).length,
                donCheckDone: room.donModeState.donCheckDone,
                sheriffCheckDone: room.donModeState.sheriffCheckDone,
            }
            : null,
        donModeratorId: room.donModeratorId ?? null,
    };
}
export function toRoomListItem(room) {
    const host = room.players.get(room.hostId);
    return {
        id: room.id,
        code: room.code,
        name: room.name,
        // Invisible spectators are excluded here too. This list is public, so
        // leaving them in would let anyone watch the count tick up by one at the
        // exact moment someone vanished from the room's own list.
        playerCount: [...room.players.values()].filter(p => !(p.invisibleSpectator && p.isSpectator)).length,
        phase: room.phase,
        createdAt: room.createdAt,
        hostName: host?.name ?? 'Unknown',
        isPrivate: room.settings.isPrivate ?? false,
        spotlight: room.spotlightUntil != null && room.spotlightUntil > Date.now(),
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
    // The Don-mode წამყვანი sits outside the player order: they always take the
    // last seat so the playing 10 stay numbered 1..10 without gaps.
    const sorted = [...room.players.values()].sort((a, b) => {
        const aMod = a.id === room.donModeratorId ? 1 : 0;
        const bMod = b.id === room.donModeratorId ? 1 : 0;
        if (aMod !== bMod)
            return aMod - bMod;
        return a.joinedAt - b.joinedAt;
    });
    sorted.forEach((p, i) => { p.seat = i + 1; });
}
/** Renumber after the წამყვანი seat changes hands (claim/release). */
export function reseatForDonModerator(room) {
    reassignSeats(room);
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
    room.yakuzaChat = [];
    room.deadChat = [];
    room.spectatorChat = [];
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
    room.trialDefenseState = null;
    room.activeEvent = null;
    room.eventsLog = [];
    room.lastDoctorTarget = null;
    room.gameTimeline = [];
    room.voiceSessionId = generateVoiceSessionId();
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