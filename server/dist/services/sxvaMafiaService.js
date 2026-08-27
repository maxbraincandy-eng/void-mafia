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
import { SPORT_ROLES, SPORT_TIMES, canStartSport, sheriffSees, agreedTarget, teamHasActed, tribunalElectorate, tribunalVerdict, } from './sportMafiaRules.js';
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
/**
 * Role split for a given number of seated players (host excluded).
 *
 * The optional roles are off by default. They change the game a great deal —
 * a maniac makes the mafia's parity meaningless, a cult can take the table from
 * under everybody — so they are something a host turns on, not something that
 * appears because enough people sat down.
 *
 * THE DON IS THE SECOND MAFIOSO, NOT THE FIRST
 * ────────────────────────────────────────────
 * A small table gets one mafioso, and that one used to be the don — which
 * handed a six-player game a nightly sheriff check nobody asked for, and made
 * "no don" something a host had to go and turn off. The don is the mafia's
 * leader, and a leader of one is not a rank, it is a solitary player with an
 * extra power. So the plain mafia fills first: the don appears at seven
 * players, when there is somebody for them to lead. A host who wants one
 * sooner still adds it in the setup panel.
 */
export function roleCounts(n) {
    const mafiaTotal = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4; // includes the don
    const don = mafiaTotal >= 2 ? 1 : 0;
    const mafia = mafiaTotal - don;
    const sheriff = n >= 5 ? 1 : 0;
    const citizen = Math.max(0, n - don - mafia - sheriff);
    return { don, mafia, sheriff, doctor: 0, maniac: 0, cult: 0, citizen };
}
/** The role counts actually used for the current seat count: the host's override
 * (clamped to a playable shape), or the automatic split when none is set. */
