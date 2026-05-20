const crypto = require("crypto");

const ROLES = [
  { key: "mafia", label: "Mafia", team: "mafia", night: true },
  { key: "don", label: "Don", team: "mafia", night: true },
  { key: "doctor", label: "Doctor", team: "citizen", night: true },
  { key: "sheriff", label: "Sheriff", team: "citizen", night: true },
  { key: "detective", label: "Detective", team: "citizen", night: true },
  { key: "bodyguard", label: "Bodyguard", team: "citizen", night: true },
  { key: "citizen", label: "Citizen", team: "citizen", night: false }
];

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  language: "Georgian",
  autoPhase: true,
  allowLobbyVoice: true,
  timers: {
    lobby: 0,
    roleReveal: 15,
    night: 45,
    nightResult: 8,
    day: 90,
    nomination: 45,
    vote: 35,
    voteResult: 8,
    lastWords: 30
  },
  roles: {
    mafia: 1,
    don: 0,
    doctor: 1,
    sheriff: 1,
    detective: 0,
    bodyguard: 0,
    citizen: 0
  }
};

const PHASES = {
  WAITING: "waiting",
  ROLE_REVEAL: "role_reveal",
  NIGHT: "night",
  NIGHT_RESULT: "night_result",
  DAY: "day",
  NOMINATION: "nomination",
  VOTE: "vote",
  VOTE_RESULT: "vote_result",
  LAST_WORDS: "last_words",
  ENDED: "ended"
};

function now() {
  return Date.now();
}

function uid(prefix = "") {
  return prefix + crypto.randomBytes(4).toString("hex");
}

function roomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mergeSettings(input = {}) {
  const settings = clone(DEFAULT_SETTINGS);

  settings.maxPlayers = Number(input.maxPlayers || settings.maxPlayers);
  settings.language = input.language || settings.language;
  settings.autoPhase = input.autoPhase !== false;
  settings.allowLobbyVoice = input.allowLobbyVoice !== false;

  settings.timers = {
    ...settings.timers,
    ...(input.timers || {})
  };

  settings.roles = {
    ...settings.roles,
    ...(input.roles || {})
  };

  settings.maxPlayers = Math.max(4, Math.min(20, settings.maxPlayers));

  for (const k of Object.keys(settings.timers)) {
    settings.timers[k] = Math.max(0, Number(settings.timers[k] || 0));
  }

  for (const k of Object.keys(settings.roles)) {
    settings.roles[k] = Math.max(0, Number(settings.roles[k] || 0));
  }

  return settings;
}

function roleInfo(role) {
  return ROLES.find(r => r.key === role) || ROLES.find(r => r.key === "citizen");
}

function createRoomObject({ name, host, settings }) {
  const finalSettings = mergeSettings(settings);

  const room = {
    id: roomCode(),
    name: String(name || "VOID TABLE").trim().slice(0, 40) || "VOID TABLE",

    phase: PHASES.WAITING,
    phaseStartedAt: now(),
    timer: 0,
    day: 0,

    hostUserId: Number(host.userId),
    hostName: host.nickname || "Host",

    settings: finalSettings,

    players: [],
    spectators: [],

    chat: [],
    events: [],

    nominations: [],
    votes: {},
    nightActions: {},

    lastKilledId: null,
    lastExecutedId: null,

    gameOver: null,

    createdAt: now(),
    updatedAt: now()
  };

  room.players.push(createPlayer(host, 1, null));

  event(room, `${host.nickname || "Host"} created the room.`, "system");

  return room;
}

function createPlayer(user, seat, socketId) {
  return {
    id: uid("p_"),
    userId: Number(user.userId),
    socketId: socketId || null,

    seat,
    nickname: user.nickname || `Player${user.userId}`,
    avatar: user.avatar || "◆",

    role: null,
    team: null,

    alive: true,
    connected: true,

    micOn: true,
    cameraOn: true,
    speaking: false,

    voted: false,
    nightDone: false,

    joinedAt: now(),
    lastSeenAt: now()
  };
}

function event(room, text, type = "info") {
  room.events.push({
    id: uid("e_"),
    at: now(),
    type,
    text
  });

  if (room.events.length > 200) room.events.shift();
  room.updatedAt = now();
}

function publicPlayer(player, viewerId, room) {
  const isSelf = Number(player.userId) === Number(viewerId);
  const ended = room.phase === PHASES.ENDED || !!room.gameOver;

  return {
    id: player.id,
    userId: player.userId,
    socketId: player.socketId,
    seat: player.seat,
    nickname: player.nickname,
    avatar: player.avatar,

    alive: player.alive,
    connected: player.connected,

    micOn: player.micOn,
    cameraOn: player.cameraOn,
    speaking: player.speaking,

    role: isSelf || ended ? player.role : null,
    team: isSelf || ended ? player.team : null
  };
}

