const crypto = require("crypto");
const { PHASE, ROLE } = require("./constants");
const { normalizeRoomSettings } = require("./settings");
const { makeCode } = require("../utils/time");
const { safeText } = require("../utils/text");

function createPlayer({ socketId, user }) {
  return {
    id: crypto.randomUUID(),
    socketId,
    userId: Number(user.userId),
    nickname: safeText(user.nickname || `Player${user.userId}`, 32),
    avatar: user.avatar || "◆",
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),
    seat: 0,
    connected: true,
    alive: true,
    role: ROLE.CITIZEN,
    revealed: false,
    micOn: true,
    cameraOn: true,
    engineMuted: false,
    flags: {
      protectedFromVote: false,
      mayorRevealed: false
    },
    limits: {
      vigilanteShots: 1
    },
    joinedAt: Date.now(),
    lastSeenAt: Date.now()
  };
}

function createRoom({ owner, name, settings }) {
  return {
    id: makeCode(),
    name: safeText(name, 42) || "VOID TABLE",
    createdAt: Date.now(),
    startedAt: null,
    hostUserId: Number(owner.userId),
    hostSocketId: owner.socketId,
    hostName: safeText(owner.nickname || "Host", 32),
    hostAvatar: owner.avatar || "◆",

    phase: PHASE.WAITING,
    previousPhase: null,
    phaseStartedAt: null,
    phaseDeadlineAt: null,
    timer: 0,

    day: 0,
    round: 0,
    paused: false,

    players: [],
    spectators: [],
    settings: normalizeRoomSettings(settings),

    events: [],
    feed: [],
    chat: [],
    privateMessages: {},

    nominations: {},
    nominatedIds: [],
    votes: {},
    nightActions: {},
    nightResults: null,

    individualOrder: [],
    individualIndex: 0,
    individualSpeakerId: null,
    lastEliminatedId: null,

    engine: {
      revision: 0,
      timerHandle: null,
      tickHandle: null,
      locked: false
    },

    stats: {
      nominations: 0,
      votes: 0,
      nightActions: 0,
      eliminations: 0,
      phases: 0,
      chatMessages: 0
    },

    gameOver: null
  };
}

module.exports = { createRoom, createPlayer };