export function effectiveCounts(m) {
    const n = m.seats.length;
    if (!m.roleConfig)
        return roleCounts(n);
    const cfg = m.roleConfig;
    const clamp = (v, max) => Math.max(0, Math.min(max, Math.floor(v || 0)));
    let don = clamp(cfg.don, 2);
    let mafia = clamp(cfg.mafia, 9);
    let sheriff = clamp(cfg.sheriff, 2);
    let doctor = clamp(cfg.doctor, 2);
    let maniac = clamp(cfg.maniac, 2);
    let cult = clamp(cfg.cult, 1);
    // A mafia game needs at least one mafia-team member.
    if (don + mafia === 0)
        mafia = 1;
    /*
     * Trim what does not fit, worst-first.
     *
     * Order matters and it is a design decision: the specials a host added on
     * purpose (cult, maniac, doctor) are the first to go when the table is too
     * small, because losing one of them leaves a game that still works. Losing the
     * mafia does not.
     *
     * The don goes before the last plain mafioso, for the same reason the
     * automatic split fills the mafia first: a don with nobody to lead is just a
     * lone player with a sheriff check attached.
     */
    const total = () => don + mafia + sheriff + doctor + maniac + cult;
    const trim = (take) => { while (total() > n)
        take(); };
    trim(() => {
        if (cult > 0)
            cult -= 1;
        else if (maniac > 0)
            maniac -= 1;
        else if (doctor > 0)
            doctor -= 1;
        else if (sheriff > 0)
            sheriff -= 1;
        else if (don > 0 && mafia > 0)
            don -= 1;
        else if (mafia > 0)
            mafia -= 1;
        else if (don > 0)
            don -= 1;
        else
            return;
    });
    if (don + mafia === 0 && n >= 2)
        mafia = 1;
    // And always leave at least one plain townsperson, or the day has nobody in it.
    const citizen = Math.max(0, n - total());
    return { don, mafia, sheriff, doctor, maniac, cult, citizen };
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
        night: emptyNight(),
        nightEndsAt: 0,
        announce: null,
        votes: {}, voteIdx: 0, voteEndsAt: 0, voteRevote: false, voteResult: null,
        lastWordsUserId: null, lastWordsEndsAt: 0, lastWordsQueue: [], lastHeal: null, floorGrab: null,
        winner: null, reveal: null, dissolved: false, hostLeft: false, createdAt: Date.now(),
        sport: false, sportRequested: false, tribunal: null,
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
export function listMatchesForMod() {
    return [...matches.values()]
        .filter(m => m.phase !== 'finished' && !m.dissolved)
        .map(m => ({
        id: m.id,
        code: m.code,
        phase: m.phase,
        round: m.round,
        playerCount: m.seats.filter(s => !s.left).length,
        hostName: m.hostName,
        players: m.seats.filter(s => !s.left).map(s => ({
            id: s.userId, name: s.nickname, seat: s.seat,
            isAlive: s.alive, isConnected: s.connected, profileId: s.userId,
            // role and team intentionally omitted — never expose a live game
        })),
    }));
}
/** Is this id a hosted table? Lets the shared mod actions route correctly. */
export function isHostedMatch(id) {
    return matches.has(id);
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
        m.seats.push({ userId, socketId, nickname, seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false });
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
        eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false,
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
        // Walking out is the one way to be gone without dying, so it is the one
        // path that does not already pass through `checkWin`.
        dissolveCultIfLeaderGone(m);
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
        eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false,
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
    const { don, mafia, sheriff, doctor, maniac, cult } = effectiveCounts(m);
    const pool = [
        ...Array(don).fill('don'),
        ...Array(mafia).fill('mafia'),
        ...Array(sheriff).fill('sheriff'),
        ...Array(doctor).fill('doctor'),
        ...Array(maniac).fill('maniac'),
        ...Array(cult).fill('cult'),
    ];
    while (pool.length < n)
        pool.push('citizen');
    m.deck = shuffle(pool);
    m.seats.forEach(s => {
        s.role = null;
        s.cardIndex = null;
        s.cult = false;
        s.cultRevealed = false;
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
    /*
     * Which game is this? Answered once, here, and never again.
     *
     * The host asks for sport in the lobby; the table has to be ten-handed. If
     * both hold, the composition is forced to the tournament split — the host
     * does not get to adjust it, because a table anybody can tune is a house
     * rule and sport's premise is that every table is the same table.
     *
     * If sport was asked for and the table does not qualify, the match refuses
     * to start rather than quietly dealing the casual rules under the sport
     * name. `startSportError` is what tells the host which half is missing.
     */
    if (m.sportRequested) {
        if (!canStartSport(m.seats.length, true).ok)
            return null;
        m.sport = true;
        m.roleConfig = { ...SPORT_ROLES };
    }
    else {
        m.sport = false;
    }
    m.tribunal = null;
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
    // The cult leader starts the cult of one, and knows it.
    if (seat.role === 'cult') {
        seat.cult = true;
        seat.cultRevealed = true;
    }
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
            doctor: Math.max(0, Math.min(2, Math.floor(Number(cfg.doctor ?? 0)))),
            maniac: Math.max(0, Math.min(2, Math.floor(Number(cfg.maniac ?? 0)))),
            cult: Math.max(0, Math.min(1, Math.floor(Number(cfg.cult ?? 0)))),
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
    /*
     * Sport is asked for in the lobby and nowhere else.
     *
     * The timings are the tournament's, not the host's, so turning it on
     * overwrites them — a table where the speeches are ninety seconds is not the
     * tournament ruleset with a tweak, it is a different game. Turning it back
     * off leaves them where sport put them rather than guessing at what they
     * were, which is honest: the host can set them again.
     */
    if (typeof patch.sport === 'boolean' && m.phase === 'lobby') {
        m.sportRequested = patch.sport;
        if (patch.sport) {
            m.settings.speechSeconds = SPORT_TIMES.speech;
            m.settings.lastWordsSeconds = SPORT_TIMES.lastWords;
            m.roleConfig = { ...SPORT_ROLES };
        }
    }
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
function emptyNight() {
    return {
        mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null,
        doctorHeal: null, maniacKill: null, cultConvert: null, cultResult: null,
    };
}
function resetNight(m) {
    m.night = emptyNight();
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
    /*
     * Having acted is not the same as having agreed.
     *
     * In sport a team that all pressed different names is finished — they have
     * simply wasted the night — and the night has to close on that, or a
     * disagreeing team would hang the game waiting for a consensus the rules do
     * not require.
     */
    const allMafiaVoted = mafia.length === 0
        || (m.sport ? teamHasActed(mafia, m.night.mafiaVotes) : mafia.every(s => m.night.mafiaVotes[s.userId]));
    const has = (role) => m.seats.some(s => s.alive && s.role === role);
    return allMafiaVoted
        && (!has('don') || m.night.donCheck !== null)
        && (!has('sheriff') || m.night.sheriffCheck !== null)
        && (!has('doctor') || m.night.doctorHeal !== null)
        && (!has('maniac') || m.night.maniacKill !== null)
        && (!has('cult') || m.night.cultConvert !== null);
}
// ── The optional roles' night actions ────────────────────────────────────────
/**
 * The doctor picks tonight's patient.
 *
 * Not the same person two nights running — otherwise one player is simply
 * immortal and the mafia has nothing to aim at. Healing yourself is allowed;
 * healing yourself every night is not, by the same rule.
 */
export function doctorHeal(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const doc = findByUser(m, byUserId);
    if (!doc || !doc.alive || doc.role !== 'doctor')
        return null;
    if (m.night.doctorHeal !== null)
        return null; // one patient a night
    const target = findByUser(m, targetUserId);
    if (!target || !target.alive)
        return null;
    if (m.lastHeal === targetUserId)
        return null; // not twice running
    m.night.doctorHeal = targetUserId;
    maybeAutoNight(m);
    return m;
}
/** The maniac picks tonight's target. Nobody's friend, so anyone but themselves. */
export function maniacKill(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const maniac = findByUser(m, byUserId);
    if (!maniac || !maniac.alive || maniac.role !== 'maniac')
        return null;
    if (m.night.maniacKill !== null)
        return null;
    const target = findByUser(m, targetUserId);
    if (!target || !target.alive || target.userId === byUserId)
        return null;
    m.night.maniacKill = targetUserId;
    maybeAutoNight(m);
    return m;
}
/**
 * The cult leader tries to convert somebody.
 *
 * Whether it takes is decided at resolution, not here: the leader finds out
 * with everyone else's night, which is what makes trying it on a quiet player
 * a real gamble rather than a free probe.
 */
export function cultConvert(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const leader = findByUser(m, byUserId);
    if (!leader || !leader.alive || leader.role !== 'cult')
        return null;
    if (m.night.cultConvert !== null)
        return null;
    const target = findByUser(m, targetUserId);
    if (!target || !target.alive || target.userId === byUserId)
        return null;
    m.night.cultConvert = targetUserId;
    maybeAutoNight(m);
    return m;
}
function startNight(m) {
    resetNight(m);
    /**
     * Night falls, and last night's converts learn what they are.
     *
     * The delay is the point. A player converted on night one spends the whole of
     * day one not knowing — they argue for the town in good faith, and the table
     * has nothing to read on their face. Only when the next night comes do they
     * open their eyes and find out whose side they are on.
     */
    for (const s of m.seats) {
        if (s.cult && !s.cultRevealed)
            s.cultRevealed = true;
    }
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
    /*
     * Sport opens on a night with no killing in it.
     *
     * The mafia meet, see each other, and agree the order they mean to shoot in.
     * That plan is the only coordination they get all game — from the next night
     * on they shoot blind — so the phase is a minute of planning rather than the
     * casual rules' acquaintance screen, and it is the reason the rest of the
     * mode works at all.
     */
    if (m.sport) {
        m.phase = 'plan_night';
        m.nightEndsAt = Date.now() + SPORT_TIMES.planNight * 1000;
        pushLog(m, 'night', 'დაგეგმვის ღამე — მაფია ერთმანეთს ცნობს და გეგმავს');
        return m;
    }
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
/**
 * Sport: the planning night ends and the first day begins.
 *
 * Straight into real speeches — no acquaintance circle. The casual rules open
 * with a round where nobody may nominate, which is a gentle way to start;
 * sport's first day counts, and the very first speaker may put somebody up.
 */
export function endPlanNight(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'plan_night')
        return null;
    m.introRound = false;
    m.floorGrab = null;
    m.nightEndsAt = 0;
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
/**
 * The mafia's kill vote.
 *
 * The don must check first.
 *
 * They used to be able to do it in either order, and choosing the kill last
 * meant the night resolved the instant the check landed — the answer they had
 * just paid a whole night for flashed past on its way to the morning. Checking
 * first puts the result on screen while the kill is still being decided, which
 * is also the order it is useful in.
 */
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
    if (actor.role === 'don' && m.night.donCheck === null)
        return null; // check first — see above
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
    // Spelled out, not a tick: this is the one piece of information the don gets
    // all night and it should not need decoding.
    actor.lastCheck = m.night.donResult
        ? `🎩 ${seatLabel(target)} — შერიფია ✅`
        : `🎩 ${seatLabel(target)} — შერიფი არ არის ❌`;
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
    // In sport the don is the mafia's insurance: the sheriff's check on them
    // comes back clean. Everywhere else `isMafiaRole` answers, and the don is
    // caught like anyone else.
    m.night.sheriffResult = m.sport ? sheriffSees(target.role) : isMafiaRole(target.role);
    actor.lastCheck = m.night.sheriffResult
        ? `🔎 ${seatLabel(target)} — მაფიაა ❌`
        : `🔎 ${seatLabel(target)} — მშვიდობიანია ✅`;
    maybeAutoNight(m);
    return m;
}
function resolveKill(m) {
    /*
     * Sport: everybody, or nobody.
     *
     * No plurality and no don tiebreak. Every living member of the team has to
     * have pressed, and all of them the same name — one absence or one
     * disagreement and the night is quiet. Blind coordination is the mechanic
     * the mode is built on; a tiebreak would hand it straight back.
     */
    if (m.sport) {
        const target = agreedTarget(aliveMafia(m), m.night.mafiaVotes);
        if (!target)
            return null;
        const victim = findByUser(m, target);
        return victim && victim.alive && !isMafiaRole(victim.role) ? victim : null;
    }
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
    /*
     * Order is the rule here, not an implementation detail.
     *
     *   1. the cult converts — a convert can still be shot the same night
     *   2. the mafia shoot
     *   3. the maniac shoots
     *   4. the doctor's patient survives whatever came for them
     *
     * The doctor is resolved last on purpose: one save covers every knife aimed
     * at that person, so the mafia and the maniac picking the same target waste
     * the night between them.
     */
    // 1. Conversion.
    const convertId = m.night.cultConvert;
    if (convertId) {
        const leader = m.seats.find(x => x.alive && x.role === 'cult');
        const target = findByUser(m, convertId);
        const immune = !target || !target.alive || isMafiaRole(target.role) || target.role === 'maniac' || target.cult;
        if (leader && target && !immune) {
            target.cult = true;
            m.night.cultResult = 'converted';
            pushLog(m, 'night', `ღამე ${m.round}: კულტმა მოიმხრო ${seatLabel(target)}`);
        }
        else {
            m.night.cultResult = 'immune';
        }
    }
    // 2 & 3. The knives.
    const saved = m.night.doctorHeal;
    const doomed = new Map();
    const mafiaVictim = resolveKill(m);
    if (mafiaVictim && mafiaVictim.userId !== saved)
        doomed.set(mafiaVictim.userId, 'mafia');
    const maniacTargetId = m.night.maniacKill;
    if (maniacTargetId && maniacTargetId !== saved) {
        const maniac = m.seats.find(x => x.alive && x.role === 'maniac');
        const target = findByUser(m, maniacTargetId);
        if (maniac && target && target.alive)
            doomed.set(target.userId, 'mafia');
    }
    // 4. Apply.
    const killed = [];
    for (const [userId, by] of doomed) {
        const seat = findByUser(m, userId);
        if (!seat || !seat.alive)
            continue;
        seat.alive = false;
        seat.eliminatedRound = m.round;
        seat.eliminatedBy = by;
        killed.push({ userId: seat.userId, nickname: seat.nickname, seat: seat.seat });
    }
    killed.sort((a, b) => a.seat - b.seat);
    m.night.doctorHeal = saved;
    m.lastHeal = saved;
    m.announce = { round: m.round, killed };
    pushLog(m, 'night', killed.length
        ? `ღამე ${m.round}: მოკლეს ${killed.map(k => `#${k.seat} ${k.nickname}`).join(', ')}`
        : `ღამე ${m.round}: მშვიდი ღამე — მსხვერპლი არ არის`);
    m.phase = 'day_announce';
    if (checkWin(m))
        return;
    // Farewells, in seat order. Two can die in one night, and both get to speak.
    m.lastWordsQueue = killed.map(k => k.userId);
    const first = m.lastWordsQueue.shift();
    if (first)
        startLastWords(m, first);
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
// ── Tribunal (sport only) ─────────────────────────────────────────────────────
/**
 * The vote could not separate them, so they answer for themselves.
 *
 * Each tied player gets half a minute, in seat order so nobody can argue about
 * who spoke when. Only after all of them have spoken does the town vote, and
 * the question it is asked is not "which one" — that has already failed — but
 * whether to lose both or neither.
 */
function startTribunal(m, tied) {
    // Seat order, so the running order is a fact about the table rather than a
    // by-product of how the tally happened to iterate.
    const onTrial = m.seats
        .filter(s => tied.includes(s.userId) && s.alive)
        .sort((a, b) => a.seat - b.seat)
        .map(s => s.userId);
    if (onTrial.length < 2) {
        // Everyone tied but one is already gone. Nothing to try.
        m.tribunal = null;
        m.phase = 'day_announce';
        m.announce = null;
        return;
    }
    m.tribunal = {
        onTrial,
        defenseIdx: 0,
        defenseEndsAt: Date.now() + SPORT_TIMES.tribunalDefense * 1000,
        votes: {},
        endsAt: 0,
        verdict: null,
    };
    m.phase = 'tribunal_defense';
    pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალი — ${onTrial.length} მოთამაშე`);
}
/**
 * Next defence, or open the vote once they have all spoken.
 *
 * Host-driven like every other clock in hosted mafia: the timer is a guide for
 * the room, and the moderator decides when somebody has finished.
 */
export function nextTribunalDefense(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'tribunal_defense' || m.hostId !== byUserId || !m.tribunal)
        return null;
    if (m.tribunal.defenseIdx < m.tribunal.onTrial.length - 1) {
        m.tribunal.defenseIdx += 1;
        m.tribunal.defenseEndsAt = Date.now() + SPORT_TIMES.tribunalDefense * 1000;
        return m;
    }
    m.phase = 'tribunal_vote';
    m.tribunal.endsAt = Date.now() + SPORT_TIMES.tribunalVote * 1000;
    return m;
}
/**
 * One town member's verdict.
 *
 * Not the players on trial: their fate is the question. Letting them answer it
 * turns "should we lose both?" into arithmetic about how many of the rest are
 * needed, which is not what a tribunal is for.
 */
export function tribunalVote(matchId, byUserId, verdict) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'tribunal_vote' || !m.tribunal)
        return null;
    if (verdict !== 'punish' && verdict !== 'free')
        return null;
    const voter = findByUser(m, byUserId);
    if (!voter || !voter.alive)
        return null;
    if (m.tribunal.onTrial.includes(byUserId))
        return null;
    if (m.tribunal.votes[byUserId])
        return null; // one verdict each, no changing it
    m.tribunal.votes[byUserId] = verdict;
    // Everyone entitled to a say has had one; there is nothing left to wait for.
    const electorate = tribunalElectorate(m.seats, m.tribunal.onTrial);
    if (electorate.every(s => m.tribunal.votes[s.userId]))
        resolveTribunal(m);
    return m;
}
/** Host closes the tribunal early, or its clock runs out. */
export function endTribunalVote(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'tribunal_vote' || !m.tribunal)
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    resolveTribunal(m);
    return m;
}
/**
 * Both, or neither.
 *
 * A strict majority of those who actually voted is needed to punish; a tie, an
 * empty room and a silent one all free them. Taking two players out of a
 * ten-hand game is the heavier outcome and the burden belongs on the side
 * asking for it.
 *
 * The order at the end matters: the win check runs before the farewells, so a
 * tribunal that ends the game does not queue up last words for a match that is
 * already over.
 */
function resolveTribunal(m) {
    const t = m.tribunal;
    if (!t)
        return;
    let punish = 0, free = 0;
    for (const v of Object.values(t.votes))
        (v === 'punish' ? punish++ : free++);
    const verdict = tribunalVerdict(punish, free);
    t.verdict = verdict;
    if (verdict === 'free') {
        pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალმა გაათავისუფლა (${punish}/${free})`);
        m.tribunal = null;
        m.phase = 'day_announce';
        m.announce = null;
        return;
    }
    const doomed = [];
    for (const id of t.onTrial) {
        const s = findByUser(m, id);
        if (!s || !s.alive)
            continue;
        s.alive = false;
        s.eliminatedRound = m.round;
        s.eliminatedBy = 'vote';
        doomed.push(id);
        pushLog(m, 'day', `დღე ${m.round}: ტრიბუნალით გაირიცხა ${seatLabel(s)}`);
    }
    m.tribunal = null;
    if (checkWin(m))
        return;
    // Each of them gets their minute, in the order they stood trial.
    if (doomed.length > 0) {
        startLastWords(m, doomed[0]);
        m.lastWordsQueue.push(...doomed.slice(1));
        return;
    }
    m.phase = 'day_announce';
    m.announce = null;
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
    /*
     * Sport: a tie goes to tribunal, not to a re-vote.
     *
     * The tied players defend themselves, and if the town still cannot separate
     * them it answers a different question — lose both, or neither. Re-running
     * the same vote asks the room to change its mind with no new information;
     * the defence is the new information.
     */
    if (m.sport) {
        m.voteResult = { eliminatedUserId: null, tally };
        startTribunal(m, tied);
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
    // Somebody else died in the same night and is still owed a farewell.
    const next = m.lastWordsQueue.shift();
    if (next) {
        startLastWords(m, next);
        return m;
    }
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
// ── The cult outlives nobody ──────────────────────────────────────────────────
/**
 * The leader is gone, so the cult is gone with them.
 *
 * A cult is one person's hold over other people, not a faction that recruits a
 * successor. When the leader is shot, voted out, fouled out or simply walks out
 * of the room, everyone they turned comes back to the side they were dealt —
 * the doctor is the town's doctor again, the citizen is a citizen again, and
 * they win or lose with their own colour.
 *
 * Two reasons it has to work this way rather than leaving the converts behind
 * as a leaderless cult. Such a cult can never convert again, so it can only
 * win by outliving everyone else — a faction with no play left, dragging the
 * game out. And a convert who was never told (the leader died before the next
 * night fell) would be quietly locked out of every win in the game without ever
 * learning why.
 *
 * Called from `checkWin`, which every death already funnels through, and from
 * `leaveMatch`, which is the one way out that is not a death.
 */
function dissolveCultIfLeaderGone(m) {
    const converts = m.seats.filter(s => s.cult && s.role !== 'cult');
    if (converts.length === 0)
        return;
    const leader = m.seats.find(s => s.role === 'cult' && s.alive && !s.left);
    if (leader)
        return;
    for (const s of converts) {
        s.cult = false;
        s.cultRevealed = false;
    }
    pushLog(m, 'game', '🕯 კულტის ლიდერი აღარაა — მისი მიმდევრები დაუბრუნდნენ თავიანთ როლს');
}
// ── Win detection ─────────────────────────────────────────────────────────────
/**
 * Who, if anybody, has won.
 *
 * The order of these checks is the ruleset. With four possible factions the
 * same board can satisfy two of them, and which one is asked first decides the
 * game — so they are asked in the order a table would settle them.
 */
function checkWin(m) {
    // Before anyone is counted: if the leader has fallen, the cult is not a side
    // any more, and its former members count for the colour they were dealt.
    dissolveCultIfLeaderGone(m);
    const alive = aliveSeats(m);
    const mafia = alive.filter(s => isMafiaRole(s.role) && !s.cult);
    const maniac = alive.filter(s => s.role === 'maniac');
    const cult = alive.filter(s => s.cult);
    let winner = null;
    // 1. Nobody hostile left.
    if (mafia.length === 0 && maniac.length === 0 && cult.length === 0)
        winner = 'town';
    // 2. The maniac finishes the last one standing in the night, so two is over.
    else if (maniac.length > 0 && alive.length <= 2)
        winner = 'maniac';
    // 3. The whole table is cult.
    else if (cult.length > 0 && cult.length === alive.length)
        winner = 'cult';
    // 4. Mafia parity — but not while a maniac is still shooting at them too.
    else if (mafia.length > 0 && maniac.length === 0 && mafia.length >= alive.length - mafia.length)
        winner = 'mafia';
    if (winner) {
        m.winner = winner;
        m.phase = 'finished';
        m.reveal = m.seats.map(s => ({ userId: s.userId, nickname: s.nickname, seat: s.seat, role: s.role }));
        pushLog(m, 'game', winner === 'mafia' ? '🔫 მაფიამ გაიმარჯვა'
            : winner === 'maniac' ? '🔪 მანიაკმა გაიმარჯვა'
                : winner === 'cult' ? '🕯 კულტმა გაიმარჯვა'
                    : '🏙 ქალაქმა გაიმარჯვა');
        return true;
    }
    return false;
}
/**
 * Take the room back to the lobby.
 *
 * `rematch` is this after a finished game; `endGame` is this from the middle of
 * one. They are the same reset, and they were worth separating from
 * `dissolveMatch` — until now the only way out of a running game was to close
 * the room entirely, which throws everybody out to start again from a new code.
 */
function resetToLobby(m) {
    // Keep the host and connected seats; fold spectators into open seats.
    const keep = m.seats.filter(s => s.connected);
    for (const sp of m.spectators.filter(s => s.connected)) {
        if (keep.length >= m.maxSeats)
            break;
        keep.push({ userId: sp.userId, socketId: sp.socketId, nickname: sp.nickname, seat: 0, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null, lastCheck: null, cardIndex: null, left: false, cult: false, cultRevealed: false });
    }
    m.seats = keep;
    m.seats.forEach((s, i) => { s.seat = i + 1; s.role = null; s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; s.lastCheck = null; s.cardIndex = null; s.cult = false; s.cultRevealed = false; });
    m.lastHeal = null;
    m.lastWordsQueue = [];
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
    m.hostLeft = false;
}
export function endGame(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (m.phase === 'lobby' || m.dissolved)
        return null;
    pushLog(m, 'game', '⏹ ჰოსტმა თამაში დაასრულა — ლობი');
    resetToLobby(m);
    return m;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'finished')
        return null;
    resetToLobby(m);
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
    /**
     * Do I know I am in the cult?
     *
     * Belonging and knowing are two different things. A convert belongs from the
     * moment the leader picks them — it is already what decides who wins — but
     * they are told only when the next night falls. Every window into the cult
     * (my own badge, who my brethren are, the mark on their tile) opens on this
     * one flag, so there is no seam where a convert learns early through a side
     * door. The leader is revealed to themselves the instant they take the card.
     */
    const iKnowCult = Boolean(meSeat?.cult && meSeat.cultRevealed);
    const seats = m.seats.map(s => ({
        userId: s.userId, socketId: s.socketId, nickname: s.nickname, seat: s.seat, connected: s.connected,
        alive: s.alive, fouls: s.fouls, eliminatedBy: s.eliminatedBy,
        role: canSeeRole(s) ? s.role : null,
        isSpeaking: s.userId === speakingUserId,
        isNominated: m.nominations.includes(s.userId),
        hasVoted: m.phase === 'vote' ? Boolean(m.votes[s.userId]) : false,
        // Only the cult sees the cult. Everyone sees it once the game is over.
        cult: (gameOver || iKnowCult) ? s.cult : false,
    }));
    /*
     * Who you know.
     *
     * The mafia know each other. The cult knows itself — a convert is told they
     * are in it and who else is, which is the whole point of a cult. Everybody
     * else knows nobody.
     */
    const mateIds = gameOver ? []
        : iAmMafia ? m.seats.filter(s => isMafiaRole(s.role) && s.userId !== viewerUserId).map(s => s.userId)
            : iKnowCult ? m.seats.filter(s => s.cult && s.userId !== viewerUserId).map(s => s.userId)
                : [];
    // Night private info + whether I already acted. The check result persists past
    // the night (via seat.lastCheck) so the investigator keeps their information
    // even when the night auto-resolves the instant they act.
    let iActedTonight = false;
    let nightPrivate = null;
    if (meSeat && meSeat.alive && (meSeat.role === 'don' || meSeat.role === 'sheriff')) {
        nightPrivate = meSeat.lastCheck;
    }
    // The cult leader learns whether last night's attempt took — and only they do.
    if (meSeat && meSeat.alive && meSeat.role === 'cult' && m.night.cultResult) {
        const t = m.night.cultConvert ? findByUser(m, m.night.cultConvert) : null;
        nightPrivate = m.night.cultResult === 'converted'
            ? `✅ ${t ? seatLabel(t) : 'ის'} შენს მხარესაა`
            : `❌ ${t ? seatLabel(t) : 'ის'} ვერ მოიმხრე`;
    }
    if (m.phase === 'night' && meSeat && meSeat.alive) {
        if (meSeat.role === 'don')
            iActedTonight = m.night.donCheck !== null && !!m.night.mafiaVotes[viewerUserId];
        else if (isMafiaRole(meSeat.role))
            iActedTonight = !!m.night.mafiaVotes[viewerUserId];
        else if (meSeat.role === 'sheriff')
            iActedTonight = m.night.sheriffCheck !== null;
        else if (meSeat.role === 'doctor')
            iActedTonight = m.night.doctorHeal !== null;
        else if (meSeat.role === 'maniac')
            iActedTonight = m.night.maniacKill !== null;
        else if (meSeat.role === 'cult')
            iActedTonight = m.night.cultConvert !== null;
    }
    const lastWordsSeat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;
    /*
     * Mafia see each other's kill picks live (consensus building) — except in
     * sport, where they shoot blind.
     *
     * This projection IS the rule, not a display of it. Sending the picks and
     * hiding them in the UI would leave them one devtools panel away, and the
     * whole mode rests on nobody being able to see them.
     */
    const mafiaPicks = (iAmMafia && !m.sport && m.phase === 'night')
        ? aliveMafia(m).filter(s => m.night.mafiaVotes[s.userId]).map(s => {
            const t = findByUser(m, m.night.mafiaVotes[s.userId]);
            return { userId: s.userId, nickname: s.nickname, targetId: m.night.mafiaVotes[s.userId], targetName: t?.nickname ?? '?' };
        })
        : [];
    /*
     * The tribunal, projected.
     *
     * The running tally is withheld until it is over. Sending it live would let
     * the last voters count exactly how many more are needed, and the point of
     * asking the town at all is that each of them answers for themselves.
     */
    const t = m.tribunal;
    const tribunal = t ? {
        onTrial: t.onTrial.map(id => {
            const s = findByUser(m, id);
            return { userId: id, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 };
        }),
        defenseIdx: t.defenseIdx,
        defenseEndsAt: t.defenseEndsAt,
        speakingUserId: m.phase === 'tribunal_defense' ? (t.onTrial[t.defenseIdx] ?? null) : null,
        endsAt: t.endsAt,
        iAmOnTrial: t.onTrial.includes(viewerUserId),
        canVote: Boolean(meSeat?.alive) && !t.onTrial.includes(viewerUserId),
        myVerdict: t.votes[viewerUserId] ?? null,
        votesCast: Object.keys(t.votes).length,
        votesTotal: tribunalElectorate(m.seats, t.onTrial).length,
        verdict: t.verdict,
        tally: t.verdict
            ? Object.values(t.votes).reduce((acc, v) => (v === 'punish' ? { ...acc, punish: acc.punish + 1 } : { ...acc, free: acc.free + 1 }), { punish: 0, free: 0 })
            : null,
    } : null;
    return {
        id: m.id, code: m.code, phase: m.phase,
        sport: m.sport,
        sportRequested: m.sportRequested,
        sportBlockedReason: m.sportRequested && m.phase === 'lobby'
            ? canStartSport(m.seats.length, true).reason
            : null,
        tribunal,
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
        myCult: iKnowCult,
        healBlockedId: meSeat?.role === 'doctor' ? m.lastHeal : null,
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
        iCheckedTonight: m.phase === 'night' && meSeat?.alive
            ? (meSeat.role === 'don' ? m.night.donCheck !== null
                : meSeat.role === 'sheriff' ? m.night.sheriffCheck !== null
                    : false)
            : false,
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