/**
 * სხვა მაფია (Other Mafia) — a host-moderated, video-first "table mafia".
 *
 * This is an INDEPENDENT implementation written from scratch. It deliberately
 * shares nothing with the platform's original mafia engine — its own roles,
 * phase machine, turn/timer model, foul system and win logic live entirely
 * here. It follows the same generic match conventions used by the lies/spyfall
 * services (in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC).
 *
 * Shape of a game:
 *   • one player is the HOST / moderator — they sit in the centre, hold no
 *     secret role, run the phases and hand out fouls.
 *   • the others take numbered SEATS with hidden roles and a webcam tile.
 *   • phases loop: assign → night → day_announce → speech → vote → last_words → …
 *   • during the day each living seat gets its own timed minute to speak; the
 *     active seat's tile is highlighted. Four fouls eliminate a seat.
 *
 * Timers (speech/night/vote/last-words deadlines) are driven from the socket
 * layer, exactly like the other match games.
 */
import { randomBytes } from 'crypto';
import { limitsForSync } from './vipService.js';
export const XM_FOULS_TO_ELIMINATE = 4;
const matches = new Map();
function code6() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
/** Role split for a given number of seated players (host excluded). */
export function roleCounts(n) {
    const mafiaTotal = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4; // includes the don
    const don = mafiaTotal >= 1 ? 1 : 0;
    const mafia = mafiaTotal - don;
    const sheriff = n >= 5 ? 1 : 0;
    const citizen = Math.max(0, n - don - mafia - sheriff);
    return { don, mafia, sheriff, citizen };
}
/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export function effectiveCounts(m) {
    const n = m.seats.length;
    if (!m.roleConfig)
        return roleCounts(n);
    let don = Math.max(0, Math.min(2, Math.floor(m.roleConfig.don)));
    let mafia = Math.max(0, Math.min(9, Math.floor(m.roleConfig.mafia)));
    let sheriff = Math.max(0, Math.min(2, Math.floor(m.roleConfig.sheriff)));
    // A mafia game needs at least one mafia-team member and at least one townsperson.
    if (don + mafia === 0)
        mafia = 1;
    // Trim specials that don't fit, then guarantee ≥1 town seat remains.
    let specials = don + mafia + sheriff;
    if (specials > n) {
        const o = specials - n;
        mafia = Math.max(0, mafia - o);
    }
    specials = don + mafia + sheriff;
    if (specials > n) {
        const o = specials - n;
        sheriff = Math.max(0, sheriff - o);
    }
    specials = don + mafia + sheriff;
    if (specials > n) {
        const o = specials - n;
        don = Math.max(0, don - o);
    }
    if (don + mafia === 0)
        mafia = 1;
    // Keep at least one town seat: mafia team can be at most n-1.
    while (don + mafia >= n && mafia > 0)
        mafia -= 1;
    while (don + mafia >= n && don > 0)
        don -= 1;
    const citizen = Math.max(0, n - don - mafia - sheriff);
    return { don, mafia, sheriff, citizen };
}
export function createMatch(hostId, socketId, nickname, opts) {
    const id = randomBytes(8).toString('hex');
    const m = {
        id, code: code6(), phase: 'lobby',
        hostId, hostSocketId: socketId, hostName: nickname, hostConnected: true,
        maxSeats: Math.min(14, Math.max(4, Number(opts.maxSeats ?? 10))),
        seats: [],
        spectators: [],
        settings: { speechSeconds: 60, nightSeconds: 40, voteSeconds: 30, lastWordsSeconds: 40, floorControl: true },
        roleConfig: null,
        deck: [],
        log: [],
        round: 0,
        introRound: false,
        speechOrder: [], speechIdx: 0, speechEndsAt: 0, nominations: [], nominatedBy: {},
        night: { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null },
        nightEndsAt: 0,
        announce: null,
        votes: {}, voteIdx: 0, voteEndsAt: 0, voteRevote: false, voteResult: null,
        lastWordsUserId: null, lastWordsEndsAt: 0, floorGrab: null,
        winner: null, reveal: null, dissolved: false, hostLeft: false, createdAt: Date.now(),
    };
    matches.set(id, m);
    // unref: a three-hour cleanup timer must not be the reason a process refuses
    // to exit. It is housekeeping, not work anybody is waiting on.
    setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000).unref();
    return m;
}
export function getMatch(id) { return matches.get(id) ?? null; }
export function getMatchByCode(code) { for (const m of matches.values())
    if (m.code === code && m.phase !== 'finished')
        return m; return null; }
