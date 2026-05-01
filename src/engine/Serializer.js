const { PHASE_LABEL, PHASE } = require("./constants");
const { minutesSince, secondsLeft } = require("../utils/time");

function phaseLabel(phase) {
  return PHASE_LABEL[phase] || phase;
}

function publicRoom(room) {
  const alive = room.players.filter(p => p.alive).length;
  const avgLevel = room.players.length
    ? Math.round(room.players.reduce((s, p) => s + (p.level || 1), 0) / room.players.length)
    : 1;

  return {
    id: room.id,
    code: room.id,
    name: room.name,
    hostUserId: room.hostUserId,
    hostName: room.hostName,
    hostAvatar: room.hostAvatar,
    phase: room.phase,
    phaseLabel: phaseLabel(room.phase),
    timer: room.timer,
    status: room.phase === PHASE.WAITING ? "open" : "live",
    locked: room.settings.locked,
    private: room.settings.private,
    players: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    alive,
    spectators: room.spectators.length,
    avgLevel,
    activeMinutes: minutesSince(room.startedAt || room.createdAt),
    createdAt: room.createdAt,
    startedAt: room.startedAt
  };
}

function serializeRoom(room, viewerSocketId) {
  const viewer = room.players.find(p => p.socketId === viewerSocketId);
  const revealAll = room.phase === PHASE.GAME_OVER && room.settings.revealRolesOnEnd;

  return {
    ...publicRoom(room),
    day: room.day,
    round: room.round,
    settings: room.settings,
    viewer: viewer ? {
      id: viewer.id,
      userId: viewer.userId,
      seat: viewer.seat,
      alive: viewer.alive,
      role: viewer.role,
      isHost: viewer.seat === 1
    } : null,
    players: room.players.map(p => ({
      id: p.id,
      socketId: p.socketId,
      userId: p.userId,
      nickname: p.nickname,
      avatar: p.avatar,
      level: p.level,
      xp: p.xp,
      seat: p.seat,
      connected: p.connected,
      alive: p.alive,
      micOn: p.micOn,
      cameraOn: p.cameraOn,
      engineMuted: p.engineMuted,
      role: revealAll || p.socketId === viewerSocketId ? p.role : undefined
    })),
    spectators: room.spectators.map(s => ({
      socketId: s.socketId,
      userId: s.userId,
      nickname: s.nickname,
      avatar: s.avatar
    })),
    individualSpeakerId: room.individualSpeakerId,
    individualIndex: room.individualIndex,
    individualTotal: room.individualOrder.length,
    nominatedIds: room.nominatedIds,
    nominations: room.nominations,
    votesCount: Object.keys(room.votes).length,
    nightActionsCount: Object.keys(room.nightActions).length,
    events: room.events.slice(-60),
    feed: room.feed.slice(-30),
    chat: room.chat.slice(-40),
    stats: room.stats,
    gameOver: room.gameOver
  };
}

module.exports = { publicRoom, serializeRoom, phaseLabel };