function publicRoom(room, viewerId = 0) {
  const viewer = room.players.find(p => Number(p.userId) === Number(viewerId));
  const spectator = room.spectators.find(s => Number(s.userId) === Number(viewerId));

  return {
    id: room.id,
    name: room.name,

    phase: room.phase,
    phaseLabel: phaseLabel(room.phase),
    phaseStartedAt: room.phaseStartedAt,
    timer: room.timer,
    day: room.day,

    hostUserId: room.hostUserId,
    hostName: room.hostName,

    settings: room.settings,

    players: room.players.map(p => publicPlayer(p, viewerId, room)),
    spectators: room.spectators.map(s => ({
      userId: s.userId,
      nickname: s.nickname,
      avatar: s.avatar
    })),

    alive: room.players.filter(p => p.alive).length,

    chat: room.chat.slice(-80),
    events: room.events.slice(-80),

    nominations: room.nominations,
    votes: room.phase === PHASES.VOTE_RESULT || room.phase === PHASES.ENDED ? room.votes : {},

    gameOver: room.gameOver,

    viewer: {
      isHost: viewer ? Number(viewer.userId) === Number(room.hostUserId) : false,
      isPlayer: !!viewer,
      isSpectator: !!spectator,
      role: viewer?.role || null,
      team: viewer?.team || null,
      alive: viewer?.alive || false
    }
  };
}

function phaseLabel(phase) {
  return {
    waiting: "Lobby",
    role_reveal: "Roles",
    night: "Night",
    night_result: "Night Result",
    day: "Day",
    nomination: "Nomination",
    vote: "Vote",
    vote_result: "Vote Result",
    last_words: "Last Words",
    ended: "Ended"
  }[phase] || phase;
}

class GameEngine {
  constructor(ctx) {
    this.ctx = ctx;
  }

  createRoom({ name, host, settings }) {
    if (!host || !host.userId) throw new Error("User required");

    const room = createRoomObject({ name, host, settings });

    if (!this.ctx.rooms) this.ctx.rooms = new Map();
    this.ctx.rooms.set(String(room.id), room);

    this.publishRooms();
    this.persistRoom(room).catch(() => {});

    return room;
  }

  joinRoom(roomId, user, socketId, spectator = false) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    if (!user || !user.userId) throw new Error("User required");

    if (spectator || room.phase !== PHASES.WAITING) {
      let sp = room.spectators.find(s => Number(s.userId) === Number(user.userId));

      if (!sp) {
        sp = {
          userId: Number(user.userId),
          socketId,
          nickname: user.nickname || "Spectator",
          avatar: user.avatar || "◆",
          joinedAt: now()
        };
        room.spectators.push(sp);
      } else {
        sp.socketId = socketId;
      }

      event(room, `${sp.nickname} joined as spectator.`, "spectator");
      this.roomState(room);
      this.persistRoom(room).catch(() => {});
      return { room, spectator: true };
    }

    let player = room.players.find(p => Number(p.userId) === Number(user.userId));

    if (player) {
      player.socketId = socketId;
      player.connected = true;
      player.lastSeenAt = now();
    } else {
      if (room.players.length >= room.settings.maxPlayers) {
        throw new Error("Room is full");
      }

      player = createPlayer(user, room.players.length + 1, socketId);
      room.players.push(player);
    }

    if (player.seat === 1) {
      room.hostUserId = player.userId;
      room.hostName = player.nickname;
    }

    event(room, `#${player.seat} ${player.nickname} joined.`, "join");

    this.roomState(room);
    this.publishRooms();
    this.persistRoom(room).catch(() => {});