export function getMatchForSocket(socketId) {
    for (const m of matches.values()) {
        if (m.hostSocketId === socketId)
            return m;
        if (m.seats.some(s => s.socketId === socketId))
            return m;
        if (m.spectators.some(s => s.socketId === socketId))
            return m;
    }
    return null;
}
export function listMatches() {
    return [...matches.values()].filter(m => m.phase !== 'finished').map(m => ({
        id: m.id, code: m.code, hostName: m.hostName, seatCount: m.seats.length, maxSeats: m.maxSeats, phase: m.phase,
    }));
}
function findByUser(m, userId) { return m.seats.find(s => s.userId === userId) ?? null; }
function aliveSeats(m) { return m.seats.filter(s => s.alive); }
function isMafiaRole(r) { return r === 'mafia' || r === 'don'; }
function aliveMafia(m) { return m.seats.filter(s => s.alive && isMafiaRole(s.role)); }
function aliveTown(m) { return m.seats.filter(s => s.alive && !isMafiaRole(s.role)); }
/** Join as a seat (during lobby) or reconnect. Post-start newcomers become spectators. */
export function joinMatch(matchId, userId, socketId, nickname) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    // Walking back in clears the "they left" flag — for the host too, so a
    // dissolved room they re-enter behaves like a room again.
    if (m.hostId === userId) {
        m.hostSocketId = socketId;
        m.hostConnected = true;
        m.hostName = nickname;
        m.hostLeft = false;
        return { match: m, isNew: false };
    }
    const seat = findByUser(m, userId);
    if (seat) {
        // A player the host removed does not get back in by re-joining.
        if (seat.left && seat.eliminatedBy === 'fouls')
            return null;
        seat.socketId = socketId;
        seat.connected = true;
        seat.left = false;
        return { match: m, isNew: false };
    }
    const spec = m.spectators.find(s => s.userId === userId);
    if (spec) {
        spec.socketId = socketId;
        spec.connected = true;
        return { match: m, isNew: false };
    }
    if (m.phase === 'lobby' && m.seats.length < m.maxSeats) {
        m.seats.push({ userId, socketId, nickname, seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false });
        return { match: m, isNew: true };
    }
    m.spectators.push({ userId, socketId, nickname, connected: true });
    return { match: m, isNew: true };
}
/**
 * Seat a test bot.
 *
 * Separate from `joinMatch` because a bot has no socket: there is no id to
 * store, nothing to reconnect, and nothing to broadcast to. Lobby only — a bot
 * cannot walk into a game that has already dealt, for the same reason a person
 * cannot.
 */
export function joinMatchAsBot(matchId, botId, nickname) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'lobby')
        return null;
    if (m.seats.length >= m.maxSeats)
        return null;
    m.seats.push({
        userId: botId, socketId: `nosocket_${botId}`, nickname,
        seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0,
        eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false,
    });
    return m;
}
export function leaveMatch(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.phase === 'lobby') {
        if (m.hostId === userId)
            return dissolveMatch(matchId, userId); // host leaving in lobby ends it
        m.seats = m.seats.filter(s => s.userId !== userId);
        m.seats.forEach((s, i) => { s.seat = i + 1; });
        m.spectators = m.spectators.filter(s => s.userId !== userId);
        return m;
    }
    // Active game: host leaving dissolves; a player leaving marks them disconnected/eliminated.
    if (m.hostId === userId)
        return dissolveMatch(matchId, userId);
    const seat = findByUser(m, userId);
    // `left`, not just `connected: false` — they chose to go, so the room stops
    // pushing state at them. A dropped connection is a different thing and keeps
    // its seat warm.
    if (seat) {
        seat.connected = false;
        seat.left = true;
    }
    m.spectators = m.spectators.filter(s => s.userId !== userId);
    return m;
}
/**
 * Who is still in the room and should be sent state.
 *
 * The host counts unless they have left — and when they dissolve the room they
 * have left. Without that, the person who just closed the room receives the
 * closed room back, which reopens it on their screen; pressing "leave" then
 * dissolves it again, and they are in a loop they cannot get out of.
 */
export function recipients(m) {
    const out = [];
    if (!m.hostLeft)
        out.push({ userId: m.hostId, socketId: m.hostSocketId });
    for (const s of m.seats)
        if (!s.left)
            out.push({ userId: s.userId, socketId: s.socketId });
    for (const s of m.spectators)
        out.push({ userId: s.userId, socketId: s.socketId });
    return out;
}
/**
 * The host removes a player.
 *
 * In the lobby the seat simply goes. In a live game the player is eliminated
 * and recorded as fouled out, because that is what a removal mid-game IS in
 * hosted mafia — the moderator is not deleting a person, they are ruling them
 * out of the round, and the protocol should say so.
 */
export function kickPlayer(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (targetUserId === m.hostId)
        return null; // the host cannot remove themselves
    const seat = findByUser(m, targetUserId);
    if (!seat) {
        const spec = m.spectators.find(x => x.userId === targetUserId);
        if (!spec)
            return null;
        m.spectators = m.spectators.filter(x => x.userId !== targetUserId);
        return m;
    }
    if (m.phase === 'lobby') {
        m.seats = m.seats.filter(s => s.userId !== targetUserId);
        m.seats.forEach((s, i) => { s.seat = i + 1; });
        return m;
    }
    seat.left = true;
    seat.connected = false;
    if (seat.alive) {
        seat.alive = false;
        seat.eliminatedRound = m.round;
        seat.eliminatedBy = 'fouls';
        pushLog(m, 'foul', `${seatLabel(seat)} — ჰოსტმა გარიცხა`);
        if (m.phase === 'speech' && m.speechOrder[m.speechIdx] === targetUserId)
            advanceSpeaker(m);
        checkWin(m);
    }
    return m;
}
/**
 * Reconnect.
 *
 * State is broadcast to stored socket ids, and a phone that locks its screen or
 * changes network comes back with a NEW one — so the old handle is dead and the
 * player's table simply stops updating. Nothing errors; they just freeze while
 * everyone else plays on. Asking on reconnect is what un-freezes them.
 *
 * Someone the host removed does not come back this way: `left` with a fouls
 * ruling is a decision, not a dropped connection.
 */
