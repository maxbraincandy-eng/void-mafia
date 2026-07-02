import { buildRoleDeck, buildAutoRoleDeck, buildDonModeRoleDeck, validateRoleDistribution, getTeam, isSuspiciousToSheriff, getRole } from './roleService.js';
import { getAlivePlayers } from './roomService.js';
import { tryTriggerEvent, setRoomEvent, clearRoomEvent } from './dynamicEventService.js';
// ── Start Game ────────────────────────────────────────────────────────
export function startGame(room) {
    const allPlayers = [...room.players.values()];
    // Don mode with a წამყვანი: the moderator does not receive a role and is
    // excluded from the 10-player deck (spectates with skip privileges).
    const modId = room.settings.donMode && room.settings.donModerator
        ? room.donModeratorId : null;
    const moderator = modId ? room.players.get(modId) ?? null : null;
    const activePlayers = allPlayers.filter(p => !p.isSpectator && p.id !== modId);
    const count = activePlayers.length;
    if (count < room.settings.minPlayers) {
        throw new Error(`Need at least ${room.settings.minPlayers} players to start.`);
    }
    // Don Mode player count validation — spec: exactly 10 players (excl. moderator).
    if (room.settings.donMode) {
        if (count !== 10) {
            throw new Error('დონის კარტი მოითხოვს ზუსტად 10 მოთამაშეს' + (moderator ? ' (წამყვანის გარდა)' : ''));
        }
    }
    for (const p of allPlayers) {
        if (p.isSpectator || p.id === modId) {
            p.isAlive = false;
            p.role = null;
            p.team = null;
        }
    }
    let deck;
    if (room.settings.donMode) {
        deck = buildDonModeRoleDeck(count);
    }
    else {
        const r = room.settings.roles;
        const mafiaTotal = (r.mafia ?? 0) + (r.don ?? 0);
        const yakuzaTotal = (r.yakuza ?? 0) + (r.shogun ?? 0);
        if (mafiaTotal === 0 && yakuzaTotal === 0) {
            deck = buildAutoRoleDeck(count);
        }
        else {
            validateRoleDistribution(count, room.settings);
            deck = buildRoleDeck(room.settings, count);
        }
    }
    activePlayers.sort((a, b) => a.seat - b.seat);
    activePlayers.forEach((player, i) => {
        const role = deck[i];
        player.role = role;
        player.team = getTeam(role);
        player.isAlive = true;
        player.hasActedThisPhase = false;
        player.voteTarget = null;
        player.foulCount = 0;
    });
    room.day = 1;
    room.winner = null;
    room.killedLastNight = [];
    room.savedLastNight = false;
    room.chat = [];
    room.mafiaChat = [];
    room.dousedPlayers = new Set();
    room.newlyConvertedCultists = [];
    room.activeFoul = null;
    room.trialDefenseState = null;
    room.donModeState = room.settings.donMode
        ? {
            planningNightCompleted: false,
            donCheckTargetId: null,
            donCheckResult: null,
            donCheckDone: false,
            sheriffCheckTargetId: null,
            sheriffCheckResult: null,
            sheriffCheckDone: false,
            mafiaKillVotes: {},
            tieCandidates: [],
            defenseQueue: [],
            currentDefenseIdx: 0,
            doubleEliminationVotes: {},
            executeQueue: [],
        }
        : null;
}
const MORNING_DURATION = 30;
// ── Set Phase ─────────────────────────────────────────────────────────
export function setPhase(room, phase) {
    room.phase = phase;
    // Clear old event unless it's a silentDay persisting through speech
    const keepSilentDay = phase === 'speech' && room.activeEvent?.key === 'silent_day';
    if (!keepSilentDay)
        clearRoomEvent(room);
    for (const p of room.players.values()) {
        p.hasActedThisPhase = false;
        if (phase === 'voting')
            p.voteTarget = null;
    }
    switch (phase) {
        case 'night': {
            room.nightActions = new Map();
            room.killedLastNight = [];
            room.savedLastNight = false;
            room.newlyConvertedCultists = [];
            room.mafiaKillTarget = null;
            const nightEvent = tryTriggerEvent(room, 'night');
            if (nightEvent)
                setRoomEvent(room, nightEvent);
            room.timer = room.settings.nightDuration;
            room.maxTimer = room.settings.nightDuration;
            break;
        }
        case 'morning':
            room.timer = MORNING_DURATION;
            room.maxTimer = MORNING_DURATION;
            break;
        case 'day': {
            room.nominations = new Map();
            room.tribunalCandidates = [];
            const dayEvent = tryTriggerEvent(room, 'day');
            if (dayEvent)
                setRoomEvent(room, dayEvent);
            room.timer = room.settings.dayDuration;
            room.maxTimer = room.settings.dayDuration;
            room.daySkipVotes = [];
            break;
        }
        case 'speech': {
            room.nominations = new Map();
            room.tribunalCandidates = [];
            const alivePlayers = [...room.players.values()]
                .filter(p => p.isAlive && !p.isSpectator)
                .sort((a, b) => a.seat - b.seat);
            let startIdx = 0;
            if (room.settings.rotatingSpeech && room.day > 1) {
                // Find the first alive player whose seat is strictly after speechStartSeat (wrap around)
                const afterIdx = alivePlayers.findIndex(p => p.seat > room.speechStartSeat);
                startIdx = afterIdx >= 0 ? afterIdx : 0;
            }
            else {
                // Day 1 (or non-rotating): random start
                startIdx = Math.floor(Math.random() * alivePlayers.length);
            }
            // Rotate the array so the chosen player is first, preserving seat order after them
            const rotated = [
                ...alivePlayers.slice(startIdx),
                ...alivePlayers.slice(0, startIdx),
            ];
            room.speechOrder = rotated.map(p => p.id);
            room.speechStartSeat = rotated[0]?.seat ?? 0;
            room.currentSpeakerIdx = 0;
            // Don mode spec: each individual speech is exactly 1 minute.
            const speechDur = room.settings.donMode ? 60 : room.settings.speechDuration;
            room.timer = speechDur;
            room.maxTimer = speechDur;
            break;
        }
        case 'trial_defense': {
            // Timer per candidate is set when trialDefenseState is initialized
            const spc = room.settings.trialDefense?.secondsPerCandidate ?? 30;
            room.timer = spc;
            room.maxTimer = spc;
            break;
        }
        case 'voting': {
            room.tribunalCandidates = [...new Set(room.nominations.values())];
            room.votes = new Map();
            const voteEvent = tryTriggerEvent(room, 'voting');
            if (voteEvent)
                setRoomEvent(room, voteEvent);
            room.timer = room.settings.voteDuration;
            room.maxTimer = room.settings.voteDuration;
            break;
        }
        case 'final_words': {
            const fwEvent = tryTriggerEvent(room, 'final_words');
            if (fwEvent)
                setRoomEvent(room, fwEvent);
            // Don mode spec: the dead player gets a 1-minute final speech.
            const duration = room.settings.donMode ? 60 : (room.activeEvent?.key === 'extended_final_words' ? 45 : 30);
            room.timer = duration;
            room.maxTimer = duration;
            break;
        }
        case 'role_reveal':
            room.timer = 3;
            room.maxTimer = 3;
            break;
        case 'game_over':
            room.timer = 0;
            room.maxTimer = 0;
            room._gameOverAt = Date.now();
            break;
        // ── Don Mode phases ──────────────────────────────────────────────
        case 'planning_night': {
            const dur = room.settings.planningNightDuration ?? 60;
            room.timer = dur;
            room.maxTimer = dur;
            if (room.donModeState)
                room.donModeState.planningNightCompleted = false;
            break;
        }
        case 'don_check': {
            if (room.donModeState) {
                room.donModeState.donCheckTargetId = null;
                room.donModeState.donCheckResult = null;
                room.donModeState.donCheckDone = false;
            }
            room.timer = 30;
            room.maxTimer = 30;
            break;
        }
        case 'mafia_kill': {
            if (room.donModeState)
                room.donModeState.mafiaKillVotes = {};
            room.killedLastNight = [];
            room.savedLastNight = false;
            room.mafiaKillTarget = null;
            room.timer = room.settings.nightDuration;
            room.maxTimer = room.settings.nightDuration;
            break;
        }
        case 'sheriff_check': {
            if (room.donModeState) {
                room.donModeState.sheriffCheckTargetId = null;
                room.donModeState.sheriffCheckResult = null;
                room.donModeState.sheriffCheckDone = false;
            }
            room.timer = 30;
            room.maxTimer = 30;
            break;
        }
        case 'tie_defense': {
            if (room.donModeState)
                room.donModeState.currentDefenseIdx = 0;
            // Don mode spec: tied players get 30s each for a final defense.
            room.timer = 30;
            room.maxTimer = 30;
            break;
        }
        case 'revote': {
            room.votes = new Map();
            for (const p of room.players.values())
                p.voteTarget = null;
            room.timer = room.settings.voteDuration;
            room.maxTimer = room.settings.voteDuration;
            break;
        }
        case 'double_elim_vote': {
            if (room.donModeState)
                room.donModeState.doubleEliminationVotes = {};
            for (const p of room.players.values())
                p.hasActedThisPhase = false;
            room.timer = 30;
            room.maxTimer = 30;
            break;
        }
    }
}
// ── Advance Phase ─────────────────────────────────────────────────────
export function advancePhase(room) {
    if (room.winner) {
        setPhase(room, 'game_over');
        return 'game_over';
    }
    switch (room.phase) {
        case 'role_reveal':
            if (checkWin(room)) {
                setPhase(room, 'game_over');
                return 'game_over';
            }
            if (room.settings.donMode) {
                setPhase(room, 'planning_night');
                return 'planning_night';
            }
            if (!room.settings.startWithNight) {
                setPhase(room, 'day');
                return 'day';
            }
            setPhase(room, 'night');
            return 'night';
        case 'morning':
            // morning phase is no longer entered by the engine; this branch is a safety fallback only
            console.warn('[GameEngine] WARNING: morning phase was triggered (should not happen after engine fix)');
            room.day++;
            setPhase(room, 'day');
            return 'day';
        case 'night': {
            console.log('[GameEngine] phase transition: night -> resolving night actions');
            resolveNight(room);
            // Check win immediately (before final_words) — if kills end the game, go straight to game_over.
            if (checkWin(room)) {
                console.log('[GameEngine] phase transition: night -> game_over (win condition met)');
                setPhase(room, 'game_over');
                return 'game_over';
            }
            // If anyone died AND game isn't over, give them 30s for final words.
            // Temporarily revive the first victim so they can speak; death is finalized in final_words.
            if (room.killedLastNight.length > 0) {
                const primary = room.killedLastNight[0];
                const dyingPlayer = room.players.get(primary.id);
                if (dyingPlayer) {
                    dyingPlayer.isAlive = true;
                    dyingPlayer.deathType = null;
                }
                room.deathSpeakerId = primary.id;
                room.finalWordsReason = 'night_kill';
                console.log('[GameEngine] phase transition: night -> final_words (night kill, speaker:', primary.id, ')');
                setPhase(room, 'final_words');
                return 'final_words';
            }
            if (checkWin(room)) {
                setPhase(room, 'game_over');
                return 'game_over';
            }
            room.day++;
            setPhase(room, 'day');
            return 'day';
        }
        case 'day':
            setPhase(room, 'speech');
            return 'speech';
        case 'speech': {
            let nextIdx = room.currentSpeakerIdx + 1;
            // Skip slots belonging to players who died mid-round (e.g. foul elimination)
            while (nextIdx < room.speechOrder.length) {
                const sp = room.players.get(room.speechOrder[nextIdx]);
                if (sp?.isAlive && !sp.isSpectator)
                    break;
                nextIdx++;
            }
            if (nextIdx < room.speechOrder.length) {
                room.currentSpeakerIdx = nextIdx;
                const spDur = room.settings.donMode ? 60 : room.settings.speechDuration;
                room.timer = spDur;
                room.maxTimer = spDur;
                return 'speech';
            }
            // All speakers done
            if (room.nominations.size > 0) {
                const candidates = [...new Set(room.nominations.values())].filter(id => {
                    const p = room.players.get(id);
                    return p?.isAlive && !p.isSpectator;
                });
                if (candidates.length > 0) {
                    if (room.settings.donMode) {
                        // Don Mode: go straight to voting (no trial defense)
                        setPhase(room, 'voting');
                        return 'voting';
                    }
                    if (room.settings.trialDefense?.enabled) {
                        room.trialDefenseState = { candidateIds: candidates, currentCandidateIdx: 0 };
                        setPhase(room, 'trial_defense');
                        return 'trial_defense';
                    }
                    setPhase(room, 'voting');
                    return 'voting';
                }
            }
            // No nominations — skip to night or don_check
            if (room.settings.donMode) {
                return enterDonNight(room);
            }
            setPhase(room, 'night');
            return 'night';
        }
        case 'trial_defense': {
            if (!room.trialDefenseState) {
                setPhase(room, 'voting');
                return 'voting';
            }
            const nextIdx = room.trialDefenseState.currentCandidateIdx + 1;
            // Skip over dead/spectator candidates
            const { candidateIds } = room.trialDefenseState;
            let validIdx = nextIdx;
            while (validIdx < candidateIds.length) {
                const p = room.players.get(candidateIds[validIdx]);
                if (p?.isAlive && !p.isSpectator)
                    break;
                validIdx++;
            }
            if (validIdx < candidateIds.length) {
                room.trialDefenseState.currentCandidateIdx = validIdx;
                const spc = room.settings.trialDefense?.secondsPerCandidate ?? 30;
                room.timer = spc;
                room.maxTimer = spc;
                return 'trial_defense';
            }
            // All candidates done — move to voting
            room.trialDefenseState = null;
            setPhase(room, 'voting');
            return 'voting';
        }
        case 'voting': {
            // resolveVotes sets room.deathSpeakerId + room.finalWordsReason as a side effect.
            // announceVoteResult in socket.ts calls it first; this call is safe when called again.
            if (!room.deathSpeakerId)
                resolveVotes(room);
            // Don Mode: detect tie → go to tie_defense instead of no-elim
            if (room.settings.donMode && !room.deathSpeakerId && room.donModeState) {
                const candidates = room.tribunalCandidates.filter(id => {
                    const p = room.players.get(id);
                    return p?.isAlive && !p.isSpectator;
                });
                const tied = detectDonModeTie(room, candidates);
                if (tied.length >= 2) {
                    room.donModeState.tieCandidates = tied;
                    room.donModeState.defenseQueue = [...tied];
                    room.donModeState.currentDefenseIdx = 0;
                    setPhase(room, 'tie_defense');
                    return 'tie_defense';
                }
            }
            if (room.deathSpeakerId) {
                const testPlayer = room.players.get(room.deathSpeakerId);
                if (testPlayer)
                    testPlayer.isAlive = false;
                const gameEnds = checkWin(room);
                if (testPlayer)
                    testPlayer.isAlive = true;
                if (gameEnds) {
                    if (testPlayer) {
                        testPlayer.isAlive = false;
                        testPlayer.deathType = 'vote';
                    }
                    room.deathSpeakerId = null;
                    room.finalWordsReason = null;
                    setPhase(room, 'game_over');
                    return 'game_over';
                }
                setPhase(room, 'final_words');
                return 'final_words';
            }
            if (checkWin(room)) {
                setPhase(room, 'game_over');
                return 'game_over';
            }
            if (room.settings.donMode) {
                return enterDonNight(room);
            }
            setPhase(room, 'night');
            return 'night';
        }
        case 'final_words': {
            // Finalize the deferred death
            const dyingId = room.deathSpeakerId;
            const reason = room.finalWordsReason;
            room.deathSpeakerId = null;
            room.finalWordsReason = null;
            console.log('[GameEngine] phase transition: final_words finished, reason:', reason, 'player:', dyingId);
            if (dyingId) {
                const dying = room.players.get(dyingId);
                if (dying) {
                    dying.isAlive = false;
                    dying.deathType = reason === 'night_kill' ? 'night' : reason === 'foul_death' ? 'foul' : 'vote';
                }
            }
            // Apply any Jester win that was deferred until after final words
            if (room.pendingWinner) {
                room.winner = room.pendingWinner;
                room.pendingWinner = null;
            }
            if (checkWin(room)) {
                console.log('[GameEngine] phase transition: final_words -> game_over (win condition met)');
                setPhase(room, 'game_over');
                return 'game_over';
            }
            // Don mode Execute-Both: chain to the next executed player's final speech.
            if (room.donModeState?.executeQueue.length) {
                const nextId = room.donModeState.executeQueue.shift();
                room.deathSpeakerId = nextId;
                room.finalWordsReason = 'vote_elimination';
                setPhase(room, 'final_words');
                return 'final_words';
            }
            if (reason === 'night_kill' || reason === 'foul_death') {
                room.day++;
                if (room.settings.donMode) {
                    setPhase(room, 'speech'); // Don Mode: individual speeches next day
                    return 'speech';
                }
                setPhase(room, 'day');
                return 'day';
            }
            // vote_elimination
            if (room.settings.donMode) {
                return enterDonNight(room); // Don Mode: night begins
            }
            setPhase(room, 'night');
            return 'night';
        }
        // ── Don Mode phases ──────────────────────────────────────────────
        case 'planning_night': {
            if (room.donModeState)
                room.donModeState.planningNightCompleted = true;
            // Start Day 1 individual speeches (speech phase, nominations allowed from day 1)
            setPhase(room, 'speech');
            return 'speech';
        }
        case 'don_check': {
            // Don check is done (or timed out) — move to mafia kill selection
            setPhase(room, 'mafia_kill');
            return 'mafia_kill';
        }
        case 'mafia_kill': {
            // Kill target is locked in, but the Sheriff still investigates before the
            // night is resolved/announced (spec night order: Don → kill → Sheriff → resolve).
            return enterSheriffCheck(room);
        }
        case 'sheriff_check': {
            // Sheriff has acted (or timed out) — now resolve the mafia kill.
            return resolveDonNight(room);
        }
        case 'tie_defense': {
            if (!room.donModeState) {
                setPhase(room, 'revote');
                return 'revote';
            }
            const nextIdx = room.donModeState.currentDefenseIdx + 1;
            let validIdx = nextIdx;
            while (validIdx < room.donModeState.defenseQueue.length) {
                const p = room.players.get(room.donModeState.defenseQueue[validIdx]);
                if (p?.isAlive && !p.isSpectator)
                    break;
                validIdx++;
            }
            if (validIdx < room.donModeState.defenseQueue.length) {
                room.donModeState.currentDefenseIdx = validIdx;
                room.timer = 30; // spec: 30s per tied candidate
                room.maxTimer = 30;
                return 'tie_defense';
            }
            // All done → revote
            room.tribunalCandidates = room.donModeState.tieCandidates.filter(id => {
                const p = room.players.get(id);
                return p?.isAlive && !p.isSpectator;
            });
            setPhase(room, 'revote');
            return 'revote';
        }
        case 'revote': {
            if (!room.donModeState) {
                return enterDonNight(room);
            }
            // Detect winner or tie
            const revoteResult = resolveDonModeRevote(room);
            if (revoteResult === 'winner' && room.deathSpeakerId) {
                const testPlayer = room.players.get(room.deathSpeakerId);
                if (testPlayer)
                    testPlayer.isAlive = false;
                const gameEnds = checkWin(room);
                if (testPlayer)
                    testPlayer.isAlive = true;
                if (gameEnds) {
                    if (testPlayer) {
                        testPlayer.isAlive = false;
                        testPlayer.deathType = 'vote';
                    }
                    room.deathSpeakerId = null;
                    room.finalWordsReason = null;
                    setPhase(room, 'game_over');
                    return 'game_over';
                }
                setPhase(room, 'final_words');
                return 'final_words';
            }
            if (revoteResult === 'tie') {
                // Second tie — double elimination vote
                setPhase(room, 'double_elim_vote');
                return 'double_elim_vote';
            }
            // No elimination
            room.donModeState.tieCandidates = [];
            return enterDonNight(room);
        }
        case 'double_elim_vote': {
            if (room.donModeState) {
                const votes = Object.values(room.donModeState.doubleEliminationVotes);
                const yesCount = votes.filter(v => v).length;
                const noCount = votes.filter(v => !v).length;
                const executed = room.donModeState.tieCandidates.filter(id => room.players.get(id)?.isAlive);
                room.donModeState.tieCandidates = [];
                // Execute Both wins (yes > no): each executed player gets a 1-min final
                // speech (spec), sequentially, then the game continues to the night.
                // Release Both (no >= yes): both remain in the game.
                if (yesCount > noCount && executed.length > 0) {
                    room.donModeState.executeQueue = executed.slice(1);
                    room.deathSpeakerId = executed[0];
                    room.finalWordsReason = 'vote_elimination';
                    setPhase(room, 'final_words');
                    return 'final_words';
                }
                if (checkWin(room)) {
                    setPhase(room, 'game_over');
                    return 'game_over';
                }
            }
            return enterDonNight(room);
        }
        default:
            return room.phase;
    }
}
// ── Don Mode Helpers ──────────────────────────────────────────────────
/** Detect a voting tie in Don Mode. Returns tied player IDs or [] if no tie. */
function detectDonModeTie(room, candidateIds) {
    const counts = new Map();
    for (const [voterId, targetId] of room.votes.entries()) {
        if (!targetId)
            continue;
        if (candidateIds.length > 0 && !candidateIds.includes(targetId))
            continue;
        const voter = room.players.get(voterId);
        const weight = voter?.role === 'mayor' ? 2 : 1;
        counts.set(targetId, (counts.get(targetId) ?? 0) + weight);
    }
    if (counts.size === 0)
        return [];
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const topCount = sorted[0][1];
    if (sorted.length >= 2 && sorted[1][1] === topCount) {
        return sorted.filter(([, c]) => c === topCount).map(([id]) => id);
    }
    return [];
}
/** Resolve a Don Mode revote (between tieCandidates only). Sets deathSpeakerId on winner. */
function resolveDonModeRevote(room) {
    if (!room.donModeState)
        return 'no_elim';
    const candidates = room.donModeState.tieCandidates.filter(id => {
        const p = room.players.get(id);
        return p?.isAlive && !p.isSpectator;
    });
    const tied = detectDonModeTie(room, candidates);
    if (tied.length >= 2) {
        room.donModeState.tieCandidates = tied;
        return 'tie';
    }
    // Find top vote-getter among candidates
    const counts = new Map();
    for (const [voterId, targetId] of room.votes.entries()) {
        if (!targetId || !candidates.includes(targetId))
            continue;
        const voter = room.players.get(voterId);
        counts.set(targetId, (counts.get(targetId) ?? 0) + (voter?.role === 'mayor' ? 2 : 1));
    }
    if (counts.size === 0)
        return 'no_elim';
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const winnerId = sorted[0][0];
    const winner = room.players.get(winnerId);
    if (!winner || !winner.isAlive)
        return 'no_elim';
    room.deathSpeakerId = winnerId;
    room.finalWordsReason = 'vote_elimination';
    room.donModeState.tieCandidates = [];
    return 'winner';
}
/** Resolve Don Mode mafia kill — requires ALL alive mafia to choose the same target. */
function resolveDonModeKill(room) {
    if (!room.donModeState)
        return;
    const aliveMafia = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator && p.team === 'mafia');
    const votes = room.donModeState.mafiaKillVotes;
    const allVoted = aliveMafia.length > 0 && aliveMafia.every(p => votes[p.id]);
    if (!allVoted) {
        room.killedLastNight = [];
        room.mafiaKillTarget = null;
        return;
    }
    const choices = aliveMafia.map(p => votes[p.id]);
    const allSame = choices.every(t => t === choices[0]);
    if (!allSame) {
        room.killedLastNight = [];
        room.mafiaKillTarget = null;
        return;
    }
    const targetId = choices[0];
    const target = room.players.get(targetId);
    if (!target || !target.isAlive) {
        room.killedLastNight = [];
        room.mafiaKillTarget = null;
        return;
    }
    room.mafiaKillTarget = targetId;
    target.isAlive = false;
    target.deathType = 'night';
    room.killedLastNight = [{ id: targetId, name: target.name, lastWill: target.lastWill ?? null }];
}
/** Begin a Don-mode night: the Don's sheriff-check comes first — but if the Don
 *  is dead, skip straight to the mafia kill selection. */
