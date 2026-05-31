import { buildRoleDeck, getTeam, isSuspiciousToSheriff, getRole } from './roleService.js';
import { getAlivePlayers } from './roomService.js';
// ── Start Game ────────────────────────────────────────────────────────
export function startGame(room) {
    const allPlayers = [...room.players.values()];
    const activePlayers = allPlayers.filter(p => !p.isSpectator);
    const count = activePlayers.length;
    if (count < room.settings.minPlayers) {
        throw new Error(`Need at least ${room.settings.minPlayers} players to start.`);
    }
    // Spectators stay isAlive=false so toPublicRoom's visibility rule lets them see all roles
    for (const p of allPlayers) {
        if (p.isSpectator) {
            p.isAlive = false;
            p.role = null;
            p.team = null;
        }
    }
    const deck = buildRoleDeck(room.settings, count);
    // Sort active players by seat for deterministic role assignment
    activePlayers.sort((a, b) => a.seat - b.seat);
    activePlayers.forEach((player, i) => {
        const role = deck[i];
        player.role = role;
        player.team = getTeam(role);
        player.isAlive = true;
        player.hasActedThisPhase = false;
        player.voteTarget = null;
    });
    room.day = 1;
    room.winner = null;
    room.killedLastNight = [];
    room.savedLastNight = false;
    room.chat = [];
    room.mafiaChat = [];
}
// ── Set Phase ─────────────────────────────────────────────────────────
export function setPhase(room, phase) {
    room.phase = phase;
    // Reset per-phase state
    for (const p of room.players.values()) {
        p.hasActedThisPhase = false;
        if (phase === 'voting')
            p.voteTarget = null;
    }
    switch (phase) {
        case 'night':
            room.nightActions = new Map();
            room.killedLastNight = [];
            room.savedLastNight = false;
            room.timer = room.settings.nightDuration;
            room.maxTimer = room.settings.nightDuration;
            break;
        case 'day':
            room.timer = room.settings.dayDuration;
            room.maxTimer = room.settings.dayDuration;
            room.daySkipVotes = [];
            break;
        case 'speech': {
            // Build ordered list of alive non-spectator players by seat
            const alivePlayers = [...room.players.values()]
                .filter(p => p.isAlive && !p.isSpectator)
                .sort((a, b) => a.seat - b.seat);
            room.speechOrder = alivePlayers.map(p => p.id);
            room.currentSpeakerIdx = 0;
            room.timer = room.settings.speechDuration;
            room.maxTimer = room.settings.speechDuration;
            break;
        }
        case 'voting':
            room.votes = new Map();
            room.timer = room.settings.voteDuration;
            room.maxTimer = room.settings.voteDuration;
            break;
        case 'role_reveal':
            room.timer = room.settings.roleRevealDuration;
            room.maxTimer = room.settings.roleRevealDuration;
            break;
        case 'game_over':
            room.timer = 0;
            room.maxTimer = 0;
            break;
    }
}
// ── Advance Phase ─────────────────────────────────────────────────────
/** Called when a phase timer expires OR host skips. Returns next phase after mutation. */
export function advancePhase(room) {
    switch (room.phase) {
        case 'role_reveal':
            setPhase(room, 'day');
            return 'day';
        case 'night':
            resolveNight(room);
            if (checkWin(room)) {
                setPhase(room, 'game_over');
                return 'game_over';
            }
            setPhase(room, 'day');
            room.day++;
            return 'day';
        case 'day':
            setPhase(room, 'speech');
            return 'speech';
        case 'speech': {
            const nextIdx = room.currentSpeakerIdx + 1;
            if (nextIdx < room.speechOrder.length) {
                room.currentSpeakerIdx = nextIdx;
                room.timer = room.settings.speechDuration;
                room.maxTimer = room.settings.speechDuration;
                return 'speech';
            }
            setPhase(room, 'voting');
            return 'voting';
        }
        case 'voting':
            resolveVotes(room);
            if (checkWin(room)) {
                setPhase(room, 'game_over');
                return 'game_over';
            }
            setPhase(room, 'night');
            return 'night';
        default:
            return room.phase;
    }
}
// ── Night Resolution ──────────────────────────────────────────────────
export function resolveNight(room) {
    const allActions = [...room.nightActions.values()];
    // Escort roleblocks: the escorted player's action is cancelled
    const escortBlocked = new Set(allActions.filter(a => a.role === 'escort').map(a => a.targetId));
    // Effective actions: escort's own action counts, blocked players' actions do not
    const actions = allActions.filter(a => a.role === 'escort' || !escortBlocked.has(a.actorId));
    // Doctor saves
    const savedByDoctor = new Set(actions.filter(a => a.role === 'doctor').map(a => a.targetId));
    // Bodyguard protections: targetId → bodyguardId
    const bodyguardProtects = new Map(actions.filter(a => a.role === 'bodyguard').map(a => [a.targetId, a.actorId]));
    // Kill intents: mafia + don + maniac + vigilante
    const mafiaKills = actions
        .filter(a => a.role === 'mafia' || a.role === 'don')
        .map(a => a.targetId);
    const maniacKills = actions
        .filter(a => a.role === 'maniac')
        .map(a => a.targetId);
    const vigilanteKills = actions
        .filter(a => a.role === 'vigilante')
        .map(a => a.targetId);
    const allKillIntents = [...mafiaKills, ...maniacKills, ...vigilanteKills];
    room.killedLastNight = [];
    room.savedLastNight = false;
    for (const targetId of allKillIntents) {
        const target = room.players.get(targetId);
        if (!target || !target.isAlive)
            continue;
        // Doctor saved → target lives
        if (savedByDoctor.has(targetId)) {
            room.savedLastNight = true;
            continue;
        }
        // Bodyguard protected → bodyguard dies, target lives
        const bodyguardId = bodyguardProtects.get(targetId);
        if (bodyguardId) {
            const bodyguard = room.players.get(bodyguardId);
            if (bodyguard && bodyguard.isAlive) {
                bodyguard.isAlive = false;
                room.killedLastNight.push({ id: bodyguardId, name: bodyguard.name, lastWill: bodyguard.lastWill ?? null });
                room.savedLastNight = true;
                continue;
            }
        }
        // No protection → target dies
        target.isAlive = false;
        room.killedLastNight.push({ id: targetId, name: target.name, lastWill: target.lastWill ?? null });
    }
}
// ── Night Action ──────────────────────────────────────────────────────
export function submitNightAction(room, actor, targetId) {
    if (room.phase !== 'night')
        throw new Error('Not night phase.');
    if (!actor.isAlive)
        throw new Error('You have been eliminated.');
    if (!actor.role || !getRole(actor.role).wakeAtNight)
        throw new Error('Your role has no night ability.');
    const target = room.players.get(targetId);
    if (!target)
        throw new Error('Target not found.');
    if (!target.isAlive)
        throw new Error('Cannot target an eliminated player.');
    // Doctor/bodyguard self-target validation
    if ((actor.role === 'doctor' || actor.role === 'bodyguard') && actor.id === targetId && !room.settings.allowDoctorSelfHeal) {
        throw new Error('Self-protection is disabled in this room.');
    }
    // Mafia cannot kill fellow mafia
    if ((actor.role === 'mafia' || actor.role === 'don') && target.team === 'mafia') {
        throw new Error('You cannot target a fellow mafia member.');
    }
    // Vigilante cannot target themselves
    if (actor.role === 'vigilante' && actor.id === targetId) {
        throw new Error('You cannot target yourself.');
    }
    // Escort cannot target themselves
    if (actor.role === 'escort' && actor.id === targetId) {
        throw new Error('You cannot target yourself.');
    }
    room.nightActions.set(actor.id, {
        actorId: actor.id,
        targetId,
        role: actor.role,
        submittedAt: Date.now(),
    });
    actor.hasActedThisPhase = true;
}
export function getInvestigationResult(room, actor) {
    const action = room.nightActions.get(actor.id);
    if (!action)
        return null;
    const target = room.players.get(action.targetId);
    if (!target)
        return null;
    return {
        targetId: target.id,
        targetName: target.name,
        result: isSuspiciousToSheriff(target.role) ? 'suspicious' : 'not_suspicious',
    };
}
// ── Voting ────────────────────────────────────────────────────────────
export function submitVote(room, voter, targetId) {
    if (room.phase !== 'voting')
        throw new Error('Not voting phase.');
    if (!voter.isAlive)
        throw new Error('Eliminated players cannot vote.');
    if (targetId !== null) {
        const target = room.players.get(targetId);
        if (!target)
            throw new Error('Target not found.');
        if (!target.isAlive)
            throw new Error('Cannot vote for an eliminated player.');
        if (target.id === voter.id)
            throw new Error('You cannot vote for yourself.');
    }
    voter.voteTarget = targetId;
    room.votes.set(voter.id, targetId);
}
export function resolveVotes(room) {
    const counts = new Map();
    for (const targetId of room.votes.values()) {
        if (!targetId)
            continue;
        counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    if (counts.size === 0)
        return null;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = sorted[0];
    // Tie check
    if (sorted.length > 1 && sorted[1][1] === topCount) {
        if (room.settings.tieVoteRule === 'no_elimination')
            return null;
        // random: pick one of the tied players
        const tied = sorted.filter(([, c]) => c === topCount).map(([id]) => id);
        const winnerId = tied[Math.floor(Math.random() * tied.length)];
        eliminatePlayer(room, winnerId, true);
        return winnerId;
    }
    const target = room.players.get(topId);
    if (!target || !target.isAlive)
        return null;
    // Jester wins if voted out
    if (target.role === 'jester') {
        target.isAlive = false;
        room.winner = 'neutral';
        return topId;
    }
    eliminatePlayer(room, topId, true);
    return topId;
}
function eliminatePlayer(room, playerId, byVote) {
    const player = room.players.get(playerId);
    if (!player)
        return;
    player.isAlive = false;
}
// ── Win Condition ─────────────────────────────────────────────────────
export function checkWin(room) {
    if (room.winner)
        return true;
    const alive = getAlivePlayers(room);
    const mafiaAlive = alive.filter(p => p.team === 'mafia').length;
    const townAlive = alive.filter(p => p.team === 'town').length;
    const neutralAlive = alive.filter(p => p.team === 'neutral').length;
    // Maniac solo win: only neutral left
    if (neutralAlive >= 1 && mafiaAlive === 0 && townAlive === 0) {
        room.winner = 'neutral';
        return true;
    }
    // Town wins: all mafia eliminated
    if (mafiaAlive === 0) {
        room.winner = 'town';
        return true;
    }
    // Mafia wins: equal to or outnumber town (+neutral)
    if (mafiaAlive >= townAlive + neutralAlive) {
        room.winner = 'mafia';
        return true;
    }
    return false;
}
export function buildGameOverResult(room) {
    const allRoles = {};
    for (const p of room.players.values()) {
        if (p.isSpectator)
            continue;
        allRoles[p.id] = {
            name: p.name,
            role: p.role ?? 'citizen',
            team: p.team ?? 'town',
        };
    }
    return {
        winner: room.winner ?? 'town',
        allRoles,
    };
}
/** Check if all required night actions have been submitted (so we can skip waiting) */
export function allNightActionsSubmitted(room) {
    const alivePlayers = getAlivePlayers(room);
    const actorsNeeded = alivePlayers.filter(p => {
        if (!p.role)
            return false;
        return getRole(p.role).wakeAtNight;
    });
    return actorsNeeded.every(p => room.nightActions.has(p.id));
}
//# sourceMappingURL=gameService.js.map