export function resumeForUser(userId, socketId) {
    for (const m of matches.values()) {
        if (m.dissolved)
            continue;
        if (m.hostId === userId) {
            if (m.hostLeft)
                continue;
            m.hostSocketId = socketId;
            m.hostConnected = true;
            return m;
        }
        const seat = m.seats.find(s => s.userId === userId);
        if (seat) {
            if (seat.left)
                continue;
            seat.socketId = socketId;
            seat.connected = true;
            return m;
        }
        const spec = m.spectators.find(s => s.userId === userId);
        if (spec) {
            spec.socketId = socketId;
            spec.connected = true;
            return m;
        }
    }
    return null;
}
export function disconnectSocket(socketId) {
    const m = getMatchForSocket(socketId);
    if (!m)
        return null;
    if (m.hostSocketId === socketId) {
        m.hostConnected = false;
        return m.id;
    }
    const seat = m.seats.find(s => s.socketId === socketId);
    if (seat) {
        seat.connected = false;
        if (m.phase === 'lobby') {
            m.seats = m.seats.filter(s => s.userId !== seat.userId);
            m.seats.forEach((s, i) => { s.seat = i + 1; });
        }
        return m.id;
    }
    const spec = m.spectators.find(s => s.socketId === socketId);
    if (spec) {
        spec.connected = false;
        if (m.phase === 'lobby')
            m.spectators = m.spectators.filter(s => s.userId !== spec.userId);
    }
    return m.id;
}
export function dissolveMatch(matchId, _byUserId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    m.phase = 'finished';
    m.dissolved = true;
    m.winner = null;
    // The host is out of the room the moment they close it: they must not be a
    // recipient of the very broadcast that tells everyone it is closed.
    m.hostLeft = true;
    return m;
}
/** Lobby only: the host hands the moderator role to a seated player and takes
 * that player's seat in return (a straight swap). */
export function transferHost(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'lobby')
        return null;
    const target = findByUser(m, targetUserId);
    if (!target)
        return null;
    const oldHostSeat = {
        userId: m.hostId, socketId: m.hostSocketId, nickname: m.hostName, seat: target.seat,
        connected: m.hostConnected, role: null, alive: true, fouls: 0,
        eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false,
    };
    m.seats = m.seats.map(s => (s.userId === targetUserId ? oldHostSeat : s));
    m.seats.forEach((s, i) => { s.seat = i + 1; });
    m.hostId = target.userId;
    m.hostSocketId = target.socketId;
    m.hostName = target.nickname;
    m.hostConnected = target.connected;
    return m;
}
// ── Start / the deal ─────────────────────────────────────────────────────────────
/** Shuffle the role composition into a face-down deck. Roles aren't assigned to
 * seats yet — each player claims a card during the assign phase, and the card's
 * hidden role becomes theirs. */
