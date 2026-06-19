import { randomBytes } from 'crypto';
// ── Deck creation ─────────────────────────────────────────────────────────────
function createDeck() {
    const cards = [];
    const colors = ['red', 'blue', 'green', 'yellow'];
    let n = 0;
    for (const color of colors) {
        // One 0
        cards.push({ id: `c${n++}`, color, type: 'number', value: 0 });
        // Two of 1-9
        for (let v = 1; v <= 9; v++) {
            cards.push({ id: `c${n++}`, color, type: 'number', value: v });
            cards.push({ id: `c${n++}`, color, type: 'number', value: v });
        }
        // Two Skip, two Reverse, two Draw Two
        for (let i = 0; i < 2; i++) {
            cards.push({ id: `c${n++}`, color, type: 'skip' });
            cards.push({ id: `c${n++}`, color, type: 'reverse' });
            cards.push({ id: `c${n++}`, color, type: 'draw2' });
        }
    }
    // Four Wild, four Wild Draw Four
    for (let i = 0; i < 4; i++) {
        cards.push({ id: `c${n++}`, color: 'wild', type: 'wild' });
        cards.push({ id: `c${n++}`, color: 'wild', type: 'wild4' });
    }
    return cards;
}
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
// ── Match management ──────────────────────────────────────────────────────────
const matches = new Map();
const playerMatch = new Map(); // userId → matchId
function code6() {
    return randomBytes(3).toString('hex').toUpperCase();
}
export function createMatch(hostId, hostSocketId, nickname, opts = {}) {
    const id = randomBytes(8).toString('hex');
    const settings = {
        maxPlayers: 4,
        spectatorsAllowed: true,
        stackingEnabled: true,
        unoPenaltyEnabled: true,
        ...opts,
    };
    const host = {
        userId: hostId,
        nickname,
        socketId: hostSocketId,
        seat: 0,
        connected: true,
        calledUno: false,
    };
    const m = {
        id,
        code: code6(),
        status: 'waiting',
        hostId,
        players: [host],
        spectatorIds: [],
        settings,
        deck: [],
        discardPile: [],
        hands: {},
        currentPlayerIndex: 0,
        direction: 1,
        currentColor: null,
        pendingDrawCount: 0,
        pendingDrawType: null,
        winnerId: null,
        voiceSessionId: randomBytes(6).toString('hex'),
        chat: [],
        createdAt: Date.now(),
    };
    matches.set(id, m);
    playerMatch.set(hostId, id);
    // Auto-cleanup after 3 hours
    setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
    return m;
}
export function getMatch(matchId) {
    return matches.get(matchId) ?? null;
}
export function getMatchByCode(code) {
    for (const m of matches.values()) {
        if (m.code === code.toUpperCase())
            return m;
    }
    return null;
}
export function getMatchForSocket(socketId) {
    for (const m of matches.values()) {
        if (m.players.some(p => p.socketId === socketId))
            return m;
        if (m.spectatorIds.includes(socketId))
            return m;
    }
    return null;
}
export function listMatches() {
    return [...matches.values()]
        .filter(m => m.status !== 'finished')
        .map(m => ({
        id: m.id,
        code: m.code,
        status: m.status,
        playerCount: m.players.length,
        maxPlayers: m.settings.maxPlayers,
        playerNicknames: m.players.map(p => p.nickname),
    }));
}
export function joinMatch(matchId, userId, socketId, nickname) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    // Reconnect?
    const existing = m.players.find(p => p.userId === userId);
    if (existing) {
        existing.socketId = socketId;
        existing.connected = true;
        playerMatch.set(userId, matchId);
        return { match: m, isNew: false };
    }
    if (m.status !== 'waiting')
        return null;
    if (m.players.length >= m.settings.maxPlayers)
        return null;
    const player = {
        userId,
        nickname,
        socketId,
        seat: m.players.length,
        connected: true,
        calledUno: false,
    };
    m.players.push(player);
    playerMatch.set(userId, matchId);
    return { match: m, isNew: true };
}
export function spectateMatch(matchId, socketId) {
    const m = matches.get(matchId);
    if (!m || !m.settings.spectatorsAllowed)
        return null;
    if (!m.spectatorIds.includes(socketId)) {
        m.spectatorIds.push(socketId);
    }
    return m;
}
export function leaveMatch(matchId, userId, socketId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    // Remove spectator
    m.spectatorIds = m.spectatorIds.filter(id => id !== socketId);
    const player = m.players.find(p => p.userId === userId);
    if (player) {
        player.connected = false;
        playerMatch.delete(userId);
        // If active game, mark as disconnected (don't remove from turn order)
        if (m.status === 'active' || m.status === 'color_choice') {
            // If it's their turn, auto-advance
            const currentPlayer = m.players[m.currentPlayerIndex];
            if (currentPlayer?.userId === userId) {
                advanceTurn(m);
            }
        }
        else if (m.status === 'waiting') {
            // Remove from waiting lobby
            m.players = m.players.filter(p => p.userId !== userId);
            // Re-number seats
            m.players.forEach((p, i) => { p.seat = i; });
            // If no players remain, delete the match entirely
            if (m.players.length === 0) {
                matches.delete(m.id);
                return null;
            }
            // Transfer host if needed
            if (m.hostId === userId && m.players.length > 0) {
                m.hostId = m.players[0].userId;
            }
        }
    }
    return m;
}
export function startMatch(matchId, hostId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId || m.status !== 'waiting')
        return null;
    if (m.players.length < 2)
        return null;
    // Create and shuffle deck
    m.deck = shuffle(createDeck());
    m.discardPile = [];
    // Deal 7 cards to each player
    for (const player of m.players) {
        m.hands[player.userId] = [];
        player.calledUno = false;
    }
    for (let i = 0; i < 7; i++) {
        for (const player of m.players) {
            const card = m.deck.pop();
            if (card)
                m.hands[player.userId].push(card);
        }
    }
    // Find first valid non-wild starting card for discard pile
    let startCard;
    let startIdx = -1;
    for (let i = m.deck.length - 1; i >= 0; i--) {
        const c = m.deck[i];
        if (c.color !== 'wild') {
            startCard = c;
            startIdx = i;
            break;
        }
    }
    if (!startCard) {
        // Fallback: use any card and assign random color
        startCard = m.deck.pop();
        if (startCard.color === 'wild') {
            const colors = ['red', 'blue', 'green', 'yellow'];
            m.currentColor = colors[Math.floor(Math.random() * 4)];
        }
    }
    else {
        m.deck.splice(startIdx, 1);
        m.currentColor = startCard.color;
    }
    m.discardPile.push(startCard);
    // Apply effect of starting card
    m.currentPlayerIndex = 0;
    m.direction = 1;
    m.pendingDrawCount = 0;
    m.pendingDrawType = null;
    if (startCard.type === 'skip') {
        m.currentPlayerIndex = 1 % m.players.length;
    }
    else if (startCard.type === 'reverse') {
        m.direction = -1;
        if (m.players.length === 2) {
            m.currentPlayerIndex = 1; // acts like skip in 2P
        }
    }
    else if (startCard.type === 'draw2') {
        m.pendingDrawCount = 2;
        m.pendingDrawType = 'draw2';
        m.currentPlayerIndex = 1 % m.players.length;
    }
    m.status = 'active';
    m.winnerId = null;
    return m;
}
// ── Helper: draw cards for a player ──────────────────────────────────────────
function drawCards(m, userId, count) {
    const hand = m.hands[userId];
    if (!hand)
        return;
    for (let i = 0; i < count; i++) {
        if (m.deck.length === 0) {
            // Reshuffle discard pile except top card
            if (m.discardPile.length > 1) {
                const top = m.discardPile.pop();
                m.deck = shuffle(m.discardPile);
                m.discardPile = [top];
            }
            else {
                break; // no cards available
            }
        }
        const card = m.deck.pop();
        if (card) {
            // Reset wild card color when going back to deck
            if (card.color === 'wild' || card.type === 'wild' || card.type === 'wild4') {
                card.color = 'wild';
            }
            hand.push(card);
        }
    }
}
// ── Helper: advance turn ──────────────────────────────────────────────────────
function advanceTurn(m, skipCount = 1) {
    const count = m.players.length;
    for (let i = 0; i < skipCount; i++) {
        m.currentPlayerIndex = ((m.currentPlayerIndex + m.direction) % count + count) % count;
    }
    // Check UNO penalty: if previous player has 1 card and didn't call UNO
    // (handled at play time, not here)
}
// ── Validate card is playable ─────────────────────────────────────────────────
function isPlayable(card, currentColor, topDiscard, pendingDrawType, pendingDrawCount, stackingEnabled) {
    // If there's a pending draw stack
    if (pendingDrawCount > 0 && pendingDrawType) {
        if (!stackingEnabled)
            return false; // can't play any card when stacking disabled
        if (pendingDrawType === 'draw2')
            return card.type === 'draw2';
        if (pendingDrawType === 'wild4')
            return card.type === 'wild4';
        return false;
    }
    // Wild cards always playable
    if (card.type === 'wild' || card.type === 'wild4')
        return true;
    // Same color
    if (card.color === currentColor)
        return true;
    // Same type (skip on skip, etc)
    if (card.type === topDiscard.type && card.type !== 'number')
        return true;
    // Same number
    if (card.type === 'number' && topDiscard.type === 'number' && card.value === topDiscard.value)
        return true;
    return false;
}
// ── Play card ─────────────────────────────────────────────────────────────────
export function playCard(matchId, userId, cardId, chosenColor) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.status !== 'active')
        return { match: m, error: 'Game not active' };
    const currentPlayer = m.players[m.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.userId !== userId) {
        return { match: m, error: 'Not your turn' };
    }
    const hand = m.hands[userId];
    if (!hand)
        return { match: m, error: 'No hand found' };
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1)
        return { match: m, error: 'Card not in hand' };
    const card = hand[cardIdx];
    const topDiscard = m.discardPile[m.discardPile.length - 1];
    const currentColor = m.currentColor ?? 'red';
    if (!topDiscard)
        return { match: m, error: 'No top discard' };
    if (!isPlayable(card, currentColor, topDiscard, m.pendingDrawType, m.pendingDrawCount, m.settings.stackingEnabled)) {
        return { match: m, error: 'Card not playable' };
    }
    // Wild cards require chosen color
    if ((card.type === 'wild' || card.type === 'wild4') && !chosenColor) {
        return { match: m, error: 'Must choose a color for wild card' };
    }
    // Remove card from hand
    hand.splice(cardIdx, 1);
    m.discardPile.push(card);
    // Check UNO: if player had 2 cards (now 1), they should call UNO
    // UNO penalty is checked at next player's turn start (see drawCard)
    if (hand.length === 1) {
        // Player should call UNO — calledUno will be checked
        currentPlayer.calledUno = false; // reset - they must call it now
    }
    else if (hand.length === 0) {
        // Winner!
        m.winnerId = userId;
        m.status = 'finished';
        return { match: m };
    }
    else {
        currentPlayer.calledUno = false;
    }
    // Apply card effects
    let skipCount = 1; // how many players to skip past current
    if (card.type === 'skip') {
        skipCount = 2; // skip next player
    }
    else if (card.type === 'reverse') {
        m.direction = m.direction === 1 ? -1 : 1;
        if (m.players.length === 2) {
            skipCount = 2; // acts like skip
        }
    }
    else if (card.type === 'draw2') {
        if (m.pendingDrawCount > 0 && m.pendingDrawType === 'draw2' && m.settings.stackingEnabled) {
            // Stacking: add to pending
            m.pendingDrawCount += 2;
        }
        else {
            m.pendingDrawCount = 2;
            m.pendingDrawType = 'draw2';
        }
    }
    else if (card.type === 'wild4') {
        m.currentColor = chosenColor;
        if (m.pendingDrawCount > 0 && m.pendingDrawType === 'wild4' && m.settings.stackingEnabled) {
            m.pendingDrawCount += 4;
        }
        else {
            m.pendingDrawCount = 4;
            m.pendingDrawType = 'wild4';
        }
    }
    else if (card.type === 'wild') {
        m.currentColor = chosenColor;
    }
    // Set current color from card if not wild
    if (card.type !== 'wild' && card.type !== 'wild4') {
        m.currentColor = card.color;
    }
    // Advance turn
    advanceTurn(m, skipCount);
    // Apply UNO penalty if next player was skipped and had 1 card without calling UNO
    // (complex - keep simple for v1)
    return { match: m };
}
// ── Draw card(s) ──────────────────────────────────────────────────────────────
export function drawCard(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.status !== 'active')
        return { match: m, error: 'Game not active' };
    const currentPlayer = m.players[m.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.userId !== userId) {
        return { match: m, error: 'Not your turn' };
    }
    const hand = m.hands[userId];
    // Check UNO penalty on the current player (they had 1 card but didn't call)
    // Skip for now - UNO penalty handled elsewhere
    if (m.pendingDrawCount > 0) {
        // Draw pendingDrawCount cards
        drawCards(m, userId, m.pendingDrawCount);
        m.pendingDrawCount = 0;
        m.pendingDrawType = null;
        advanceTurn(m);
        return { match: m };
    }
    else {
        // Draw 1 card
        drawCards(m, userId, 1);
        const drawnCard = hand[hand.length - 1];
        // Advance turn (player draws and passes)
        advanceTurn(m);
        return { match: m, drawnCard };
    }
}
// ── Call UNO ──────────────────────────────────────────────────────────────────
export function callUno(matchId, userId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'active')
        return null;
    const player = m.players.find(p => p.userId === userId);
    if (!player)
        return null;
    const hand = m.hands[userId] ?? [];
    if (hand.length === 1) {
        player.calledUno = true;
    }
    return m;
}
// ── Apply UNO penalty ─────────────────────────────────────────────────────────
// Called by the server when a player's turn starts and their previous player
// had 1 card but didn't call UNO.
export function applyUnoPenaltyIfNeeded(m) {
    if (!m.settings.unoPenaltyEnabled)
        return;
    // Check the previous player
    const count = m.players.length;
    const prevIdx = ((m.currentPlayerIndex - m.direction) % count + count) % count;
    const prevPlayer = m.players[prevIdx];
    if (!prevPlayer)
        return;
    const prevHand = m.hands[prevPlayer.userId] ?? [];
    if (prevHand.length === 1 && !prevPlayer.calledUno) {
        drawCards(m, prevPlayer.userId, 2);
        prevPlayer.calledUno = false;
    }
}
// ── Send chat ─────────────────────────────────────────────────────────────────
export function sendChat(matchId, userId, nickname, text) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    const msg = { userId, nickname, text: text.trim().slice(0, 300), ts: Date.now() };
    m.chat.push(msg);
    if (m.chat.length > 100)
        m.chat = m.chat.slice(-100);
    return { match: m, msg };
}
// ── Disconnect handler ────────────────────────────────────────────────────────
export function disconnectSocket(socketId) {
    for (const [matchId, m] of matches) {
        const player = m.players.find(p => p.socketId === socketId);
        if (player) {
            if (m.status === 'waiting') {
                // Remove from waiting lobby; delete if empty
                playerMatch.delete(player.userId);
                m.players = m.players.filter(p => p.socketId !== socketId);
                m.players.forEach((p, i) => { p.seat = i; });
                if (m.players.length === 0) {
                    matches.delete(matchId);
                }
                else if (m.hostId === player.userId) {
                    m.hostId = m.players[0].userId;
                }
            }
            else {
                player.connected = false;
            }
            return matchId;
        }
        const specIdx = m.spectatorIds.indexOf(socketId);
        if (specIdx !== -1) {
            m.spectatorIds.splice(specIdx, 1);
            return matchId;
        }
    }
    return null;
}
// ── Rematch ───────────────────────────────────────────────────────────────────
export function rematch(matchId, hostId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== hostId || m.status !== 'finished')
        return null;
    // Reset to waiting
    m.status = 'waiting';
    m.deck = [];
    m.discardPile = [];
    m.hands = {};
    m.currentPlayerIndex = 0;
    m.direction = 1;
    m.currentColor = null;
    m.pendingDrawCount = 0;
    m.pendingDrawType = null;
    m.winnerId = null;
    m.voiceSessionId = randomBytes(6).toString('hex');
    m.chat = [];
    // Reset player UNO status
    for (const p of m.players) {
        p.calledUno = false;
    }
    return m;
}
// ── Get safe public state ─────────────────────────────────────────────────────
export function getSafeState(m, viewerUserId) {
    const currentPlayer = m.players[m.currentPlayerIndex];
    return {
        id: m.id,
        code: m.code,
        status: m.status,
        hostId: m.hostId,
        players: m.players.map(p => ({
            userId: p.userId,
            nickname: p.nickname,
            socketId: p.socketId,
            seat: p.seat,
            connected: p.connected,
            calledUno: p.calledUno,
            cardCount: (m.hands[p.userId] ?? []).length,
        })),
        spectatorCount: m.spectatorIds.length,
        settings: m.settings,
        topDiscard: m.discardPile[m.discardPile.length - 1] ?? null,
        currentColor: m.currentColor,
        currentPlayerId: currentPlayer?.userId ?? null,
        direction: m.direction,
        pendingDrawCount: m.pendingDrawCount,
        deckSize: m.deck.length,
        winnerId: m.winnerId,
        voiceSessionId: m.voiceSessionId,
        chat: m.chat,
        myHand: m.hands[viewerUserId] ?? [],
        myUserId: viewerUserId,
    };
}
//# sourceMappingURL=unoService.js.map