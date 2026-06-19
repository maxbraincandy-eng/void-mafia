import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches, dealRound, validateCardPlay, resolveTrick, applyRoundScores, finishMatch, } from './services/jokerService.js';
import { addXP } from './services/playerService.js';
import { voiceJoin as jokerVoiceJoin, voiceLeave as jokerVoiceLeave, voiceGetMatchId as jokerVoiceGetMatchId, } from './services/jokerVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const JOKER_ROOM = (id) => `jk:${id}`;
// Per-match turn timers (bot auto-play + 25s human timeout)
const turnTimers = new Map();
function clearTurnTimer(matchId) {
    const t = turnTimers.get(matchId);
    if (t !== undefined) {
        clearTimeout(t);
        turnTimers.delete(matchId);
    }
}
// ── Public state sent to all clients in the room ───────────────────────
function toPublic(match) {
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        settings: match.settings,
        players: match.players.map(p => ({
            id: p.id,
            socketId: p.socketId,
            name: p.name,
            profileId: p.profileId,
            seatIndex: p.seatIndex,
            cardCount: (match.hands[p.id] ?? []).length,
            isBot: p.isBot ?? false,
        })),
        spectatorCount: match.spectatorSocketIds.length,
        botPlayerIds: match.botPlayerIds,
        roundPlan: match.roundPlan,
        currentRoundIndex: match.currentRoundIndex,
        totalRounds: match.roundPlan.length,
        currentDealerSeat: match.currentDealerSeat,
        declarations: match.declarations,
        currentDeclarationSeat: match.currentDeclarationSeat,
        tricksTaken: match.tricksTaken,
        currentTrick: match.currentTrick,
        currentPlaySeat: match.currentPlaySeat,
        scores: match.scores,
        roundHistory: match.roundHistory,
        chat: match.chat.slice(-80),
        winnerPlayerId: match.status === 'finished'
            ? Object.entries(match.scores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
            : null,
    };
}
function toListItem(match) {
    return {
        id: match.id, code: match.code, status: match.status,
        mode: match.settings.mode,
        playerNames: match.players.map(p => p.name),
        playerCount: match.players.length,
        spectatorCount: match.spectatorSocketIds.length,
        createdAt: match.createdAt,
    };
}
// Broadcast public state + each player's private hand
function broadcastState(io, match) {
    io.to(JOKER_ROOM(match.id)).emit('joker:state', toPublic(match));
    for (const player of match.players) {
        const hand = match.hands[player.id] ?? [];
        io.to(player.socketId).emit('joker:hand', hand);
    }
}
// ── Extracted game logic (called by socket handlers AND bot engine) ────
function executeDeclare(io, match, player, tricks) {
    match.declarations[player.id] = tricks;
    match.currentDeclarationSeat = (match.currentDeclarationSeat + 1) % 4;
    const allDeclared = match.players.every(p => match.declarations[p.id] !== null);
    if (allDeclared) {
        match.status = 'playing';
        const firstPlaySeat = (match.currentDealerSeat + 1) % 4;
        match.currentPlaySeat = firstPlaySeat;
        match.currentTrickLeaderSeat = firstPlaySeat;
        match.currentTrick = [];
    }
    match.updatedAt = Date.now();
    broadcastState(io, match);
    scheduleBotAction(io, match);
}
function executePlayCard(io, match, player, card, jokerTarget) {
    const hand = match.hands[player.id] ?? [];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1)
        return;
    hand.splice(cardIndex, 1);
    const played = { playerId: player.id, seatIndex: player.seatIndex, card };
    if (card.suit === 'J' && jokerTarget)
        played.jokerTarget = jokerTarget;
    match.currentTrick.push(played);
    match.currentPlaySeat = (match.currentPlaySeat + 1) % 4;
    match.updatedAt = Date.now();
    if (match.currentTrick.length === 4) {
        const { winnerId, winnerSeat } = resolveTrick(match.currentTrick, match.players);
        match.tricksTaken[winnerId] = (match.tricksTaken[winnerId] ?? 0) + 1;
        broadcastState(io, match);
        setTimeout(() => {
            if (!getMatch(match.id))
                return;
            const anyCardsLeft = match.players.some(p => (match.hands[p.id] ?? []).length > 0);
            if (anyCardsLeft) {
                match.currentTrick = [];
                match.currentTrickLeaderSeat = winnerSeat;
                match.currentPlaySeat = winnerSeat;
                match.updatedAt = Date.now();
                broadcastState(io, match);
                scheduleBotAction(io, match);
            }
            else {
                // Round complete — apply scores then show round_end for 4s
                applyRoundScores(match);
                match.status = 'round_end';
                broadcastState(io, match);
                setTimeout(() => {
                    if (!getMatch(match.id))
                        return;
                    const nextRoundIndex = match.currentRoundIndex + 1;
                    if (nextRoundIndex < match.roundPlan.length) {
                        match.currentRoundIndex = nextRoundIndex;
                        match.currentDealerSeat = (match.currentDealerSeat + 1) % 4;
                        for (const p of match.players) {
                            match.declarations[p.id] = null;
                            match.tricksTaken[p.id] = 0;
                            match.hands[p.id] = [];
                        }
                        dealRound(match);
                        match.status = 'declaration';
                        match.currentDeclarationSeat = (match.currentDealerSeat + 1) % 4;
                        match.currentTrick = [];
                        match.currentTrickLeaderSeat = (match.currentDealerSeat + 1) % 4;
                        match.currentPlaySeat = (match.currentDealerSeat + 1) % 4;
                        match.updatedAt = Date.now();
                        broadcastState(io, match);
                        scheduleBotAction(io, match);
                    }
                    else {
                        finishMatch(match);
                        clearTurnTimer(match.id);
                        broadcastState(io, match);
                        const sortedPlayers = [...match.players].sort((a, b) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0));
                        const winnerPlayer = sortedPlayers[0];
                        for (const p of match.players) {
                            if (p.profileId) {
                                const xp = p.id === winnerPlayer.id ? 30 : 5;
                                addXP(p.profileId, xp).catch(() => { });
                            }
                        }
                        io.emit('joker:list_update', getOpenMatches().map(toListItem));
                    }
                }, 4000);
            }
        }, 1500);
    }
    else {
        broadcastState(io, match);
        scheduleBotAction(io, match);
    }
}
// ── Bot engine ─────────────────────────────────────────────────────────
function scheduleBotAction(io, match) {
    clearTurnTimer(match.id);
    if (match.status !== 'declaration' && match.status !== 'playing')
        return;
    let currentPlayer;
    if (match.status === 'declaration') {
        currentPlayer = match.players.find(p => p.seatIndex === match.currentDeclarationSeat);
    }
    else {
        currentPlayer = match.players.find(p => p.seatIndex === match.currentPlaySeat);
    }
    if (!currentPlayer)
        return;
    const isBot = currentPlayer.isBot === true;
    const delay = isBot ? 1200 : 25000;
    const timer = setTimeout(() => {
        turnTimers.delete(match.id);
        if (!getMatch(match.id))
            return;
        if (!isBot) {
            // Human timed out — promote to bot
            currentPlayer.isBot = true;
            if (!match.botPlayerIds.includes(currentPlayer.id)) {
                match.botPlayerIds.push(currentPlayer.id);
            }
            broadcastState(io, match);
        }
        if (match.status === 'declaration') {
            const cardCount = match.roundPlan[match.currentRoundIndex];
            const decl = Math.floor(Math.random() * (cardCount + 1));
            executeDeclare(io, match, currentPlayer, decl);
        }
        else if (match.status === 'playing') {
            const hand = match.hands[currentPlayer.id] ?? [];
            const valid = hand.filter(c => validateCardPlay(hand, c, match.currentTrick) === null);
            if (valid.length === 0)
                return;
            const card = valid[Math.floor(Math.random() * valid.length)];
            let jokerTarget;
            if (card.suit === 'J') {
                const others = match.players.filter(p => p.id !== currentPlayer.id);
                if (Math.random() > 0.5 && others.length > 0) {
                    jokerTarget = others[Math.floor(Math.random() * others.length)].id;
                }
            }
            executePlayCard(io, match, currentPlayer, card, jokerTarget);
        }
    }, delay);
    turnTimers.set(match.id, timer);
}
// ── Handler Registration ───────────────────────────────────────────────
export function registerJokerHandlers(io, socket) {
    // ── List open matches ──────────────────────────────────────────────
    socket.on('joker:list', (cb) => {
        try {
            cb(ok(getOpenMatches().map(toListItem)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Create match ──────────────────────────────────────────────────
    socket.on('joker:create', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.status !== 'finished') {
                return cb(err('You are already in a Joker match.'));
            }
            const settings = {
                mode: 'classic',
                khishtiPenalty: 200,
                exactBidMultiplier: 50,
                zeroBidExactScore: 50,
                missPenaltyPerTrick: 50,
                bonusEnabled: true,
                spectatorsAllowed: true,
                privateTable: false,
                pulkaBonusPoints: 400,
                ...data?.settings,
            };
            const creatorId = socket.data.profileId ?? socket.id;
            const creator = {
                id: creatorId,
                socketId: socket.id,
                name,
                profileId: socket.data.profileId ?? null,
                seatIndex: 0,
            };
            const match = createMatch(creator, settings);
            socket.join(JOKER_ROOM(match.id));
            io.emit('joker:list_update', getOpenMatches().map(toListItem));
            cb(ok(toPublic(match)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Join match ────────────────────────────────────────────────────
    socket.on('joker:join', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const match = getMatchByCode(data.code ?? '');
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished')
                return cb(err('This match has ended.'));
            const existingPlayer = match.players.find(p => p.socketId === socket.id);
            if (existingPlayer) {
                socket.join(JOKER_ROOM(match.id));
                const hand = match.hands[existingPlayer.id] ?? [];
                socket.emit('joker:hand', hand);
                return cb(ok(toPublic(match)));
            }
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.id !== match.id && existing.status !== 'finished') {
                return cb(err('You are already in another Joker match.'));
            }
            if (match.players.length < 4 && match.status === 'waiting') {
                const nextSeat = match.players.length;
                const playerId = socket.data.profileId ?? socket.id;
                const newPlayer = {
                    id: playerId,
                    socketId: socket.id,
                    name,
                    profileId: socket.data.profileId ?? null,
                    seatIndex: nextSeat,
                };
                match.players.push(newPlayer);
                match.scores[playerId] = 0;
                match.tricksTaken[playerId] = 0;
                match.declarations[playerId] = null;
                match.hands[playerId] = [];
                match.pulkaExacts[playerId] = {};
                match.updatedAt = Date.now();
                socket.join(JOKER_ROOM(match.id));
                broadcastState(io, match);
                io.emit('joker:list_update', getOpenMatches().map(toListItem));
                cb(ok(toPublic(match)));
            }
            else if (match.settings.spectatorsAllowed && !match.spectatorSocketIds.includes(socket.id)) {
                match.spectatorSocketIds.push(socket.id);
                socket.join(JOKER_ROOM(match.id));
                cb(ok(toPublic(match)));
            }
            else {
                cb(err('Cannot join this match.'));
            }
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Start match ───────────────────────────────────────────────────
    socket.on('joker:start', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status !== 'waiting')
                return cb(err('Match is not in waiting state.'));
            if (match.players.length !== 4)
                return cb(err('Need exactly 4 players to start.'));
            const caller = match.players.find(p => p.socketId === socket.id);
            if (!caller)
                return cb(err('You are not a player in this match.'));
            if (caller.seatIndex !== 0)
                return cb(err('Only the host (seat 0) can start the match.'));
            dealRound(match);
            match.status = 'declaration';
            match.currentDeclarationSeat = (match.currentDealerSeat + 1) % 4;
            match.currentTrick = [];
            match.currentTrickLeaderSeat = (match.currentDealerSeat + 1) % 4;
            match.currentPlaySeat = (match.currentDealerSeat + 1) % 4;
            for (const player of match.players) {
                match.declarations[player.id] = null;
                match.tricksTaken[player.id] = 0;
            }
            match.updatedAt = Date.now();
            broadcastState(io, match);
            io.emit('joker:list_update', getOpenMatches().map(toListItem));
            scheduleBotAction(io, match);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Declare ───────────────────────────────────────────────────────
    socket.on('joker:declare', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status !== 'declaration')
                return cb(err('Not in declaration phase.'));
            const player = match.players.find(p => p.socketId === socket.id);
            if (!player)
                return cb(err('You are not a player in this match.'));
            if (player.seatIndex !== match.currentDeclarationSeat) {
                return cb(err('It is not your turn to declare.'));
            }
            const tricks = Number(data.tricks);
            const cardCount = match.roundPlan[match.currentRoundIndex];
            if (!Number.isInteger(tricks) || tricks < 0 || tricks > cardCount) {
                return cb(err(`Declaration must be between 0 and ${cardCount}.`));
            }
            // Human declared — clear bot timer if running
            clearTurnTimer(match.id);
            executeDeclare(io, match, player, tricks);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Play card ─────────────────────────────────────────────────────
    socket.on('joker:play-card', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status !== 'playing')
                return cb(err('Match is not in playing phase.'));
            const player = match.players.find(p => p.socketId === socket.id);
            if (!player)
                return cb(err('You are not a player in this match.'));
            if (player.seatIndex !== match.currentPlaySeat) {
                return cb(err('It is not your turn to play.'));
            }
            const hand = match.hands[player.id] ?? [];
            const validationError = validateCardPlay(hand, data.card, match.currentTrick);
            if (validationError)
                return cb(err(validationError));
            // Validate jokerTarget if provided
            if (data.card.suit === 'J' && data.jokerTarget) {
                const target = match.players.find(p => p.id === data.jokerTarget);
                if (!target)
                    return cb(err('Invalid joker target.'));
            }
            clearTurnTimer(match.id);
            executePlayCard(io, match, player, data.card, data.jokerTarget);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Resign ────────────────────────────────────────────────────────
    socket.on('joker:resign', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            const player = match.players.find(p => p.socketId === socket.id);
            if (!player)
                return cb(err('You are not a player in this match.'));
            if (match.status === 'finished')
                return cb(err('Match is already finished.'));
            clearTurnTimer(match.id);
            finishMatch(match);
            broadcastState(io, match);
            io.emit('joker:list_update', getOpenMatches().map(toListItem));
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Rematch ───────────────────────────────────────────────────────
    socket.on('joker:rematch', (data, cb) => {
        try {
            const old = getMatch(data.matchId);
            if (!old)
                return cb(err('Match not found.'));
            if (old.status !== 'finished')
                return cb(err('Match is still active.'));
            const requester = old.players.find(p => p.socketId === socket.id);
            if (!requester)
                return cb(err('You are not a player in this match.'));
            const creator = { ...old.players[0], isBot: false };
            const nm = createMatch(creator, { ...old.settings });
            for (let i = 1; i < old.players.length; i++) {
                const op = old.players[i];
                const np = { ...op, isBot: false };
                nm.players.push(np);
                nm.scores[np.id] = 0;
                nm.tricksTaken[np.id] = 0;
                nm.declarations[np.id] = null;
                nm.hands[np.id] = [];
                nm.pulkaExacts[np.id] = {};
            }
            nm.updatedAt = Date.now();
            for (const op of old.players) {
                const s = io.sockets.sockets.get(op.socketId);
                if (s) {
                    s.join(JOKER_ROOM(nm.id));
                    s.leave(JOKER_ROOM(old.id));
                }
            }
            broadcastState(io, nm);
            cb(ok({ newMatchId: nm.id, newCode: nm.code }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Leave ─────────────────────────────────────────────────────────
    socket.on('joker:leave', (data, cb) => {
        try {
            const match = getMatch(data?.matchId);
            if (!match)
                return cb(ok(null));
            handleJokerLeave(io, socket.id, match);
            socket.leave(JOKER_ROOM(match.id));
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Chat ──────────────────────────────────────────────────────────
    socket.on('joker:chat', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            const player = match.players.find(p => p.socketId === socket.id);
            const isSpectator = match.spectatorSocketIds.includes(socket.id);
            if (!player && !isSpectator)
                return cb(err('Not in this match.'));
            const text = String(data.text ?? '').trim().slice(0, 300);
            if (!text)
                return cb(err('Empty message.'));
            const senderName = player ? player.name : 'Spectator';
            const senderId = socket.data.profileId ?? socket.id;
            const msg = { senderId, senderName, text, ts: Date.now() };
            match.chat.push(msg);
            if (match.chat.length > 200)
                match.chat = match.chat.slice(-200);
            io.to(JOKER_ROOM(match.id)).emit('joker:chat', msg);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Voice: join ───────────────────────────────────────────────────
    socket.on('joker:voice-join', (data, cb) => {
        try {
            const match = getMatch(data?.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished')
                return cb(err('Match has ended.'));
            const player = match.players.find(p => p.socketId === socket.id);
            const isSpectator = match.spectatorSocketIds.includes(socket.id);
            if (!player && !isSpectator)
                return cb(err('Not in this match.'));
            const name = player?.name ?? 'Spectator';
            const existingPeers = jokerVoiceJoin(match.id, socket.id, name);
            socket.to(JOKER_ROOM(match.id)).emit('joker:voice-peer-joined', {
                socketId: socket.id,
                name,
            });
            const iceConfig = buildIceConfig();
            cb(ok({
                peers: existingPeers,
                iceServers: iceConfig.iceServers,
                iceTransportPolicy: iceConfig.iceTransportPolicy,
                canSpeak: !!player,
            }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Voice: leave ──────────────────────────────────────────────────
    socket.on('joker:voice-leave', (_data, cb) => {
        const matchId = jokerVoiceLeave(socket.id);
        if (matchId) {
            socket.to(JOKER_ROOM(matchId)).emit('joker:voice-peer-left', { socketId: socket.id });
        }
        cb?.(ok(null));
    });
    // ── Voice: WebRTC signalling relay ────────────────────────────────
    socket.on('joker:voice-offer', (data) => {
        io.to(data.to).emit('joker:voice-offer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('joker:voice-answer', (data) => {
        io.to(data.to).emit('joker:voice-answer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('joker:voice-ice', (data) => {
        io.to(data.to).emit('joker:voice-ice', { from: socket.id, candidate: data.candidate });
    });
    // ── Voice: Push-to-Talk state ─────────────────────────────────────
    socket.on('joker:ptt-start', (data) => {
        const match = getMatch(data?.matchId);
        if (!match)
            return;
        const player = match.players.find(p => p.socketId === socket.id);
        if (!player)
            return;
        socket.to(JOKER_ROOM(data.matchId)).emit('joker:ptt-state', { socketId: socket.id, speaking: true });
    });
    socket.on('joker:ptt-stop', (data) => {
        socket.to(JOKER_ROOM(String(data?.matchId))).emit('joker:ptt-state', { socketId: socket.id, speaking: false });
    });
}
// ── Disconnect cleanup ─────────────────────────────────────────────────
export function handleJokerDisconnect(io, socketId) {
    // Voice cleanup
    const voiceMatchId = jokerVoiceGetMatchId(socketId);
    if (voiceMatchId) {
        jokerVoiceLeave(socketId);
        io.to(JOKER_ROOM(voiceMatchId)).emit('joker:voice-peer-left', { socketId });
        io.to(JOKER_ROOM(voiceMatchId)).emit('joker:ptt-state', { socketId, speaking: false });
    }
    const match = getMatchForSocket(socketId);
    if (!match)
        return;
    const player = match.players.find(p => p.socketId === socketId);
    // During an active game, replace with bot instead of ending
    if (player && (match.status === 'declaration' || match.status === 'playing')) {
        player.isBot = true;
        if (!match.botPlayerIds.includes(player.id)) {
            match.botPlayerIds.push(player.id);
        }
        broadcastState(io, match);
        scheduleBotAction(io, match);
    }
    else {
        handleJokerLeave(io, socketId, match);
    }
}
function handleJokerLeave(io, socketId, match) {
    const specIdx = match.spectatorSocketIds.indexOf(socketId);
    if (specIdx !== -1) {
        match.spectatorSocketIds.splice(specIdx, 1);
        broadcastState(io, match);
        return;
    }
    const player = match.players.find(p => p.socketId === socketId);
    if (!player)
        return;
    if (match.status === 'declaration' ||
        match.status === 'playing' ||
        match.status === 'round_end') {
        clearTurnTimer(match.id);
        finishMatch(match);
        broadcastState(io, match);
        io.emit('joker:list_update', getOpenMatches().map(toListItem));
    }
    else if (match.status === 'waiting' && player.seatIndex === 0) {
        clearTurnTimer(match.id);
        const rk = JOKER_ROOM(match.id);
        io.in(rk).socketsLeave(rk);
        finishMatch(match);
        io.emit('joker:list_update', getOpenMatches().map(toListItem));
    }
}
//# sourceMappingURL=joker.js.map