export function dealCards(m) {
    const n = m.seats.length;
    const { don, mafia, sheriff } = effectiveCounts(m);
    const pool = [
        ...Array(don).fill('don'),
        ...Array(mafia).fill('mafia'),
        ...Array(sheriff).fill('sheriff'),
    ];
    while (pool.length < n)
        pool.push('citizen');
    m.deck = shuffle(pool);
    m.seats.forEach(s => {
        s.role = null;
        s.cardIndex = null;
        s.alive = true;
        s.fouls = 0;
        s.eliminatedRound = null;
        s.eliminatedBy = null;
        s.lastCheck = null;
    });
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'lobby')
        return null;
    if (m.seats.length < 4)
        return null;
    dealCards(m);
    m.round = 0;
    m.phase = 'assign';
    m.winner = null;
    m.reveal = null;
    m.announce = null;
    m.log = [];
    pushLog(m, 'game', `თამაში დაიწყო — ${m.seats.length} მოთამაშე`);
    return m;
}
/** A player takes one of the face-down cards; its hidden role becomes theirs. */
export function pickCard(matchId, byUserId, cardIndex) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'assign')
        return null;
    const seat = findByUser(m, byUserId);
    if (!seat || seat.cardIndex !== null)
        return null; // spectators / host / already took one
    const idx = Math.floor(Number(cardIndex));
    if (idx < 0 || idx >= m.deck.length)
        return null;
    if (m.seats.some(s => s.cardIndex === idx))
        return null; // already taken by someone
    seat.cardIndex = idx;
    seat.role = m.deck[idx];
    return m;
}
/** Host configures the role composition (lobby or assign). Pass null to reset to auto. */
export function setRoleConfig(matchId, byUserId, cfg) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (m.phase !== 'lobby' && m.phase !== 'assign')
        return null;
    if (!cfg) {
        m.roleConfig = null;
    }
    else {
        m.roleConfig = {
            don: Math.max(0, Math.min(2, Math.floor(Number(cfg.don ?? 0)))),
            mafia: Math.max(0, Math.min(9, Math.floor(Number(cfg.mafia ?? 0)))),
            sheriff: Math.max(0, Math.min(2, Math.floor(Number(cfg.sheriff ?? 0)))),
        };
    }
    if (m.phase === 'assign')
        dealCards(m); // re-deal with the new split (everyone re-picks)
    return m;
}
/** Host tweaks timers / floor control. Durations only editable before play starts. */
export function setSettings(matchId, byUserId, patch) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (typeof patch.floorControl === 'boolean')
        m.settings.floorControl = patch.floorControl; // any time
    if (m.phase === 'lobby') {
        if (patch.speechSeconds != null)
            m.settings.speechSeconds = Math.max(20, Math.min(180, Math.floor(patch.speechSeconds)));
        if (patch.voteSeconds != null)
            m.settings.voteSeconds = Math.max(15, Math.min(120, Math.floor(patch.voteSeconds)));
        if (patch.lastWordsSeconds != null)
            m.settings.lastWordsSeconds = Math.max(15, Math.min(120, Math.floor(patch.lastWordsSeconds)));
        if (patch.nightSeconds != null)
            m.settings.nightSeconds = Math.max(20, Math.min(120, Math.floor(patch.nightSeconds)));
    }
    return m;
}
/** Host re-deals the cards while still on the assign screen (everyone re-picks). */
export function reshuffleRoles(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'assign')
        return null;
    dealCards(m);
    return m;
}
// ── Phase transitions (host-driven) ─────────────────────────────────────────────
function resetNight(m) {
    m.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null };
}
function seatLabel(s) { return `#${s.seat} ${s.nickname}`; }
function pushLog(m, phase, text) {
    m.log.push({ round: m.round, phase, text });
    if (m.log.length > 60)
        m.log.shift();
}
/** True once everyone who has a night action tonight has submitted it. */
function nightAllActed(m) {
    const mafia = aliveMafia(m);
    const allMafiaVoted = mafia.length === 0 || mafia.every(s => m.night.mafiaVotes[s.userId]);
    const don = m.seats.find(s => s.alive && s.role === 'don');
    const sheriff = m.seats.find(s => s.alive && s.role === 'sheriff');
    return allMafiaVoted && (!don || m.night.donCheck !== null) && (!sheriff || m.night.sheriffCheck !== null);
}
function startNight(m) {
    resetNight(m);
    m.floorGrab = null;
    m.phase = 'night';
    // Host-paced: the night ends when every role has acted (auto) or the host
    // closes it — NOT on a hard timer, which used to resolve a premature "peaceful
    // night" before the mafia (especially 2+) could agree on a target.
    m.nightEndsAt = 0;
}
/** First night only: the mafia open their eyes and get to know each other. */
export function beginMafiaMeet(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'assign')
        return null;
    if (m.seats.some(s => s.cardIndex === null))
        return null; // wait until everyone took a card
    resetNight(m);
    m.round = 1;
    m.phase = 'mafia_meet';
    return m;
}
/** Host closes the acquaintance screen; the day-0 introduction circle begins —
 * everyone speaks in turn, no nominations, then the first night falls. */
export function endMafiaMeet(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'mafia_meet')
        return null;
    m.introRound = true;
    m.floorGrab = null;
    m.nominations = [];
    m.nominatedBy = {};
    buildSpeechOrder(m);
    m.phase = 'speech';
    startSpeechClock(m);
    return m;
}
export function beginNight(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (m.phase !== 'speech' && m.phase !== 'day_announce')
        return null; // first night goes via mafia_meet
    m.round += 1;
    startNight(m);
    return m;
}
/** Mafia member picks the kill target for tonight. */
export function mafiaVote(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || !isMafiaRole(actor.role))
        return null;
    if (!target || !target.alive || isMafiaRole(target.role))
        return null; // mafia don't shoot their own
    m.night.mafiaVotes[byUserId] = targetUserId;
    maybeAutoNight(m);
    return m;
}
export function donCheck(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || actor.role !== 'don')
        return null;
    if (!target || !target.alive)
        return null;
    m.night.donCheck = targetUserId;
    m.night.donResult = target.role === 'sheriff';
    actor.lastCheck = `🎩 ${seatLabel(target)}: ${m.night.donResult ? 'შერიფია ✓' : 'შერიფი არ არის'}`;
    maybeAutoNight(m);
    return m;
}
export function sheriffCheck(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || actor.role !== 'sheriff')
        return null;
    if (!target || !target.alive)
        return null;
    m.night.sheriffCheck = targetUserId;
    m.night.sheriffResult = isMafiaRole(target.role);
    actor.lastCheck = `🔎 ${seatLabel(target)}: ${m.night.sheriffResult ? 'მაფიაა ✗' : 'მშვიდობიანია ✓'}`;
    maybeAutoNight(m);
    return m;
}
function resolveKill(m) {
    const votes = Object.entries(m.night.mafiaVotes).filter(([voter]) => {
        const s = findByUser(m, voter);
        return s && s.alive && isMafiaRole(s.role);
    });
    if (votes.length === 0)
        return null;
    const tally = new Map();
    for (const [, t] of votes)
        tally.set(t, (tally.get(t) ?? 0) + 1);
    let best = null, bestN = -1, tie = false;
    for (const [t, c] of tally) {
        if (c > bestN) {
            best = t;
            bestN = c;
            tie = false;
        }
        else if (c === bestN)
            tie = true;
    }
    // Tie → the don's pick decides; if the don didn't vote, no kill lands.
    if (tie) {
        const donSeat = m.seats.find(s => s.alive && s.role === 'don');
        const donPick = donSeat ? m.night.mafiaVotes[donSeat.userId] : undefined;
        best = donPick ?? null;
    }
    if (!best)
        return null;
    const victim = findByUser(m, best);
    return victim && victim.alive && !isMafiaRole(victim.role) ? victim : null;
}
/** Core night resolution — no host check. Used by the host action, the auto-end
 * (all roles acted) and the night timer. */
