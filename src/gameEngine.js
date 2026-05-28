const { applyGameResult } = require('./services/userService');

const ROLES = [
  { key: 'citizen', label: 'Citizen', team: 'citizen', basic: true, description: 'Peaceful resident. Votes during the day.' },
  { key: 'mafia', label: 'Mafia', team: 'mafia', basic: true, description: 'Kills citizens at night.', nightAction: 'kill' },
  { key: 'don', label: 'Don', team: 'mafia', description: 'Mafia leader. Can search sheriff.', nightAction: 'check_sheriff', unique: true },
  { key: 'doctor', label: 'Doctor', team: 'citizen', basic: true, description: 'Saves one player at night.', nightAction: 'heal', unique: true, canSelf: true },
  { key: 'sheriff', label: 'Sheriff', team: 'citizen', basic: true, description: 'Checks if a player is Mafia.', nightAction: 'check_mafia', unique: true },
  { key: 'detective', label: 'Detective', team: 'citizen', description: 'Investigates exact team clues.', nightAction: 'detect' },
  { key: 'bodyguard', label: 'Bodyguard', team: 'citizen', description: 'Protects a player. May stop a kill.', nightAction: 'guard', canSelf: false },
  { key: 'serial_killer', label: 'Serial Killer', team: 'solo', description: 'Kills at night and wins alone.', nightAction: 'solo_kill' },
  { key: 'maniac', label: 'Maniac', team: 'solo', description: 'Blocks a target at night.', nightAction: 'block' },
  { key: 'lady', label: 'Lady', team: 'citizen', description: 'Silences one player for the next day.', nightAction: 'silence' },
  { key: 'spy', label: 'Spy', team: 'mafia', description: 'Mafia support role.', nightAction: 'spy' },
  { key: 'fortune_teller', label: 'Fortune Teller', team: 'citizen', description: 'Can reveal a dead player role.', nightAction: 'reveal_dead' },
  { key: 'bulletproof', label: 'Bulletproof', team: 'citizen', description: 'Survives the first attack automatically.', passive: 'vest' },
  { key: 'journalist', label: 'Journalist', team: 'citizen', description: 'Writes public notes.', nightAction: 'note' },
  { key: 'lawyer', label: 'Lawyer', team: 'mafia', description: 'Can protect a Mafia player from check.', nightAction: 'cover' }
];
const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r]));

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  minPlayers: 4,
  language: 'Georgian',
  privateRoom: false,
  spectatorMode: true,
  revealRoles: false,
  noNominationFirstDay: true,
  speakerRotation: true,
  generalDiscussion: true,
  lastWords: true,
  drawVote: 'no_execution',
  timers: { role_reveal: 8, night: 45, night_result: 8, day: 90, nomination: 45, vote: 35, last_words: 20 },
  roles: { mafia: 1, don: 0, doctor: 1, sheriff: 1, detective: 0, bodyguard: 0, serial_killer: 0, maniac: 0, lady: 0, spy: 0, fortune_teller: 0, bulletproof: 0, journalist: 0, lawyer: 0 }
};

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function code() { return String(Math.floor(100000 + Math.random() * 900000)); }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function nowIso() { return new Date().toISOString(); }
function safeText(v, fallback = '') { return String(v || fallback).trim().slice(0, 500); }
function publicPlayer(p, viewer) {
  const isMe = Number(viewer?.userId) === Number(p.userId);
  const canSeeRole = isMe || viewer?.isSpectator || viewer?.isHost || viewer?.phase === 'ended' || viewer?.revealRoles || !p.alive;
  return {
    id: p.id, userId: p.userId, socketId: p.socketId, seat: p.seat, nickname: p.nickname, avatar: p.avatar,
    connected: p.connected, alive: p.alive, muted: p.muted, micOn: p.micOn, cameraOn: p.cameraOn, speaking: p.speaking,
    clanId: p.clanId || '', level: p.level || 1, rank: p.rank || 'Newbie', emotion: p.emotion || '', warnings: p.warnings || 0,
    role: canSeeRole ? p.role : '', team: canSeeRole ? p.team : ''
  };
}
function viewerFor(room, viewerUserId) {
  const p = room.players.find(x => Number(x.userId) === Number(viewerUserId));
  const s = room.spectators.find(x => Number(x.userId) === Number(viewerUserId));
  return { userId: Number(viewerUserId || 0), isHost: Number(room.hostUserId) === Number(viewerUserId), isSpectator: !!s && !p, role: p?.role || '', team: p?.team || '', alive: p?.alive !== false, phase: room.phase, revealRoles: !!room.settings.revealRoles };
}
function publicRoom(room, viewerUserId = 0) {
  const viewer = viewerFor(room, viewerUserId);
  return {
    id: room.id, name: room.name, phase: room.phase, phaseLabel: phaseLabel(room.phase), day: room.day, timer: room.timer,
    hostUserId: room.hostUserId, hostName: room.hostName, settings: room.settings, createdAt: room.createdAt, startedAt: room.startedAt,
    players: room.players.map(p => publicPlayer(p, viewer)), spectators: room.spectators.map(s => ({ userId: s.userId, nickname: s.nickname, avatar: s.avatar })),
    chat: room.chat.slice(-100), events: room.events.slice(-100), privateEvents: privateEventsFor(room, viewer), viewer,
    cards: roleCounts(room.players), nominatedIds: room.nominatedIds || [], votes: publicVotes(room, viewer), gameOver: room.gameOver || null,
    currentSpeakerId: room.currentSpeakerId || '', lastNightDeaths: room.lastNightDeaths || [], actionState: actionState(room, viewer)
  };
}
function phaseLabel(p) { return ({ waiting: 'Lobby', role_reveal: 'Role Reveal', night: 'Night', night_result: 'Night Result', day: 'Day', nomination: 'Nomination', vote: 'Vote', vote_result: 'Vote Result', last_words: 'Last Words', ended: 'Ended' })[p] || p; }
function roleCounts(players) { const out = {}; for (const p of players) out[p.role] = (out[p.role] || 0) + 1; return out; }
function publicVotes(room, viewer) { if (!['vote_result','ended'].includes(room.phase) && !viewer.isHost) return {}; return room.votes || {}; }
function privateEventsFor(room, viewer) { return (room.privateEvents || []).filter(e => Number(e.toUserId) === Number(viewer.userId)).slice(-50); }
function actionState(room, viewer) { if (!viewer.userId || viewer.isSpectator) return null; const me = room.players.find(p => Number(p.userId) === Number(viewer.userId)); if (!me || !me.alive) return null; if (room.phase === 'night') return { type: ROLE_MAP[me.role]?.nightAction || '', submitted: !!room.nightActions?.[me.id] }; if (room.phase === 'nomination') return { type: 'nominate', submitted: !!room.nominations?.[me.id] }; if (room.phase === 'vote') return { type: 'vote', submitted: !!room.votes?.[me.id] }; return null; }