function enterDonNight(room) {
    const donAlive = [...room.players.values()].some(p => p.isAlive && !p.isSpectator && p.role === 'don');
    if (donAlive) {
        setPhase(room, 'don_check');
        return 'don_check';
    }
    setPhase(room, 'mafia_kill');
    return 'mafia_kill';
}
/** After the mafia kill selection, the Sheriff investigates — unless there is no
 *  living Sheriff, in which case the night is resolved immediately. */
function enterSheriffCheck(room) {
    const sheriffAlive = [...room.players.values()].some(p => p.isAlive && !p.isSpectator && p.role === 'sheriff');
    if (sheriffAlive) {
        setPhase(room, 'sheriff_check');
        return 'sheriff_check';
    }
    return resolveDonNight(room);
}
/** Resolve the Don-mode night: apply the (unanimous) mafia kill, check for a win,
 *  then move to the victim's 1-minute last word or straight into the next day. */
function resolveDonNight(room) {
    resolveDonModeKill(room);
    if (checkWin(room)) {
        setPhase(room, 'game_over');
        return 'game_over';
    }
    if (room.killedLastNight.length > 0) {
        const primary = room.killedLastNight[0];
        const dying = room.players.get(primary.id);
        if (dying) {
            dying.isAlive = true;
            dying.deathType = null;
        }
        room.deathSpeakerId = primary.id;
        room.finalWordsReason = 'night_kill';
        setPhase(room, 'final_words');
        return 'final_words';
    }
    room.day++;
    setPhase(room, 'speech');
    return 'speech';
}
// ── Night Resolution ──────────────────────────────────────────────────
export function resolveNight(room) {
    const allActions = [...room.nightActions.values()];
    // Escort roleblocks
    const escortBlocked = new Set(allActions.filter(a => a.role === 'escort').map(a => a.targetId));
    // Effective actions (escort's own action counts; blocked players' actions do not)
    const actions = allActions.filter(a => a.role === 'escort' || !escortBlocked.has(a.actorId));
    // Doctor saves
    const savedByDoctor = new Set(actions.filter(a => a.role === 'doctor').map(a => a.targetId));
    // Bodyguard protections: targetId → bodyguardId
    const bodyguardProtects = new Map(actions.filter(a => a.role === 'bodyguard').map(a => [a.targetId, a.actorId]));
    room.killedLastNight = [];
    room.savedLastNight = false;
    room.newlyConvertedCultists = [];
    // ── Veteran alerts ───────────────────────────────────────────────────
    const alertedVeterans = new Set(actions.filter(a => a.role === 'veteran' && a.actorId === a.targetId).map(a => a.actorId));
    // Anyone (in effective actions) who visited an alerted veteran dies
    const veteranKillTargets = new Set();
    for (const action of actions) {
        if (alertedVeterans.has(action.targetId) && action.actorId !== action.targetId) {
            veteranKillTargets.add(action.actorId);
        }
    }
    for (const killId of veteranKillTargets) {
        const victim = room.players.get(killId);
        if (victim && victim.isAlive) {
            victim.isAlive = false;
            victim.deathType = 'night';
            room.killedLastNight.push({ id: killId, name: victim.name, lastWill: victim.lastWill ?? null });
        }
    }
    // ── Cult leader recruits ─────────────────────────────────────────────
    for (const action of actions) {
        if (action.role !== 'cult_leader')
            continue;
        const target = room.players.get(action.targetId);
        if (!target || !target.isAlive || target.team === 'cult')
            continue;
        // Convert target to cultist
        target.role = 'cultist';
        target.team = 'cult';
        room.newlyConvertedCultists.push(target.id);
    }
    // ── Arsonist actions ─────────────────────────────────────────────────
    for (const action of actions) {
        if (action.role !== 'arsonist')
            continue;
        if (action.actorId === action.targetId) {
            // Ignite: kill all currently doused players
            for (const dousedId of room.dousedPlayers) {
                const doused = room.players.get(dousedId);
                if (!doused || !doused.isAlive)
                    continue;
                if (savedByDoctor.has(dousedId)) {
                    room.savedLastNight = true;
                    continue;
                }
                doused.isAlive = false;
                doused.deathType = 'night';
                room.killedLastNight.push({ id: dousedId, name: doused.name, lastWill: doused.lastWill ?? null });
            }
            room.dousedPlayers.clear();
        }
        else {
            // Douse the target
            room.dousedPlayers.add(action.targetId);
        }
    }
    // ── Standard kill intents ────────────────────────────────────────────
    // Mafia collective kill — majority consensus required.
    // If Mafia members vote for different targets, Don breaks a tie; otherwise no kill.
    {
        const mafiaVotes = actions.filter(a => a.role === 'mafia' || a.role === 'don').map(a => a.targetId);
        if (mafiaVotes.length === 1) {
            room.mafiaKillTarget = mafiaVotes[0];
        }
        else if (mafiaVotes.length > 1) {
            const counts = new Map();
            for (const t of mafiaVotes)
                counts.set(t, (counts.get(t) ?? 0) + 1);
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            const [topId, topCount] = sorted[0];
            if (sorted.length === 1 || sorted[1][1] < topCount) {
                room.mafiaKillTarget = topId;
            }
            else {
                // Tied vote: Don's choice breaks the tie
                const donVote = actions.find(a => a.role === 'don')?.targetId;
                room.mafiaKillTarget = donVote ?? null;
            }
        }
    }
    const mafiaKills = room.mafiaKillTarget ? [room.mafiaKillTarget] : [];
    const maniacKills = actions.filter(a => a.role === 'maniac').map(a => a.targetId);
    const vigilanteKills = actions.filter(a => a.role === 'vigilante').map(a => a.targetId);
    const yakuzaKills = actions.filter(a => a.role === 'yakuza').map(a => a.targetId);
    // Skip veteran-alerted targets (veteran kills them already; or veteran is immune while on alert)
    const killIntents = [...mafiaKills, ...maniacKills, ...vigilanteKills, ...yakuzaKills].filter(id => !alertedVeterans.has(id));
    for (const targetId of killIntents) {
        const target = room.players.get(targetId);
        if (!target || !target.isAlive)
            continue;
        if (savedByDoctor.has(targetId)) {
            room.savedLastNight = true;
            continue;
        }
        const bodyguardId = bodyguardProtects.get(targetId);
        if (bodyguardId) {
            const bodyguard = room.players.get(bodyguardId);
            if (bodyguard && bodyguard.isAlive) {
                bodyguard.isAlive = false;
                bodyguard.deathType = 'night';
                room.killedLastNight.push({ id: bodyguardId, name: bodyguard.name, lastWill: bodyguard.lastWill ?? null });
                room.savedLastNight = true;
                continue;
            }
        }
        target.isAlive = false;
        target.deathType = 'night';
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
    const isSelfTarget = actor.id === targetId;
    // Veteran goes on alert by self-targeting
    if (actor.role === 'veteran') {
        if (!isSelfTarget)
            throw new Error('To go on alert, target yourself.');
        room.nightActions.set(actor.id, { actorId: actor.id, targetId, role: actor.role, submittedAt: Date.now() });
        actor.hasActedThisPhase = true;
        return;
    }
    // Arsonist can douse a player OR ignite (self-target)
    if (actor.role === 'arsonist') {
        if (!isSelfTarget && !target.isAlive)
            throw new Error('Cannot douse an eliminated player.');
        room.nightActions.set(actor.id, { actorId: actor.id, targetId, role: actor.role, submittedAt: Date.now() });
        actor.hasActedThisPhase = true;
        return;
    }
    if (!target.isAlive)
        throw new Error('Cannot target an eliminated player.');
    // Doctor/bodyguard self-target validation
    if ((actor.role === 'doctor' || actor.role === 'bodyguard') && isSelfTarget && !room.settings.allowDoctorSelfHeal) {
        throw new Error('Self-protection is disabled in this room.');
    }
    // Doctor Pressure: cannot protect same target as last night
    if (actor.role === 'doctor' && room.activeEvent?.key === 'doctor_pressure' && room.lastDoctorTarget && room.lastDoctorTarget === targetId) {
        throw new Error('Doctor Pressure — you cannot protect the same player two nights in a row.');
    }
    // Mafia cannot kill fellow mafia (self-kill allowed if setting enabled)
    if ((actor.role === 'mafia' || actor.role === 'don') && target.team === 'mafia') {
        if (isSelfTarget && room.settings.mafiaCanSelfKill) {
            // allowed — fall through
        }
        else {
            throw new Error('You cannot target a fellow mafia member.');
        }
    }
    // Vigilante cannot target themselves
    if (actor.role === 'vigilante' && isSelfTarget)
        throw new Error('You cannot target yourself.');
    // Escort cannot target themselves
    if (actor.role === 'escort' && isSelfTarget)
        throw new Error('You cannot target yourself.');
    // Cult leader cannot recruit cult members or self
    if (actor.role === 'cult_leader') {
        if (isSelfTarget)
            throw new Error('You cannot recruit yourself.');
        if (target.team === 'cult')
            throw new Error('Already a cult member.');
    }
    // Yakuza cannot target fellow yakuza (Shogun is an ally)
    if (actor.role === 'yakuza' && target.team === 'yakuza') {
        throw new Error('You cannot target a fellow Yakuza member.');
    }
    room.nightActions.set(actor.id, {
        actorId: actor.id,
        targetId,
        role: actor.role,
        submittedAt: Date.now(),
    });
    actor.hasActedThisPhase = true;
    // Track doctor's target for doctorPressure event next night
    if (actor.role === 'doctor') {
        room.lastDoctorTarget = targetId;
    }
}
export function getInvestigationResult(room, actor) {
    const action = room.nightActions.get(actor.id);
    if (!action)
        return null;
    const target = room.players.get(action.targetId);
    if (!target)
        return null;
    // Blackout Night: no investigation result returned
    if (room.activeEvent?.key === 'blackout_night')
        return null;
    if (!target.role)
        return null;
    // Sheriff Fog: 40% chance of incorrect result
    let correct = isSuspiciousToSheriff(target.role);
    if (room.activeEvent?.key === 'sheriff_fog' && Math.random() < 0.4) {
        correct = !correct;
    }
    return {
        targetId: target.id,
        targetName: target.name,
        result: correct ? 'suspicious' : 'not_suspicious',
    };
}
export function getTrackResult(room, actor) {
    const action = room.nightActions.get(actor.id);
    if (!action)
        return null;
    const tracked = room.players.get(action.targetId);
    if (!tracked)
        return null;
    const trackedAction = room.nightActions.get(tracked.id);
    const visited = trackedAction ? room.players.get(trackedAction.targetId) : null;
    return {
        trackedName: tracked.name,
        visitedName: visited?.name ?? null,
    };
}
// ── Nomination ────────────────────────────────────────────────────────
/** Submit actions for Don Mode special phases */
export function submitDonCheck(room, actor, targetId) {
    if (room.phase !== 'don_check')
        throw new Error('Not Don Check phase.');
    if (actor.role !== 'don')
        throw new Error('Only the Don can perform this check.');
    if (!actor.isAlive)
        throw new Error('You are eliminated.');
    if (!room.donModeState)
        throw new Error('Don Mode is not active.');
    if (room.donModeState.donCheckDone)
        throw new Error('Don check already performed this night.');
    room.donModeState.donCheckTargetId = targetId;
    room.donModeState.donCheckDone = true;
    if (targetId) {
        const target = room.players.get(targetId);
        if (!target || !target.isAlive)
            throw new Error('Target not found or eliminated.');
        if (target.id === actor.id)
            throw new Error('Cannot check yourself.');
        room.donModeState.donCheckResult = target.role === 'sheriff';
    }
    else {
        room.donModeState.donCheckResult = null; // skipped
    }
}
export function submitSheriffCheck(room, actor, targetId) {
    if (room.phase !== 'sheriff_check')
        throw new Error('Not Sheriff Check phase.');
    if (actor.role !== 'sheriff')
        throw new Error('Only the Sheriff can perform this check.');
    if (!actor.isAlive)
        throw new Error('You are eliminated.');
    if (!room.donModeState)
        throw new Error('Don Mode is not active.');
    if (room.donModeState.sheriffCheckDone)
        throw new Error('Sheriff check already performed this night.');
    room.donModeState.sheriffCheckTargetId = targetId;
    room.donModeState.sheriffCheckDone = true;
    if (targetId) {
        const target = room.players.get(targetId);
        if (!target || !target.isAlive)
            throw new Error('Target not found or eliminated.');
        if (target.id === actor.id)
            throw new Error('Cannot check yourself.');
        // The Don reads innocent; regular Mafia read guilty (isSuspiciousToSheriff).
        room.donModeState.sheriffCheckResult = isSuspiciousToSheriff(target.role);
    }
    else {
        room.donModeState.sheriffCheckResult = null; // skipped
    }
}
export function submitMafiaKillVote(room, actor, targetId) {
    if (room.phase !== 'mafia_kill')
        throw new Error('Not Mafia Kill phase.');
    if (actor.team !== 'mafia')
        throw new Error('Only Mafia team members can vote.');
    if (!actor.isAlive)
        throw new Error('You are eliminated.');
    if (!room.donModeState)
        throw new Error('Don Mode is not active.');
    const target = room.players.get(targetId);
    if (!target || !target.isAlive || target.isSpectator)
        throw new Error('Invalid target.');
    if (target.team === 'mafia')
        throw new Error('Cannot target a fellow Mafia member.');
    room.donModeState.mafiaKillVotes[actor.id] = targetId;
    actor.hasActedThisPhase = true;
}
export function submitDoubleEliminationVote(room, voter, yes) {
    if (room.phase !== 'double_elim_vote')
        throw new Error('Not Double Elimination Vote phase.');
    if (!voter.isAlive || voter.isSpectator)
        throw new Error('Must be an active player.');
    if (!room.donModeState)
        throw new Error('Don Mode is not active.');
    // Spec: players on the tribunal (the tied candidates) cannot vote in this runoff.
    if (room.donModeState.tieCandidates.includes(voter.id))
        throw new Error('Tribunal candidates cannot vote in the runoff.');
    if (voter.hasActedThisPhase)
        throw new Error('Already voted.');
    room.donModeState.doubleEliminationVotes[voter.id] = yes;
    voter.hasActedThisPhase = true;
}
export function allMafiaKillVotesSubmitted(room) {
    if (!room.donModeState)
        return false;
    const aliveMafia = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator && p.team === 'mafia' && !p.isBot);
    return aliveMafia.length > 0 && aliveMafia.every(p => room.donModeState.mafiaKillVotes[p.id]);
}
export function allDoubleElimVotesSubmitted(room) {
    if (!room.donModeState)
        return false;
    const alive = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator && !p.isQueuedNextRound && !p.isBot);
    return alive.length > 0 && alive.every(p => p.hasActedThisPhase);
}
export function submitNomination(room, actor, nomineeId) {
    if (room.phase !== 'speech')
        throw new Error('Nominations are only allowed during speech phase.');
    if (!actor.isAlive)
        throw new Error('Eliminated players cannot nominate.');
    if (actor.isSpectator)
        throw new Error('Spectators cannot nominate.');
    // Don Mode allows nominations from Day 1; normal mode requires Day 2+
    if (!room.settings.donMode && room.day < 2)
        throw new Error('Nominations are not allowed on Day 1.');
    const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx];
    if (actor.id !== currentSpeakerId)
        throw new Error('Only the current speaker may nominate.');
    if (nomineeId === null) {
        room.nominations.delete(actor.id);
        return;
    }
    if (nomineeId === actor.id)
        throw new Error('You cannot nominate yourself.');
    const nominee = room.players.get(nomineeId);
    if (!nominee)
        throw new Error('Player not found.');
    if (!nominee.isAlive)
        throw new Error('Cannot nominate an eliminated player.');
    room.nominations.set(actor.id, nomineeId);
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
        if (room.tribunalCandidates.length > 0 && !room.tribunalCandidates.includes(targetId)) {
            throw new Error('That player was not nominated for tribunal.');
        }
    }
    voter.voteTarget = targetId;
    room.votes.set(voter.id, targetId);
}
export function resolveVotes(room) {
    const counts = new Map();
    const eventMultiplier = room.activeEvent?.key === 'double_vote' ? 2 : 1;
    for (const [voterId, targetId] of room.votes.entries()) {
        if (!targetId)
            continue;
        if (room.tribunalCandidates.length > 0 && !room.tribunalCandidates.includes(targetId))
            continue;
        const voter = room.players.get(voterId);
        const weight = (voter?.role === 'mayor' ? 2 : 1) * eventMultiplier;
        counts.set(targetId, (counts.get(targetId) ?? 0) + weight);
    }
    if (counts.size === 0)
        return null;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = sorted[0];
    if (sorted.length > 1 && sorted[1][1] === topCount) {
        if (room.settings.tieVoteRule === 'no_elimination')
            return null;
        const tied = sorted.filter(([, c]) => c === topCount).map(([id]) => id);
        const winnerId = tied[Math.floor(Math.random() * tied.length)];
        // Queue for final_words; death is finalized by advancePhase 'final_words'
        room.deathSpeakerId = winnerId;
        room.finalWordsReason = 'vote_elimination';
        return winnerId;
    }
    const target = room.players.get(topId);
    if (!target || !target.isAlive)
        return null;
    if (target.role === 'jester') {
        // Jester win is pending — applied after final_words so the player can speak first
        room.pendingWinner = 'neutral';
        room.deathSpeakerId = topId;
        room.finalWordsReason = 'vote_elimination';
        return topId;
    }
    // Queue for final_words; death is finalized by advancePhase 'final_words'
    room.deathSpeakerId = topId;
    room.finalWordsReason = 'vote_elimination';
    return topId;
}
// ── Win Condition ─────────────────────────────────────────────────────
export function checkWin(room) {
    if (room.winner)
        return true;
    const alive = getAlivePlayers(room);
    const mafiaAlive = alive.filter(p => p.team === 'mafia').length;
    const townAlive = alive.filter(p => p.team === 'town').length;
    const cultAlive = alive.filter(p => p.team === 'cult').length;
    const cultLeaderAlive = alive.some(p => p.role === 'cult_leader');
    const neutralAlive = alive.filter(p => p.team === 'neutral').length;
    const yakuzaAlive = alive.filter(p => p.team === 'yakuza').length;
    const yakuzaKillerAlive = alive.some(p => p.role === 'yakuza');
    // Cult win: leader alive and cult outnumbers everyone else
    if (cultLeaderAlive && cultAlive >= mafiaAlive + townAlive + neutralAlive + yakuzaAlive && cultAlive > 0) {
        room.winner = 'cult';
        return true;
    }
    // Maniac/Arsonist solo win: only neutral left (no other threatening factions)
    if (neutralAlive >= 1 && mafiaAlive === 0 && townAlive === 0 && cultAlive === 0 && yakuzaAlive === 0) {
        room.winner = 'neutral';
        return true;
    }
    // Yakuza win: Yakuza team count >= all opposing alive players
    // Shogun alone can also win by final parity (no active killer needed for the last step)
    if (yakuzaAlive > 0 && yakuzaAlive >= mafiaAlive + townAlive + neutralAlive + cultAlive) {
        room.winner = 'yakuza';
        return true;
    }
    // Yakuza faction is completely dead — check remaining factions without yakuza
    // Town wins: all mafia, cult, and yakuza eliminated
    if (mafiaAlive === 0 && cultAlive === 0 && yakuzaAlive === 0) {
        room.winner = 'town';
        return true;
    }
    // Mafia wins: mafia count equals or exceeds all others (including yakuza)
    if (mafiaAlive >= townAlive + neutralAlive + cultAlive + yakuzaAlive) {
        room.winner = 'mafia';
        return true;
    }
    // Suppress unused variable warning — yakuzaKillerAlive is informational only
    void yakuzaKillerAlive;
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
        timeline: [...(room.gameTimeline ?? [])],
    };
}
export function allNightActionsSubmitted(room) {
    const alivePlayers = getAlivePlayers(room);
    const actorsNeeded = alivePlayers.filter(p => {
        if (p.isBot)
            return false;
        if (!p.role)
            return false;
        return getRole(p.role).wakeAtNight;
    });
    return actorsNeeded.every(p => room.nightActions.has(p.id));
}
//# sourceMappingURL=gameService.js.map