function resolveNight(m) {
    if (m.phase !== 'night')
        return;
    const victim = resolveKill(m);
    if (victim) {
        victim.alive = false;
        victim.eliminatedRound = m.round;
        victim.eliminatedBy = 'mafia';
    }
    m.announce = { round: m.round, killedUserId: victim?.userId ?? null, killedName: victim?.nickname ?? null };
    pushLog(m, 'night', victim ? `ღამე ${m.round}: მოკლეს ${seatLabel(victim)}` : `ღამე ${m.round}: მშვიდი ღამე — მსხვერპლი არ არის`);
    m.phase = 'day_announce';
    if (checkWin(m))
        return;
    if (victim)
        startLastWords(m, victim.userId); // the freshly killed player gets a farewell
}
/** Auto-close the night the moment every night role has acted. */
function maybeAutoNight(m) {
    if (m.phase === 'night' && nightAllActed(m))
        resolveNight(m);
}
/** Host closes the night. */
export function endNight(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'night')
        return null;
    resolveNight(m);
    return m;
}
/** Night timer fired — resolve whatever was chosen. */
export function advanceNightAuto(matchId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    resolveNight(m);
    return m;
}
// ── Day speech ───────────────────────────────────────────────────────────────
/**
 * Start the current speaker's clock.
 *
 * A verified player gets `speechBonusSeconds` more than the table's setting —
 * the one perk that touches play rather than presentation, added deliberately
 * and kept small. The lookup is the synchronous snapshot because this runs from
 * timer callbacks where there is nothing to await; see vipService.
 */
function startSpeechClock(m) {
    const speaker = m.speechOrder[m.speechIdx] ?? null;
    const bonus = limitsForSync(speaker).speechBonusSeconds;
    m.speechEndsAt = Date.now() + (m.settings.speechSeconds + bonus) * 1000;
}
function buildSpeechOrder(m) {
    const alive = aliveSeats(m).sort((a, b) => a.seat - b.seat);
    if (alive.length === 0) {
        m.speechOrder = [];
        m.speechIdx = 0;
        return;
    }
    // Rotate the starting seat each day so the same person doesn't always open.
    const startPos = (m.round - 1) % alive.length;
    m.speechOrder = [...alive.slice(startPos), ...alive.slice(0, startPos)].map(s => s.userId);
    m.speechIdx = 0;
}
export function beginDay(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'day_announce')
        return null;
    m.nominations = [];
    m.nominatedBy = {};
    buildSpeechOrder(m);
    m.phase = 'speech';
    startSpeechClock(m);
    return m;
}
export function nextSpeaker(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'speech')
        return null;
    advanceSpeaker(m);
    return m;
}
/** Timer fired for the current speaker (byUserId null) or host skipped. */
export function advanceSpeakerAuto(matchId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'speech')
        return null;
    advanceSpeaker(m);
    return m;
}
/** Everyone has finished speaking — decide what comes next. */
function endSpeeches(m) {
    if (m.introRound) {
        // The day-0 acquaintance circle has no vote; the first night falls.
        m.introRound = false;
        pushLog(m, 'day', 'გაცნობის წრე დასრულდა');
        startNight(m);
        return;
    }
    if (m.nominations.length === 0) {
        m.phase = 'day_announce';
        m.announce = null;
        return;
    } // day over → night
    startVote(m);
}
function advanceSpeaker(m) {
    if (m.speechIdx + 1 >= m.speechOrder.length) {
        endSpeeches(m);
        return;
    }
    m.speechIdx += 1;
    m.floorGrab = null;
    // Skip anyone who died/was fouled out mid-round.
    while (m.speechIdx < m.speechOrder.length) {
        const s = findByUser(m, m.speechOrder[m.speechIdx]);
        if (s && s.alive)
            break;
        m.speechIdx += 1;
    }
    if (m.speechIdx >= m.speechOrder.length) {
        endSpeeches(m);
        return;
    }
    startSpeechClock(m);
}
export function extendSpeech(matchId, byUserId, seconds) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'speech')
        return null;
    m.speechEndsAt += Math.min(60, Math.max(5, seconds)) * 1000;
    return m;
}
/** The current speaker nominates one living player for the day's vote. */
export function nominate(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'speech' || m.introRound)
        return null; // no nominations in the acquaintance circle
    if (m.speechOrder[m.speechIdx] !== byUserId)
        return null; // only the active speaker
    const target = findByUser(m, targetUserId);
    if (!target || !target.alive)
        return null;
    // one nomination per speaker; changing it is allowed
    const prev = m.nominatedBy[byUserId];
    if (prev && prev !== targetUserId) {
        // remove old if nobody else nominated it
        if (!Object.entries(m.nominatedBy).some(([k, v]) => k !== byUserId && v === prev)) {
            m.nominations = m.nominations.filter(x => x !== prev);
        }
    }
    m.nominatedBy[byUserId] = targetUserId;
    if (!m.nominations.includes(targetUserId))
        m.nominations.push(targetUserId);
    return m;
}
// ── Vote ──────────────────────────────────────────────────────────────────────
function startVote(m) {
    m.votes = {};
    m.voteResult = null;
    m.voteRevote = false;
    m.phase = 'vote';
    m.voteIdx = 0;
    m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
}
/**
 * Vote for whoever is currently on the floor.
 *
 * One vote each, and it cannot be moved: a hand raised in a real game cannot be
 * un-raised once the moderator has counted it. `nomineeUserId` is still checked
 * against the candidate actually up, so a client cannot vote ahead for someone
 * whose turn has not come.
 */
