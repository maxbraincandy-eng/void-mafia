import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches, dealRound, validateCardPlay, resolveTrick, applyRoundScores, finishMatch, } from './services/jokerService.js';
import { addXP } from './services/playerService.js';
const JOKER_ROOM = (id) => `jk:${id}`;
// ── Public state sent to all clients in the room ───────────────────────
// Hands are NOT included — each player gets their hand via joker:hand.
function toPublic(match) {
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        settings: match.settings,
        players: match.players.map(p => ({
            id: p.id,
            socketId: p.socketId, // included so client can self-identify
            name: p.name,
            profileId: p.profileId,
            seatIndex: p.seatIndex,
            cardCount: (match.hands[p.id] ?? []).length,
        })),
        spectatorCount: match.spectatorSocketIds.length,
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
// Broadcast public state to the room, and each player's private hand individually.
function broadcastState(io, match) {
    io.to(JOKER_ROOM(match.id)).emit('joker:state', toPublic(match));
    // Send each player their private hand
    for (const player of match.players) {
        const hand = match.hands[player.id] ?? [];
        io.to(player.socketId).emit('joker:hand', hand);
    }
}
// ── Handler Registration ───────────────────────────────────────────────
export function registerJokerHandlers(io, socket) {
    // ── List open matches ──────────────────────────────────────────────
    socket.on('joker:list', (cb) => {
        try {
            const open = getOpenMatches().map(toListItem);
            cb(ok(open));
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
            // Already in this match as a player — reconnect.
            const existingPlayer = match.players.find(p => p.socketId === socket.id);
            if (existingPlayer) {
                socket.join(JOKER_ROOM(match.id));
                // Re-send their hand privately
                const hand = match.hands[existingPlayer.id] ?? [];
                socket.emit('joker:hand', hand);
                return cb(ok(toPublic(match)));
            }
            // Check if already in a different active match.
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.id !== match.id && existing.status !== 'finished') {
                return cb(err('You are already in another Joker match.'));
            }
            if (match.players.length < 4 && match.status === 'waiting') {
                // Add as a player at the next available seat.
                const nextSeat = match.players.length; // seats 0-3 in join order
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
                // Join as spectator.
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
            // Only player[0] (seat 0, creator) can start.
            const caller = match.players.find(p => p.socketId === socket.id);
            if (!caller)
                return cb(err('You are not a player in this match.'));
            if (caller.seatIndex !== 0)
                return cb(err('Only the host (seat 0) can start the match.'));
            // Deal the first round.
            dealRound(match);
            match.status = 'declaration';
            match.currentDeclarationSeat = (match.currentDealerSeat + 1) % 4;
            // Reset trick state for the new round.
            match.currentTrick = [];
            match.currentTrickLeaderSeat = (match.currentDealerSeat + 1) % 4;
            match.currentPlaySeat = (match.currentDealerSeat + 1) % 4;
            // Reset declarations and tricks taken.
            for (const player of match.players) {
                match.declarations[player.id] = null;
                match.tricksTaken[player.id] = 0;
            }
            match.updatedAt = Date.now();
            broadcastState(io, match);
            io.emit('joker:list_update', getOpenMatches().map(toListItem));
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
            match.declarations[player.id] = tricks;
            match.currentDeclarationSeat = (match.currentDeclarationSeat + 1) % 4;
            // Check if all 4 players have declared.
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
            // Remove card from hand.
            const cardIndex = hand.findIndex(c => c.suit === data.card.suit && c.rank === data.card.rank);
            if (cardIndex === -1)
                return cb(err('Card not found in hand.'));
            hand.splice(cardIndex, 1);
            // Add to current trick.
            match.currentTrick.push({
                playerId: player.id,
                seatIndex: player.seatIndex,
                card: data.card,
            });
            // Advance to next player's seat.
            match.currentPlaySeat = (match.currentPlaySeat + 1) % 4;
            match.updatedAt = Date.now();
            if (match.currentTrick.length === 4) {
                // Trick is complete — resolve it.
                const { winnerId, winnerSeat } = resolveTrick(match.currentTrick);
                match.tricksTaken[winnerId] = (match.tricksTaken[winnerId] ?? 0) + 1;
                // Broadcast state immediately so clients see the completed trick.
                broadcastState(io, match);
                cb(ok(null));
                // After 1.5 seconds, start next trick or end round.
                setTimeout(() => {
                    if (!getMatch(match.id))
                        return; // match was deleted
                    const anyCardsLeft = match.players.some(p => (match.hands[p.id] ?? []).length > 0);
                    if (anyCardsLeft) {
                        // Start new trick — winner leads.
                        match.currentTrick = [];
                        match.currentTrickLeaderSeat = winnerSeat;
                        match.currentPlaySeat = winnerSeat;
                        match.updatedAt = Date.now();
                        broadcastState(io, match);
                    }
                    else {
                        // Round is complete — score first so round_end broadcast includes results.
                        applyRoundScores(match);
                        match.status = 'round_end';
                        broadcastState(io, match);
                        // 4-second pause so clients can display round results before advancing.
                        setTimeout(() => {
                            if (!getMatch(match.id))
                                return;
                            const nextRoundIndex = match.currentRoundIndex + 1;
                            if (nextRoundIndex < match.roundPlan.length) {
                                // Advance to next round.
                                match.currentRoundIndex = nextRoundIndex;
                                match.currentDealerSeat = (match.currentDealerSeat + 1) % 4;
                                // Reset per-round state.
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
                            }
                            else {
                                // Game over.
                                finishMatch(match);
                                broadcastState(io, match);
                                // Award XP.
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
                // Trick not complete yet — just broadcast updated state.
                broadcastState(io, match);
                cb(ok(null));
            }
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
            // Create a new match with the same settings and creator at seat 0.
            const creator = { ...old.players[0] };
            const nm = createMatch(creator, { ...old.settings });
            // Add remaining players in order, re-using same seat assignments.
            for (let i = 1; i < old.players.length; i++) {
                const op = old.players[i];
                const np = { ...op };
                nm.players.push(np);
                nm.scores[np.id] = 0;
                nm.tricksTaken[np.id] = 0;
                nm.declarations[np.id] = null;
                nm.hands[np.id] = [];
                nm.pulkaExacts[np.id] = {};
            }
            nm.updatedAt = Date.now();
            // Move all player sockets to the new room.
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
            const msg = {
                senderId,
                senderName,
                text,
                ts: Date.now(),
            };
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
}
// ── Disconnect cleanup ─────────────────────────────────────────────────
export function handleJokerDisconnect(io, socketId) {
    const match = getMatchForSocket(socketId);
    if (!match)
        return;
    handleJokerLeave(io, socketId, match);
}
function handleJokerLeave(io, socketId, match) {
    // Remove from spectators silently.
    const specIdx = match.spectatorSocketIds.indexOf(socketId);
    if (specIdx !== -1) {
        match.spectatorSocketIds.splice(specIdx, 1);
        broadcastState(io, match);
        return;
    }
    const player = match.players.find(p => p.socketId === socketId);
    if (!player)
        return;
    // Player leaving during an active match — finish the game.
    if (match.status === 'declaration' || match.status === 'playing') {
        finishMatch(match);
        broadcastState(io, match);
        io.emit('joker:list_update', getOpenMatches().map(toListItem));
    }
    else if (match.status === 'waiting' && player.seatIndex === 0) {
        // Creator left before game started — close the room.
        const rk = JOKER_ROOM(match.id);
        io.in(rk).socketsLeave(rk);
        finishMatch(match);
        io.emit('joker:list_update', getOpenMatches().map(toListItem));
    }
}
//# sourceMappingURL=joker.js.map