    return { room, spectator: false };
  }

  updateSettings(room, settings, userId) {
    if (!room) throw new Error("Room not found");
    this.assertHost(room, userId);

    if (room.phase !== PHASES.WAITING) {
      throw new Error("Settings can be changed only in lobby");
    }

    room.settings = mergeSettings({
      ...room.settings,
      ...settings,
      timers: {
        ...room.settings.timers,
        ...(settings.timers || {})
      },
      roles: {
        ...room.settings.roles,
        ...(settings.roles || {})
      }
    });

    event(room, "Room settings updated.", "settings");

    this.roomState(room);
    this.persistRoom(room).catch(() => {});

    return room;
  }

  start(room, userId) {
    if (!room) throw new Error("Room not found");
    this.assertHost(room, userId);

    if (room.phase !== PHASES.WAITING) {
      throw new Error("Game already started");
    }

    if (room.players.length < 4) {
      throw new Error("Minimum 4 players required");
    }

    this.assignRoles(room);

    room.day = 0;
    room.gameOver = null;

    event(room, "Game started. Roles assigned.", "start");

    this.setPhase(room, PHASES.ROLE_REVEAL);

    return room;
  }

  assignRoles(room) {
    const players = shuffle(room.players);
    const roles = [];

    const configured = room.settings.roles || {};

    for (const role of Object.keys(configured)) {
      const count = Number(configured[role] || 0);
      for (let i = 0; i < count; i++) roles.push(role);
    }

    while (roles.length < players.length) roles.push("citizen");

    const finalRoles = shuffle(roles).slice(0, players.length);

    players.forEach((player, i) => {
      player.role = finalRoles[i] || "citizen";
      player.team = roleInfo(player.role).team;
      player.alive = true;
      player.voted = false;
      player.nightDone = false;
    });
  }

  async nextPhase(room) {
    if (!room || room.phase === PHASES.ENDED) return;

    const phase = room.phase;

    if (phase === PHASES.ROLE_REVEAL) {
      room.day = 0;
      this.setPhase(room, PHASES.NIGHT);
      return;
    }

    if (phase === PHASES.NIGHT) {
      this.resolveNight(room);
      this.setPhase(room, PHASES.NIGHT_RESULT);
      return;
    }

    if (phase === PHASES.NIGHT_RESULT) {
      if (this.checkWin(room)) return;
      room.day += 1;
      this.setPhase(room, PHASES.DAY);
      return;
    }

    if (phase === PHASES.DAY) {
      this.setPhase(room, PHASES.NOMINATION);
      return;
    }

    if (phase === PHASES.NOMINATION) {
      this.setPhase(room, PHASES.VOTE);
      return;
    }

    if (phase === PHASES.VOTE) {
      this.resolveVote(room);
      this.setPhase(room, PHASES.VOTE_RESULT);
      return;
    }

    if (phase === PHASES.VOTE_RESULT) {
      if (this.checkWin(room)) return;

      if (room.lastExecutedId) {
        this.setPhase(room, PHASES.LAST_WORDS);
      } else {
        this.setPhase(room, PHASES.NIGHT);
      }

      return;
    }

    if (phase === PHASES.LAST_WORDS) {
      if (this.checkWin(room)) return;
      this.setPhase(room, PHASES.NIGHT);
      return;
    }

    if (phase === PHASES.WAITING) return;
  }

  setPhase(room, phase) {
    room.phase = phase;
    room.phaseStartedAt = now();

    room.nightActions = phase === PHASES.NIGHT ? {} : room.nightActions;
    room.votes = phase === PHASES.VOTE ? {} : room.votes;

    if (phase === PHASES.NOMINATION) room.nominations = [];
    if (phase === PHASES.NIGHT) {
      room.lastKilledId = null;
      room.lastExecutedId = null;
      for (const p of room.players) p.nightDone = false;
    }

    if (phase === PHASES.VOTE) {
      for (const p of room.players) p.voted = false;
    }

    room.timer = this.timerFor(room, phase);

    event(room, `Phase changed: ${phaseLabel(phase)}.`, "phase");

    this.roomState(room);
    this.publishRooms();
    this.persistRoom(room).catch(() => {});
  }

  timerFor(room, phase) {
    const t = room.settings.timers || {};

    return {
      role_reveal: t.roleReveal,
      night: t.night,
      night_result: t.nightResult,
      day: t.day,
      nomination: t.nomination,
      vote: t.vote,
      vote_result: t.voteResult,
      last_words: t.lastWords
    }[phase] || 0;
  }

  action(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor) return { ok: false, error: "Player not found" };
    if (!actor.alive) return { ok: false, error: "Dead player cannot act" };

    if (room.phase !== PHASES.NIGHT) {
      return { ok: false, error: "Night actions only at night" };
    }

    const target = room.players.find(p => p.id === targetId || String(p.userId) === String(targetId));
    if (!target) return { ok: false, error: "Target not found" };
    if (!target.alive) return { ok: false, error: "Target already dead" };

    const role = actor.role;

    if (!roleInfo(role).night) {
      return { ok: false, error: "Your role has no night action" };
    }

    if (["mafia", "don"].includes(role)) {
      room.nightActions.mafiaKill = {
        actorId: actor.id,
        targetId: target.id
      };
    }

    if (role === "doctor") {
      room.nightActions.doctorSave = {
        actorId: actor.id,
        targetId: target.id
      };
    }

    if (role === "sheriff" || role === "detective") {
      room.nightActions.checks = room.nightActions.checks || [];
      room.nightActions.checks.push({
        actorId: actor.id,
        targetId: target.id,
        result: target.team === "mafia" ? "mafia" : "not_mafia"
      });
    }

    if (role === "bodyguard") {
      room.nightActions.bodyguardProtect = {
        actorId: actor.id,
        targetId: target.id
      };
    }

    actor.nightDone = true;

    event(room, `#${actor.seat} performed night action.`, "night_action");

    this.roomState(room);
    this.persistRoom(room).catch(() => {});

    return { ok: true };
  }

  resolveNight(room) {
    const kill = room.nightActions.mafiaKill;
    const save = room.nightActions.doctorSave;
    const guard = room.nightActions.bodyguardProtect;

    let killed = null;

    if (kill) {
      const target = room.players.find(p => p.id === kill.targetId);

      const savedByDoctor = save && save.targetId === kill.targetId;
      const protectedByGuard = guard && guard.targetId === kill.targetId;

      if (target && target.alive && !savedByDoctor && !protectedByGuard) {
        target.alive = false;
        killed = target;
        room.lastKilledId = target.id;
        event(room, `Night result: #${target.seat} ${target.nickname} was killed.`, "death");
      } else {
        event(room, "Night result: nobody died.", "save");
      }
    } else {
      event(room, "Night result: mafia did not kill anyone.", "night_result");
    }

    if (room.nightActions.checks?.length) {
      for (const check of room.nightActions.checks) {
        const actor = room.players.find(p => p.id === check.actorId);
        const target = room.players.find(p => p.id === check.targetId);

        if (actor && target) {
          event(room, `Sheriff check was completed by #${actor.seat}.`, "check");
        }
      }
    }

    this.persistRoom(room).catch(() => {});
    return killed;
  }

  nominate(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor || !actor.alive) return { ok: false, error: "Invalid actor" };

    if (room.phase !== PHASES.NOMINATION) {
      return { ok: false, error: "Not nomination phase" };
    }

    const target = room.players.find(p => p.id === targetId || String(p.userId) === String(targetId));
    if (!target || !target.alive) return { ok: false, error: "Invalid target" };

    if (!room.nominations.includes(target.id)) {
      room.nominations.push(target.id);
    }

    event(room, `#${actor.seat} nominated #${target.seat}.`, "nomination");

    this.roomState(room);
    this.persistRoom(room).catch(() => {});

    return { ok: true };
  }

  vote(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor || !actor.alive) return { ok: false, error: "Invalid actor" };

    if (room.phase !== PHASES.VOTE) {
      return { ok: false, error: "Not vote phase" };
    }

    if (actor.voted) {
      return { ok: false, error: "You already voted" };
    }

    if (targetId !== "abstain") {
      const target = room.players.find(p => p.id === targetId || String(p.userId) === String(targetId));
      if (!target || !target.alive) return { ok: false, error: "Invalid target" };

      if (room.nominations.length && !room.nominations.includes(target.id)) {
        return { ok: false, error: "Target is not nominated" };
      }

      room.votes[actor.id] = target.id;
      event(room, `#${actor.seat} voted.`, "vote");
    } else {
      room.votes[actor.id] = "abstain";
      event(room, `#${actor.seat} abstained.`, "vote");
    }

    actor.voted = true;

    this.roomState(room);
    this.persistRoom(room).catch(() => {});

    return { ok: true };
  }

  resolveVote(room) {
    const counts = {};

    for (const vote of Object.values(room.votes)) {
      if (vote === "abstain") continue;
      counts[vote] = (counts[vote] || 0) + 1;
    }

    let topId = null;
    let topCount = 0;
    let tie = false;

    for (const [targetId, count] of Object.entries(counts)) {
      if (count > topCount) {
        topId = targetId;
        topCount = count;
        tie = false;
      } else if (count === topCount) {
        tie = true;
      }
    }

    room.lastExecutedId = null;

    if (!topId || tie) {
      event(room, "Vote result: nobody was executed.", "vote_result");
      return null;
    }

    const target = room.players.find(p => p.id === topId);

    if (target && target.alive) {
      target.alive = false;
      room.lastExecutedId = target.id;
      event(room, `Vote result: #${target.seat} ${target.nickname} was executed.`, "execution");
      return target;
    }

    return null;
  }

  checkWin(room) {
    const alive = room.players.filter(p => p.alive);
    const mafia = alive.filter(p => p.team === "mafia");
    const citizens = alive.filter(p => p.team !== "mafia");

    if (mafia.length === 0) {
      room.gameOver = {
        winner: "citizens",
        label: "Citizens win"
      };
      this.end(room);
      return true;
    }

    if (mafia.length >= citizens.length) {
      room.gameOver = {
        winner: "mafia",
        label: "Mafia wins"
      };
      this.end(room);
      return true;
    }

    return false;
  }

  end(room) {
    room.phase = PHASES.ENDED;
    room.timer = 0;

    event(room, `Game ended: ${room.gameOver?.label || "Ended"}.`, "ended");

    this.roomState(room);
    this.publishRooms();
    this.persistRoom(room).catch(() => {});
    this.persistStats(room).catch(() => {});
  }

  terminateRoom(room, reason = "Room terminated") {
    if (!room) return;

    event(room, reason, "terminated");

    if (this.ctx.rooms) {
      this.ctx.rooms.delete(String(room.id));
    }

    if (this.ctx.io) {
      this.ctx.io.to(room.id).emit("room:terminated", { roomId: room.id, reason });
      this.ctx.io.in(room.id).socketsLeave(room.id);
    }

    this.publishRooms();
  }

  tick() {
    if (!this.ctx.rooms) return;

    for (const room of this.ctx.rooms.values()) {
      if (!room.settings.autoPhase) continue;
      if (room.phase === PHASES.WAITING || room.phase === PHASES.ENDED) continue;

      room.timer = Math.max(0, Number(room.timer || 0) - 1);

      if (room.timer <= 0) {
        this.nextPhase(room).catch(() => {});
      } else {
        this.roomState(room);
      }
    }
  }

  assertHost(room, userId) {
    if (Number(room.hostUserId) !== Number(userId)) {
      throw new Error("Host only");
    }
  }

  getRoom(id) {
    return this.ctx.rooms?.get(String(id));
  }

  roomState(room) {
    if (!this.ctx.io || !room) return;

    for (const player of room.players) {
      if (player.socketId) {
        this.ctx.io.to(player.socketId).emit("room:state", publicRoom(room, player.userId));
      }
    }

    for (const spectator of room.spectators) {
      if (spectator.socketId) {
        this.ctx.io.to(spectator.socketId).emit("room:state", publicRoom(room, spectator.userId));
      }
    }
  }

  publishRooms() {
    if (!this.ctx.io || !this.ctx.rooms) return;

    const rooms = [...this.ctx.rooms.values()].map(room => ({
      id: room.id,
      name: room.name,
      phase: room.phase,
      hostName: room.hostName,
      players: room.players.length,
      maxPlayers: room.settings.maxPlayers,
      language: room.settings.language
    }));

    this.ctx.io.emit("rooms:list", rooms);
  }

  async persistRoom(room) {
    if (!this.ctx.db?.enabled || !this.ctx.db.models?.Room) return;

    await this.ctx.db.models.Room.findOneAndUpdate(
      { roomId: String(room.id) },
      {
        roomId: String(room.id),
        name: room.name,
        phase: room.phase,
        hostUserId: room.hostUserId,
        hostName: room.hostName,
        settings: room.settings,
        players: room.players.map(p => ({
          userId: p.userId,
          nickname: p.nickname,
          seat: p.seat,
          role: p.role,
          team: p.team,
          alive: p.alive
        })),
        gameOver: room.gameOver,
        updatedAt: new Date()
      },
      {
        upsert: true,
        new: true
      }
    );
  }

  async persistStats(room) {
    if (!this.ctx.db?.enabled || !this.ctx.db.models?.User) return;
    if (!room.gameOver) return;

    const User = this.ctx.db.models.User;
    const winner = room.gameOver.winner;

    for (const player of room.players) {
      const won =
        (winner === "mafia" && player.team === "mafia") ||
        (winner === "citizens" && player.team !== "mafia");

      const inc = {
        "stats.games": 1,
        "stats.xp": won ? 25 : 8
      };

      if (won) inc["stats.wins"] = 1;
      else inc["stats.losses"] = 1;

      if (player.team === "mafia") inc["stats.mafiaGames"] = 1;
      else inc["stats.citizenGames"] = 1;

      await User.findOneAndUpdate(
        { userId: Number(player.userId) },
        {
          $inc: inc,
          $push: {
            matchHistory: {
              $each: [{
                roomId: room.id,
                roomName: room.name,
                role: player.role,
                team: player.team,
                result: won ? "win" : "loss",
                survived: player.alive,
                playedAt: new Date()
              }],
              $slice: -50
            }
          }
        }
      );
    }
  }
}

module.exports = {
  GameEngine,
  ROLES,
  DEFAULT_SETTINGS,
  PHASES,
  publicRoom,
  mergeSettings
};