export function castVote(matchId, byUserId, nomineeUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'vote')
        return null;
    const voter = findByUser(m, byUserId);
    if (!voter || !voter.alive)
        return null;
    if (m.votes[byUserId])
        return null; // already voted
    const current = m.nominations[m.voteIdx];
    if (!current || current !== nomineeUserId)
        return null; // not the candidate on the floor
    m.votes[byUserId] = current;
    // Everyone has now voted — there is nothing left to ask.
    if (aliveSeats(m).every(s => m.votes[s.userId]))
        resolveVote(m);
    return m;
}
/** The candidate on the floor right now, if the vote is running. */
export function currentCandidate(m) {
    return m.phase === 'vote' ? (m.nominations[m.voteIdx] ?? null) : null;
}
/**
 * Move to the next candidate — or close the vote.
 *
 * Past the last candidate, everyone who has not voted is counted for that last
 * one. That is the standing rule in table mafia: if you sat on your hands all
 * the way down the list, your vote goes to the last name on it. Without it, a
 * player can abstain their way out of every elimination.
 */
export function nextCandidate(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'vote' || m.hostId !== byUserId)
        return null;
    if (m.voteIdx < m.nominations.length - 1) {
        m.voteIdx += 1;
        return m;
    }
    const last = m.nominations[m.nominations.length - 1];
    if (last) {
        for (const seat of aliveSeats(m)) {
            if (!m.votes[seat.userId])
                m.votes[seat.userId] = last;
        }
    }
    resolveVote(m);
    return m;
}
function resolveVote(m) {
    const tally = {};
    for (const nominee of m.nominations)
        tally[nominee] = 0;
    for (const v of Object.values(m.votes))
        tally[v] = (tally[v] ?? 0) + 1;
    let bestN = -1;
    const tied = [];
    for (const [nominee, c] of Object.entries(tally)) {
        if (c > bestN) {
            bestN = c;
            tied.length = 0;
            tied.push(nominee);
        }
        else if (c === bestN)
            tied.push(nominee);
    }
    const noElim = () => { m.phase = 'day_announce'; m.announce = null; };
    if (bestN <= 0) {
        m.voteResult = { eliminatedUserId: null, tally };
        noElim();
        return;
    } // nobody voted
    if (tied.length === 1) {
        const elim = tied[0];
        m.voteResult = { eliminatedUserId: elim, tally };
        const s = findByUser(m, elim);
        if (s) {
            s.alive = false;
            s.eliminatedRound = m.round;
            s.eliminatedBy = 'vote';
            pushLog(m, 'day', `დღე ${m.round}: ხმით გაირიცხა ${seatLabel(s)}`);
        }
        if (checkWin(m))
            return;
        startLastWords(m, elim);
        return;
    }
    // Tie → one re-vote ("lift") between the tied candidates; a second tie spares everyone.
    if (!m.voteRevote) {
        m.nominations = [...tied];
        m.votes = {};
        m.voteResult = null;
        m.voteRevote = true;
        m.phase = 'vote';
        m.voteIdx = 0;
        m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
        return;
    }
    m.voteResult = { eliminatedUserId: null, tally };
    pushLog(m, 'day', `დღე ${m.round}: ხმები კვლავ გაიყო — არავინ გავიდა`);
    noElim();
}
/** Host closes the vote early (timer or manual). */
export function endVote(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'vote')
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    resolveVote(m);
    return m;
}
// ── Fouls ──────────────────────────────────────────────────────────────────────
export function giveFoul(matchId, byUserId, targetUserId, delta) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    const s = findByUser(m, targetUserId);
    if (!s || !s.alive)
        return null;
    s.fouls = Math.max(0, Math.min(XM_FOULS_TO_ELIMINATE, s.fouls + (delta >= 0 ? 1 : -1)));
    if (s.fouls >= XM_FOULS_TO_ELIMINATE) {
        s.alive = false;
        s.eliminatedRound = m.round;
        s.eliminatedBy = 'fouls';
        pushLog(m, 'foul', `${seatLabel(s)} — 4 ფაული, გარიცხულია`);
        // If the fouled-out player was the active speaker, move on.
        if (m.phase === 'speech' && m.speechOrder[m.speechIdx] === targetUserId)
            advanceSpeaker(m);
        checkWin(m);
    }
    return m;
}
// ── Player "foul": grab the mic for 6 seconds out of turn ───────────────────────
export const FLOOR_GRAB_MS = 6000;
export function grabFloor(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.phase !== 'speech' && m.phase !== 'vote' && m.phase !== 'last_words' && m.phase !== 'day_announce')
        return null;
    const seat = findByUser(m, byUserId);
    if (!seat || !seat.alive)
        return null;
    if (m.floorGrab && m.floorGrab.until > Date.now())
        return null; // one interjection at a time
    m.floorGrab = { userId: byUserId, until: Date.now() + FLOOR_GRAB_MS };
    return m;
}
// ── Last words ──────────────────────────────────────────────────────────────────
function startLastWords(m, userId) {
    m.lastWordsUserId = userId;
    m.phase = 'last_words';
    m.lastWordsEndsAt = Date.now() + m.settings.lastWordsSeconds * 1000;
}
/** Host (or timer) ends the farewell speech; flow returns to the day/night loop. */
export function endLastWords(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'last_words')
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    const seat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;
    m.lastWordsUserId = null;
    if (checkWin(m))
        return m;
    // A night victim's farewell → it's the morning, the host runs the day (announce
    // stands). A day elimination (vote/foul) → the day is over, so clear the announce;
    // day_announce with a null announce is the "night falls next" state.
    if (seat && seat.eliminatedBy === 'mafia') {
        m.phase = 'day_announce';
    }
    else {
        m.phase = 'day_announce';
        m.announce = null;
    }
    return m;
}
// ── Win detection ─────────────────────────────────────────────────────────────
function checkWin(m) {
    const mafia = aliveMafia(m).length;
    const town = aliveTown(m).length;
    let winner = null;
    if (mafia === 0)
        winner = 'town';
    else if (mafia >= town)
        winner = 'mafia';
    if (winner) {
        m.winner = winner;
        m.phase = 'finished';
        m.reveal = m.seats.map(s => ({ userId: s.userId, nickname: s.nickname, seat: s.seat, role: s.role }));
        pushLog(m, 'game', winner === 'mafia' ? '🔫 მაფიამ გაიმარჯვა' : '🏙 ქალაქმა გაიმარჯვა');
        return true;
    }
    return false;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'finished')
        return null;
    // Keep the host and connected seats; fold spectators into open seats.
    const keep = m.seats.filter(s => s.connected);
    for (const sp of m.spectators.filter(s => s.connected)) {
        if (keep.length >= m.maxSeats)
            break;
        keep.push({ userId: sp.userId, socketId: sp.socketId, nickname: sp.nickname, seat: 0, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false });
    }
    m.seats = keep;
    m.seats.forEach((s, i) => { s.seat = i + 1; s.role = null; s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null; s.cardIndex = null; });
    m.deck = [];
    m.spectators = [];
    m.phase = 'lobby';
    m.round = 0;
    m.introRound = false;
    m.speechOrder = [];
    m.speechIdx = 0;
    m.speechEndsAt = 0;
    m.nominations = [];
    m.nominatedBy = {};
    resetNight(m);
    m.nightEndsAt = 0;
    m.announce = null;
    m.votes = {};
    m.voteEndsAt = 0;
    m.voteRevote = false;
    m.voteResult = null;
    m.lastWordsUserId = null;
    m.lastWordsEndsAt = 0;
    m.floorGrab = null;
    m.winner = null;
    m.reveal = null;
    m.dissolved = false;
    m.log = [];
    return m;
}
// ── Safe state ─────────────────────────────────────────────────────────────────
export function getSafeState(m, viewerUserId) {
    const amHost = m.hostId === viewerUserId;
    const meSeat = findByUser(m, viewerUserId);
    const amSpectator = !amHost && !meSeat;
    const myRole = meSeat?.role ?? null;
    const iAmMafia = isMafiaRole(myRole);
    const gameOver = m.phase === 'finished';
    // Who may I see the role of?  Host & game-over: everyone. Mafia: fellow mafia. Else: myself only.
    const canSeeRole = (s) => {
        if (amHost || gameOver)
            return true;
        if (s.userId === viewerUserId)
            return true;
        if (iAmMafia && isMafiaRole(s.role))
            return true;
        return false;
    };
    const speakingUserId = m.phase === 'speech' ? (m.speechOrder[m.speechIdx] ?? null) : null;
    const seats = m.seats.map(s => ({
        userId: s.userId, socketId: s.socketId, nickname: s.nickname, seat: s.seat, connected: s.connected,
        alive: s.alive, fouls: s.fouls, eliminatedBy: s.eliminatedBy,
        role: canSeeRole(s) ? s.role : null,
        isSpeaking: s.userId === speakingUserId,
        isNominated: m.nominations.includes(s.userId),
        hasVoted: m.phase === 'vote' ? Boolean(m.votes[s.userId]) : false,
    }));
    const mateIds = iAmMafia && !gameOver
        ? m.seats.filter(s => isMafiaRole(s.role) && s.userId !== viewerUserId).map(s => s.userId)
        : [];
    // Night private info + whether I already acted. The check result persists past
    // the night (via seat.lastCheck) so the investigator keeps their information
    // even when the night auto-resolves the instant they act.
    let iActedTonight = false;
    let nightPrivate = null;
    if (meSeat && meSeat.alive && (meSeat.role === 'don' || meSeat.role === 'sheriff')) {
        nightPrivate = meSeat.lastCheck;
    }
    if (m.phase === 'night' && meSeat && meSeat.alive) {
        if (meSeat.role === 'don')
            iActedTonight = m.night.donCheck !== null && !!m.night.mafiaVotes[viewerUserId];
        else if (isMafiaRole(meSeat.role))
            iActedTonight = !!m.night.mafiaVotes[viewerUserId];
        else if (meSeat.role === 'sheriff')
            iActedTonight = m.night.sheriffCheck !== null;
    }
    const lastWordsSeat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;
    // Mafia see each other's kill picks live (consensus building).
    const mafiaPicks = (iAmMafia && m.phase === 'night')
        ? aliveMafia(m).filter(s => m.night.mafiaVotes[s.userId]).map(s => {
            const t = findByUser(m, m.night.mafiaVotes[s.userId]);
            return { userId: s.userId, nickname: s.nickname, targetId: m.night.mafiaVotes[s.userId], targetName: t?.nickname ?? '?' };
        })
        : [];
    return {
        id: m.id, code: m.code, phase: m.phase,
        hostId: m.hostId, hostName: m.hostName, hostSocketId: m.hostSocketId, hostConnected: m.hostConnected,
        maxSeats: m.maxSeats,
        seats,
        spectatorCount: m.spectators.filter(s => s.connected).length,
        settings: m.settings,
        setup: effectiveCounts(m),
        roleConfigCustom: m.roleConfig !== null,
        round: m.round,
        amHost, amSpectator,
        mySeat: meSeat?.seat ?? null,
        myRole,
        myAlive: meSeat?.alive ?? false,
        myFouls: meSeat?.fouls ?? 0,
        mateIds,
        cards: m.phase === 'assign' ? m.deck.map((_, index) => {
            const holder = m.seats.find(s => s.cardIndex === index) ?? null;
            return { index, claimedById: holder?.userId ?? null, claimedByName: holder?.nickname ?? null, claimedBySeat: holder?.seat ?? null };
        }) : [],
        myCardIndex: meSeat?.cardIndex ?? null,
        introRound: m.introRound,
        speakingUserId,
        speechEndsAt: m.phase === 'speech' ? m.speechEndsAt : 0,
        speechIdx: m.speechIdx,
        speechTotal: m.speechOrder.length,
        // Who is up after this one. The table wants to know whose turn is coming,
        // and working it out on the client would mean shipping the whole speech
        // order — which is a list of who is still alive, in order, to everybody.
        nextSpeaker: (() => {
            if (m.phase !== 'speech')
                return null;
            const nextId = m.speechOrder[m.speechIdx + 1];
            const seat = nextId ? findByUser(m, nextId) : null;
            return seat ? { nickname: seat.nickname, seat: seat.seat } : null;
        })(),
        nominations: m.nominations.map(uid => { const s = findByUser(m, uid); return { userId: uid, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 }; }),
        iNominated: !!(meSeat && m.nominatedBy[viewerUserId]),
        nightEndsAt: m.phase === 'night' ? m.nightEndsAt : 0,
        iActedTonight,
        nightPrivate,
        nightAllActed: m.phase === 'night' ? nightAllActed(m) : false,
        mafiaPicks,
        announce: (m.phase === 'day_announce' || m.phase === 'last_words') ? m.announce : null,
        voteEndsAt: m.phase === 'vote' ? m.voteEndsAt : 0,
        voteRevote: m.phase === 'vote' ? m.voteRevote : false,
        voteCandidate: (() => {
            const id = currentCandidate(m);
            if (!id)
                return null;
            const seat = findByUser(m, id);
            return seat ? { userId: id, nickname: seat.nickname, seat: seat.seat } : null;
        })(),
        voteIdx: m.phase === 'vote' ? m.voteIdx : 0,
        voteTotal: m.phase === 'vote' ? m.nominations.length : 0,
        voteIsLast: m.phase === 'vote' && m.voteIdx >= m.nominations.length - 1,
        myVote: m.votes[viewerUserId] ?? null,
        voteTally: (() => { const t = {}; for (const nm of m.nominations)
            t[nm] = 0; for (const v of Object.values(m.votes))
            t[v] = (t[v] ?? 0) + 1; return t; })(),
        voteResult: m.phase === 'vote' ? m.voteResult : null,
        lastWordsUserId: m.lastWordsUserId,
        lastWordsName: lastWordsSeat?.nickname ?? null,
        lastWordsEndsAt: m.phase === 'last_words' ? m.lastWordsEndsAt : 0,
        floorGrabUserId: m.floorGrab?.userId ?? null,
        floorGrabUntil: m.floorGrab?.until ?? 0,
        log: m.log.slice(-40),
        winner: m.winner,
        reveal: m.reveal,
        dissolved: m.dissolved,
        myUserId: viewerUserId,
    };
}
//# sourceMappingURL=sxvaMafiaService.js.map