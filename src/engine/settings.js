const { clampInt } = require("../utils/text");

function defaultTimers() {
  return {
    roleReveal: 8,
    night: 45,
    nightResult: 7,
    dayCommon: 60,
    individual: 60,
    nomination: 45,
    vote: 35,
    voteResult: 7,
    lastWords: 45,
    gameOver: 15
  };
}

function normalizeTimers(value = {}) {
  const d = defaultTimers();
  return {
    roleReveal: clampInt(value.roleReveal, 5, 45, d.roleReveal),
    night: clampInt(value.night, 20, 240, d.night),
    nightResult: clampInt(value.nightResult, 4, 45, d.nightResult),
    dayCommon: clampInt(value.dayCommon, 20, 900, d.dayCommon),
    individual: clampInt(value.individual, 20, 180, d.individual),
    nomination: clampInt(value.nomination, 15, 180, d.nomination),
    vote: clampInt(value.vote, 15, 180, d.vote),
    voteResult: clampInt(value.voteResult, 4, 45, d.voteResult),
    lastWords: clampInt(value.lastWords, 10, 180, d.lastWords),
    gameOver: clampInt(value.gameOver, 5, 60, d.gameOver)
  };
}

function defaultRoles() {
  return {
    mafia: 1,
    don: true,
    sheriff: true,
    doctor: true,
    detective: false,
    serial: false,
    yakuza: false,
    chogun: false,
    vigilante: false,
    maniac: false,
    bodyguard: false,
    journalist: false,
    lawyer: false,
    mayor: false
  };
}

function normalizeRoleSettings(value = {}) {
  const d = defaultRoles();
  return {
    mafia: clampInt(value.mafia, 1, 6, d.mafia),
    don: value.don ?? d.don,
    sheriff: value.sheriff ?? d.sheriff,
    doctor: value.doctor ?? d.doctor,
    detective: !!value.detective,
    serial: !!value.serial,
    yakuza: !!value.yakuza,
    chogun: !!value.chogun,
    vigilante: !!value.vigilante,
    maniac: !!value.maniac,
    bodyguard: !!value.bodyguard,
    journalist: !!value.journalist,
    lawyer: !!value.lawyer,
    mayor: !!value.mayor
  };
}

function normalizeRoomSettings(value = {}) {
  return {
    maxPlayers: clampInt(value.maxPlayers, 4, 16, 10),
    allowSpectators: value.allowSpectators !== false,
    locked: !!value.locked,
    private: !!value.private,
    password: String(value.password || "").slice(0, 32),
    lastWords: value.lastWords !== false,
    revealRolesOnEnd: value.revealRolesOnEnd !== false,
    autoStartWhenFull: !!value.autoStartWhenFull,
    silentNight: value.silentNight !== false,
    hideSystemInChat: true,
    engineAutoAdvance: value.engineAutoAdvance !== false,
    timers: normalizeTimers(value.timers),
    roles: normalizeRoleSettings(value.roles || value.roleSettings)
  };
}

module.exports = { defaultTimers, normalizeTimers, defaultRoles, normalizeRoleSettings, normalizeRoomSettings };