function createEngine(ctx) {
  function publishRooms() {
    ctx.io.emit('rooms:list', [...ctx.rooms.values()].filter(r => r.phase !== 'ended').map(roomListItem));
  }
  function roomListItem(r) { return { id: r.id, name: r.name, phase: r.phase, hostName: r.hostName, players: r.players.length, maxPlayers: r.settings.maxPlayers, language: r.settings.language, privateRoom: r.settings.privateRoom, createdAt: r.createdAt }; }
  function roomState(room) { for (const p of room.players) if (p.socketId) ctx.io.to(p.socketId).emit('room:state', publicRoom(room, p.userId)); for (const s of room.spectators) if (s.socketId) ctx.io.to(s.socketId).emit('room:state', publicRoom(room, s.userId)); publishRooms(); }
  function addEvent(room, text, type = 'system') { room.events.push({ id: `${Date.now()}_${Math.random()}`, type, text, at: nowIso() }); room.events = room.events.slice(-250); }
  function addPrivate(room, toUserId, text, type = 'private') { room.privateEvents.push({ id: `${Date.now()}_${Math.random()}`, toUserId: Number(toUserId), type, text, at: nowIso() }); room.privateEvents = room.privateEvents.slice(-250); }

  function createRoom({ name, host, settings = {} }) {
    if (!host?.userId) throw Error('Login required');
    const merged = normalizeSettings(settings);
    const id = code();
    const room = { id, name: safeText(name, 'VOID TABLE').slice(0, 40), phase: 'waiting', day: 0, timer: 0, hostUserId: Number(host.userId), hostName: host.nickname, settings: merged, players: [], spectators: [], chat: [], events: [], privateEvents: [], nightActions: {}, nominations: {}, nominatedIds: [], votes: {}, currentSpeakerId: '', lastNightDeaths: [], createdAt: nowIso(), startedAt: null, gameOver: null };
    ctx.rooms.set(id, room);
    joinRoom(id, host, '', false);
    addEvent(room, `Room created by ${host.nickname}.`, 'room');
    publishRooms();
    return room;
  }
  function normalizeSettings(settings = {}) {
    const s = { ...clone(DEFAULT_SETTINGS), ...settings, timers: { ...DEFAULT_SETTINGS.timers, ...(settings.timers || {}) }, roles: { ...DEFAULT_SETTINGS.roles, ...(settings.roles || {}) } };
    s.maxPlayers = Math.min(16, Math.max(4, Number(s.maxPlayers || 10)));
    s.minPlayers = 4;
    s.roles.doctor = 1;
    s.roles.sheriff = 1;
    s.roles.mafia = Math.min(Math.max(1, Number(s.roles.mafia || 1)), Math.max(1, Math.floor(s.maxPlayers / 3)));
    for (const k of Object.keys(s.roles)) s.roles[k] = Math.max(0, Number(s.roles[k] || 0));
    return s;
  }
  function joinRoom(roomId, user, socketId = '', spectator = false) {
    const room = ctx.rooms.get(String(roomId)); if (!room) throw Error('Room not found');
    if (room.phase === 'ended') throw Error('Room already ended');
    if (!user?.userId) throw Error('Login required');
    let player = room.players.find(p => Number(p.userId) === Number(user.userId));
    if (player) { player.connected = true; player.socketId = socketId || player.socketId; return { room, spectator: false, player }; }
    if (spectator || room.players.length >= room.settings.maxPlayers || room.phase !== 'waiting') {
      let sp = room.spectators.find(s => Number(s.userId) === Number(user.userId));
      if (!sp) { sp = { userId: Number(user.userId), socketId, nickname: user.nickname, avatar: user.avatar }; room.spectators.push(sp); }
      sp.socketId = socketId; return { room, spectator: true, spectatorUser: sp };
    }
    player = { id: `p${room.players.length + 1}_${user.userId}`, userId: Number(user.userId), socketId, seat: room.players.length + 1, nickname: user.nickname, avatar: user.avatar || '◆', clanId: user.clanId || '', level: user.level || 1, rank: user.rank || 'Newbie', role: '', team: '', alive: true, connected: true, muted: false, micOn: true, cameraOn: true, speaking: false, warnings: 0, emotion: '' };
    room.players.push(player);
    addEvent(room, `${player.nickname} joined the room.`, 'join');
    return { room, spectator: false, player };
  }
  function leaveRoom(room, userId, socketId) {
    const p = room.players.find(x => Number(x.userId) === Number(userId) || x.socketId === socketId);
    if (p) {
      if (room.phase === 'waiting' && Number(p.userId) === Number(room.hostUserId)) { terminate(room, 'Host left. Room terminated.'); return 'terminated'; }
      p.connected = false; p.socketId = ''; p.speaking = false; addEvent(room, `${p.nickname} disconnected.`, 'leave');
      if (Number(p.userId) === Number(room.hostUserId)) transferHost(room);
    }
    room.spectators = room.spectators.filter(s => s.socketId !== socketId && Number(s.userId) !== Number(userId));
    if (!room.players.some(x => x.connected) && !room.spectators.length) setTimeout(() => { const r = ctx.rooms.get(room.id); if (r && !r.players.some(x => x.connected) && !r.spectators.length) terminate(r, 'Empty room terminated.'); }, 60000);
    roomState(room); return 'left';
  }
  function transferHost(room) { const next = room.players.find(p => p.connected && p.alive) || room.players.find(p => p.connected); if (next) { room.hostUserId = next.userId; room.hostName = next.nickname; addEvent(room, `${next.nickname} is the new host.`, 'host'); } }
  function updateSettings(room, settings, userId) { assertHost(room, userId); if (room.phase !== 'waiting') throw Error('Settings can be changed only in lobby'); room.settings = normalizeSettings({ ...room.settings, ...settings, timers: { ...room.settings.timers, ...(settings.timers || {}) }, roles: { ...room.settings.roles, ...(settings.roles || {}) } }); addEvent(room, 'Room settings updated.', 'settings'); roomState(room); }
  function assertHost(room, userId) { if (!room) throw Error('Room not found'); if (Number(room.hostUserId) !== Number(userId)) throw Error('Host only'); }
  function validateStart(room) { if (room.players.length < room.settings.minPlayers) throw Error(`At least ${room.settings.minPlayers} players required`); if (room.phase !== 'waiting') throw Error('Game already started'); const roleList = buildRoleDeck(room); if (roleList.length !== room.players.length) throw Error(`Role count error: ${roleList.length}/${room.players.length}. Adjust Mafia/special roles; citizens are automatic.`); }
  function buildRoleDeck(room) {
    const players = room.players.length;
    const r = room.settings.roles;
    const deck = [];
    for (let i=0;i<r.mafia;i++) deck.push('mafia');
    for (const key of Object.keys(r)) if (!['mafia','citizen'].includes(key)) for (let i=0;i<Number(r[key]||0);i++) deck.push(key);
    const citizens = players - deck.length;
    if (citizens < 0) return deck;
    for (let i=0;i<citizens;i++) deck.push('citizen');
    return deck;
  }
  function start(room, userId) { assertHost(room, userId); validateStart(room); const deck = shuffle(buildRoleDeck(room)); shuffle(room.players).forEach((p, i) => { p.role = deck[i]; p.team = ROLE_MAP[p.role]?.team || 'citizen'; p.alive = true; p.muted = false; p.warnings = 0; addPrivate(room, p.userId, `Your role is ${ROLE_MAP[p.role]?.label || p.role}.`, 'role'); }); room.startedAt = nowIso(); room.day = 0; addEvent(room, `Game started. Players: ${room.players.map(p => `(${p.seat}) ${p.nickname}`).join(', ')}.`, 'game'); setPhase(room, 'role_reveal'); roomState(room); }
  function setPhase(room, phase) { room.phase = phase; room.timer = Number(room.settings.timers[phase] ?? room.settings.timers.day ?? 30); if (phase === 'day') { room.day += 1; room.nominations = {}; room.nominatedIds = []; room.votes = {}; room.currentSpeakerId = nextSpeaker(room); } if (phase === 'night') { room.nightActions = {}; room.lastNightDeaths = []; } addEvent(room, `Phase: ${phaseLabel(phase)}.`, 'phase'); }
  function nextSpeaker(room) { const alive = room.players.filter(p => p.alive); if (!alive.length) return ''; const idx = (room.day - 1) % alive.length; return alive[idx].id; }
  async function nextPhase(room) {
    if (!room || room.phase === 'ended') return;
    if (room.phase === 'role_reveal') setPhase(room, 'night');
    else if (room.phase === 'night') { resolveNight(room); setPhase(room, 'night_result'); }
    else if (room.phase === 'night_result') { checkWin(room) || setPhase(room, 'day'); }
    else if (room.phase === 'day') setPhase(room, room.settings.noNominationFirstDay && room.day === 1 ? 'vote' : 'nomination');
    else if (room.phase === 'nomination') setPhase(room, 'vote');
    else if (room.phase === 'vote') { resolveVote(room); setPhase(room, 'vote_result'); }
    else if (room.phase === 'vote_result') { if (!checkWin(room)) setPhase(room, 'last_words'); }
    else if (room.phase === 'last_words') { if (!checkWin(room)) setPhase(room, 'night'); }
    roomState(room);
  }
  function me(room, player) { if (!player) throw Error('Player not found'); if (!player.alive) throw Error('You are dead'); return player; }
  function target(room, targetId) { const t = room.players.find(p => p.id === targetId || String(p.userId) === String(targetId)); if (!t) throw Error('Target not found'); return t; }
  function action(room, player, targetId) { player = me(room, player); if (room.phase !== 'night') throw Error('Night actions only'); const role = ROLE_MAP[player.role] || {}; if (!role.nightAction) throw Error('Your role has no night action'); const t = target(room, targetId); if (!t.alive) throw Error('Target is dead'); if (!role.canSelf && t.id === player.id) throw Error('Cannot target yourself'); if (room.nightActions[player.id]) throw Error('Action already submitted'); room.nightActions[player.id] = { actorId: player.id, actorUserId: player.userId, role: player.role, type: role.nightAction, targetId: t.id, at: nowIso() }; addPrivate(room, player.userId, `Action submitted: ${ROLE_MAP[player.role].label} → ${t.nickname}.`, 'action'); return { ok: true }; }
  function nominate(room, player, targetId) { player = me(room, player); if (room.phase !== 'nomination') throw Error('Nomination phase only'); const t = target(room, targetId); if (!t.alive || t.id === player.id) throw Error('Invalid nomination'); room.nominations[player.id] = t.id; if (!room.nominatedIds.includes(t.id)) room.nominatedIds.push(t.id); addEvent(room, `${player.nickname} nominated ${t.nickname}.`, 'nomination'); return { ok: true }; }
  function vote(room, player, targetId) { player = me(room, player); if (room.phase !== 'vote') throw Error('Vote phase only'); if (room.votes[player.id]) throw Error('Vote already submitted'); if (targetId !== 'abstain') { const t = target(room, targetId); if (!t.alive) throw Error('Invalid vote target'); if (room.nominatedIds.length && !room.nominatedIds.includes(t.id)) throw Error('Target is not nominated'); room.votes[player.id] = t.id; } else room.votes[player.id] = 'abstain'; return { ok: true }; }
  function resolveNight(room) {
    const actions = Object.values(room.nightActions || {});
    const blocked = new Set(actions.filter(a => a.type === 'block').map(a => a.targetId));
    const healed = new Set(actions.filter(a => ['heal','guard'].includes(a.type) && !blocked.has(a.actorId)).map(a => a.targetId));
    const covered = new Set(actions.filter(a => a.type === 'cover').map(a => a.targetId));
    const attacks = actions.filter(a => ['kill','solo_kill'].includes(a.type) && !blocked.has(a.actorId));
    const killed = [];
    for (const a of attacks) {
      const t = room.players.find(p => p.id === a.targetId); if (!t || !t.alive) continue;
      if (healed.has(t.id)) { addEvent(room, `${t.nickname} was attacked but survived.`, 'night'); continue; }
      if (t.role === 'bulletproof' && !t.vestUsed) { t.vestUsed = true; addPrivate(room, t.userId, 'Your bulletproof vest saved you.', 'night'); continue; }
      t.alive = false; killed.push(t);
    }
    for (const a of actions.filter(a => ['check_mafia','detect','check_sheriff'].includes(a.type))) {
      const actor = room.players.find(p => p.id === a.actorId), t = room.players.find(p => p.id === a.targetId); if (!actor || !t) continue;
      let text = `${t.nickname}: `;
      if (a.type === 'check_mafia') text += covered.has(t.id) ? 'Not Mafia' : (t.team === 'mafia' ? 'Mafia' : 'Not Mafia');
      if (a.type === 'detect') text += `Team clue: ${covered.has(t.id) ? 'citizen' : t.team}`;
      if (a.type === 'check_sheriff') text += t.role === 'sheriff' ? 'Sheriff' : 'Not Sheriff';
      addPrivate(room, actor.userId, text, 'check');
    }
    room.lastNightDeaths = killed.map(p => ({ userId: p.userId, nickname: p.nickname, seat: p.seat, role: p.role }));
    if (killed.length) for (const p of killed) addEvent(room, `${p.nickname} was killed during the night.`, 'death');
    else addEvent(room, 'Night ended. Nobody died.', 'night');
  }
  function resolveVote(room) {
    const counts = {};
    for (const v of Object.values(room.votes || {})) if (v !== 'abstain') counts[v] = (counts[v] || 0) + 1;
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if (!sorted.length) { addEvent(room, 'Vote ended. Nobody was executed.', 'vote'); return; }
    if (sorted[1] && sorted[1][1] === sorted[0][1]) { addEvent(room, 'Vote draw. Nobody was executed.', 'vote'); return; }
    const t = room.players.find(p => p.id === sorted[0][0]);
    if (t) { t.alive = false; addEvent(room, `${t.nickname} was executed by vote.`, 'execution'); }
  }
  function checkWin(room) {
    const alive = room.players.filter(p => p.alive);
    const mafia = alive.filter(p => p.team === 'mafia');
    const citizens = alive.filter(p => p.team === 'citizen');
    const solo = alive.filter(p => p.team === 'solo');
    let winnerTeam = '';
    if (solo.length === 1 && alive.length === 1) winnerTeam = 'solo';
    else if (mafia.length === 0 && solo.length === 0) winnerTeam = 'citizen';
    else if (mafia.length >= citizens.length && solo.length === 0) winnerTeam = 'mafia';
    if (!winnerTeam) return false;
    finish(room, winnerTeam); return true;
  }
  async function finish(room, winnerTeam) {
    room.phase = 'ended'; room.timer = 0; room.gameOver = { winnerTeam, label: `${winnerTeam.toUpperCase()} wins` }; addEvent(room, room.gameOver.label, 'game_over');
    for (const p of room.players) applyGameResult(ctx, p, { win: p.team === winnerTeam, survived: p.alive, roomId: room.id, roomName: room.name }).catch(()=>{});
    if (ctx.db.enabled) ctx.db.models.Game.create({ gameId: `${room.id}_${Date.now()}`, roomId: room.id, roomName: room.name, players: room.players, events: room.events, winnerTeam, startedAt: room.startedAt, endedAt: new Date(), settings: room.settings }).catch(()=>{});
    setTimeout(() => ctx.rooms.delete(room.id), 300000);
  }
  function terminate(room, reason) { room.phase = 'ended'; room.gameOver = { winnerTeam: 'none', label: reason }; addEvent(room, reason, 'terminated'); roomState(room); setTimeout(()=>ctx.rooms.delete(room.id), 1000); }
  function chat(room, sender, message, channel = 'room') { if (!room) throw Error('Room not found'); const text = safeText(message); if (!text) throw Error('Empty message'); const msg = { id: `${Date.now()}_${Math.random()}`, channel, userId: sender.userId, seat: sender.seat || '', nickname: sender.nickname || 'Player', message: text, at: nowIso() }; room.chat.push(msg); room.chat = room.chat.slice(-120); return msg; }
  function warn(room, hostUserId, targetUserId, reason = 'POOR behavior') { assertHost(room, hostUserId); const t = room.players.find(p => Number(p.userId) === Number(targetUserId)); if (!t) throw Error('Player not found'); t.warnings += 1; addEvent(room, `${t.nickname} received a warning for ${reason}.`, 'warning'); roomState(room); }

  return { createRoom, joinRoom, leaveRoom, updateSettings, start, nextPhase, action, nominate, vote, chat, warn, roomState, publishRooms, publicRoom, terminate, ROLES, DEFAULT_SETTINGS };
}

module.exports = { createEngine, ROLES, ROLE_MAP, DEFAULT_SETTINGS, publicRoom };
