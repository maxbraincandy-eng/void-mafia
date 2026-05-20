const PHASES = {
  WAITING: "waiting",
  ROLE_REVEAL: "role_reveal",
  NIGHT: "night",
  DAY: "day",
  NOMINATION: "nomination",
  VOTE: "vote",
  ENDED: "ended"
};

const ROLES = [
  { key: "mafia", label: "Mafia", team: "mafia" },
  { key: "don", label: "Don", team: "mafia" },
  { key: "doctor", label: "Doctor", team: "town" },
  { key: "sheriff", label: "Sheriff", team: "town" },
  { key: "detective", label: "Detective", team: "town" },
  { key: "bodyguard", label: "Bodyguard", team: "town" },
  { key: "citizen", label: "Citizen", team: "town" }
];

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  language: "Georgian",
  autoPhase: true,
  timers: {
    roleReveal: 15,
    night: 45,
    day: 90,
    nomination: 45,
    vote: 35
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

function now() {
  return Date.now();
}

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10);
}

function roomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function safeText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roleInfo(role) {
  return ROLES.find(r => r.key === role) || ROLES.find(r => r.key === "citizen");
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergeSettings(input = {}) {
  const settings = clone(DEFAULT_SETTINGS);

  settings.maxPlayers = Number(input.maxPlayers || settings.maxPlayers);
  settings.language = safeText(input.language || settings.language, 32) || "Georgian";
  settings.autoPhase = input.autoPhase !== false;

  settings.timers = {
    ...settings.timers,
    ...(input.timers || {})
  };

  settings.roles = {
    ...settings.roles,
    ...(input.roles || {})
  };

  settings.maxPlayers = Math.max(4, Math.min(20, Number(settings.maxPlayers || 10)));

  for (const k of Object.keys(settings.timers)) {
    settings.timers[k] = Math.max(0, Number(settings.timers[k] || 0));
  }

  settings.roles.doctor = 1;
  settings.roles.sheriff = 1;

  settings.roles.don = Math.max(0, Number(settings.roles.don || 0));
  settings.roles.detective = Math.max(0, Number(settings.roles.detective || 0));
  settings.roles.bodyguard = Math.max(0, Number(settings.roles.bodyguard || 0));

  const extraRoles =
    settings.roles.don +
    settings.roles.detective +
    settings.roles.bodyguard;

  const maxMafia = Math.max(1, settings.maxPlayers - 2 - extraRoles);

  settings.roles.mafia = Math.max(
    1,
    Math.min(Number(settings.roles.mafia || 1), maxMafia)
  );

  settings.roles.citizen = 0;

  return settings;
}

function createPlayer(user, socketId, seat) {
  return {
    id: uid("p_"),
    socketId,
    userId: Number(user.userId),
    nickname: user.nickname || "Player",
    avatar: user.avatar || "◆",
    seat,
    role: null,
    team: null,
    alive: true,
    connected: true,
    micOn: true,
    cameraOn: true,
    speaking: false,
    voted: false,
    voteTargetId: null,
    nightDone: false,
    nightTargetId: null,
    createdAt: now(),
    lastSeenAt: now()
  };
}

function publicPlayer(player, viewerUserId, room) {
  const isMe = Number(player.userId) === Number(viewerUserId);
  const showRole =
    isMe ||
    room.phase === PHASES.ENDED ||
    room.gameOver;

  return {
    id: player.id,
    socketId: player.socketId,
    userId: player.userId,
    nickname: player.nickname,
    avatar: player.avatar,
    seat: player.seat,
    alive: player.alive,
    connected: player.connected,
    micOn: player.micOn,
    cameraOn: player.cameraOn,
    speaking: player.speaking,
    role: showRole ? player.role : null,
    team: showRole ? player.team : null
  };
}

function publicRoom(room, viewerUserId = 0) {
  const viewer = room.players.find(p => Number(p.userId) === Number(viewerUserId));
  const isHost = Number(room.hostUserId) === Number(viewerUserId);

  return {
    id: room.id,
    name: room.name,
    phase: room.phase,
    phaseLabel: room.phaseLabel,
    day: room.day,
    timer: room.timer,
    alive: room.players.filter(p => p.alive).length,
    hostUserId: room.hostUserId,
    hostName: room.hostName,
    settings: room.settings,
    players: room.players.map(p => publicPlayer(p, viewerUserId, room)),
    spectators: room.spectators.map(s => ({
      userId: s.userId,
      nickname: s.nickname,
      avatar: s.avatar,
      socketId: s.socketId
    })),
    chat: room.chat.slice(-80),
    events: room.events.slice(-80),
    nominatedIds: room.nominatedIds || [],
    votes: room.votes || {},
    gameOver: room.gameOver || null,
    viewer: {
      userId: viewerUserId,
      isHost,
      role: viewer?.role || null,
      team: viewer?.team || null,
      alive: viewer?.alive !== false
    }
  };
}

class GameEngine {
  constructor(ctx) {
    this.ctx = ctx;
  }

  createRoom({ name, host, settings }) {
    if (!host) throw new Error("User not found");

    let id;
    do {
      id = roomId();
    } while (this.ctx.rooms.has(id));

    const room = {
      id,
      name: safeText(name, 42) || "VOID TABLE",
      phase: PHASES.WAITING,
      phaseLabel: "Lobby",
      day: 0,
      timer: 0,
      settings: mergeSettings(settings || {}),
      hostUserId: Number(host.userId),
      hostName: host.nickname || "Host",
      hostSocketId: null,
      players: [],
      spectators: [],
      chat: [],
      events: [],
      nominatedIds: [],
      votes: {},
      nightActions: {},
      gameOver: null,
      createdAt: now(),
      updatedAt: now()
    };

    const player = createPlayer(host, null, 1);
    room.players.push(player);

    this.ctx.rooms.set(room.id, room);
    this.event(room, `${player.nickname} created the room.`, "system");
    this.publishRooms();

    return room;
  }

  joinRoom(roomIdValue, user, socketId, spectator = false) {
    const room = this.ctx.rooms.get(String(roomIdValue));
    if (!room) throw new Error("Room not found");
    if (!user) throw new Error("User not found");

    if (spectator || room.phase !== PHASES.WAITING) {
      let sp = room.spectators.find(s => Number(s.userId) === Number(user.userId));
      if (!sp) {
        sp = {
          userId: Number(user.userId),
          nickname: user.nickname || "Spectator",
          avatar: user.avatar || "◆",
          socketId
        };
        room.spectators.push(sp);
      } else {
        sp.socketId = socketId;
      }

      room.updatedAt = now();
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

      player = createPlayer(user, socketId, room.players.length + 1);
      room.players.push(player);
      this.event(room, `#${player.seat} ${player.nickname} joined.`, "join");
    }

    if (Number(player.seat) === 1) {
      room.hostUserId = Number(player.userId);
      room.hostName = player.nickname;
      room.hostSocketId = socketId;
    }

    room.updatedAt = now();

    return { room, spectator: false };
  }

  updateSettings(room, settings, userId) {
    if (!room) throw new Error("Room not found");
    if (room.phase !== PHASES.WAITING) throw new Error("Settings can be changed only in lobby");
    if (Number(room.hostUserId) !== Number(userId)) throw new Error("Host only");

    room.settings = mergeSettings({
      ...room.settings,
      ...(settings || {}),
      timers: {
        ...(room.settings.timers || {}),
        ...((settings || {}).timers || {})
      },
      roles: {
        ...(room.settings.roles || {}),
        ...((settings || {}).roles || {})
      }
    });

    room.updatedAt = now();
    this.event(room, "Room settings updated.", "settings");
    this.roomState(room);
    this.publishRooms();

    return room.settings;
  }

  start(room, userId) {
    if (!room) throw new Error("Room not found");
    if (room.phase !== PHASES.WAITING) throw new Error("Game already started");
    if (Number(room.hostUserId) !== Number(userId)) throw new Error("Host only");

    if (room.players.length < 4) {
      throw new Error("Minimum 4 players required");
    }

    this.assignRoles(room);

    room.phase = PHASES.ROLE_REVEAL;
    room.phaseLabel = "Role Reveal";
    room.timer = Number(room.settings.timers.roleReveal || 15);
    room.day = 0;
    room.nominatedIds = [];
    room.votes = {};
    room.nightActions = {};
    room.gameOver = null;

    this.event(room, "Game started.", "start");
    this.roomState(room);
    this.publishRooms();

    return room;
  }

  assignRoles(room) {
    const players = shuffle(room.players);
    const count = players.length;
    const cfg = room.settings.roles || {};
    const roles = [];

    const mafiaCount = Math.max(1, Number(cfg.mafia || 1));

    for (let i = 0; i < mafiaCount; i++) roles.push("mafia");

    roles.push("doctor");
    roles.push("sheriff");

    for (let i = 0; i < Number(cfg.don || 0); i++) roles.push("don");
    for (let i = 0; i < Number(cfg.detective || 0); i++) roles.push("detective");
    for (let i = 0; i < Number(cfg.bodyguard || 0); i++) roles.push("bodyguard");

    const finalRoles = roles.slice(0, count);

    while (finalRoles.length < count) {
      finalRoles.push("citizen");
    }

    const mixed = shuffle(finalRoles);

    players.forEach((player, i) => {
      player.role = mixed[i] || "citizen";
      player.team = roleInfo(player.role).team;
      player.alive = true;
      player.voted = false;
      player.voteTargetId = null;
      player.nightDone = false;
      player.nightTargetId = null;
    });
  }

  async nextPhase(room) {
    if (!room) throw new Error("Room not found");
    if (room.phase === PHASES.ENDED) return room;

    if (room.phase === PHASES.ROLE_REVEAL) {
      room.phase = PHASES.NIGHT;
      room.phaseLabel = "Night";
      room.timer = Number(room.settings.timers.night || 45);
      room.nightActions = {};
      room.players.forEach(p => {
        p.nightDone = false;
        p.nightTargetId = null;
      });
      this.event(room, "Night started.", "phase");
    } else if (room.phase === PHASES.NIGHT) {
      this.resolveNight(room);
      if (!this.checkWin(room)) {
        room.phase = PHASES.DAY;
        room.phaseLabel = "Day";
        room.day += 1;
        room.timer = Number(room.settings.timers.day || 90);
        this.event(room, "Day started.", "phase");
      }
    } else if (room.phase === PHASES.DAY) {
      room.phase = PHASES.NOMINATION;
      room.phaseLabel = "Nomination";
      room.timer = Number(room.settings.timers.nomination || 45);
      room.nominatedIds = [];
      this.event(room, "Nomination started.", "phase");
    } else if (room.phase === PHASES.NOMINATION) {
      room.phase = PHASES.VOTE;
      room.phaseLabel = "Vote";
      room.timer = Number(room.settings.timers.vote || 35);
      room.votes = {};
      room.players.forEach(p => {
        p.voted = false;
        p.voteTargetId = null;
      });
      this.event(room, "Voting started.", "phase");
    } else if (room.phase === PHASES.VOTE) {
      this.resolveVote(room);

      if (!this.checkWin(room)) {
        room.phase = PHASES.NIGHT;
        room.phaseLabel = "Night";
        room.timer = Number(room.settings.timers.night || 45);
        room.nightActions = {};
        room.players.forEach(p => {
          p.nightDone = false;
          p.nightTargetId = null;
        });
        this.event(room, "Night started.", "phase");
      }
    }

    room.updatedAt = now();
    this.roomState(room);
    this.publishRooms();

    return room;
  }

  action(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor) return { ok: false, error: "Actor not found" };
    if (!actor.alive) return { ok: false, error: "You are dead" };
    if (room.phase !== PHASES.NIGHT) return { ok: false, error: "Night actions only" };

    const target = room.players.find(p => String(p.id) === String(targetId));
    if (!target || !target.alive) return { ok: false, error: "Target not found" };

    const activeRoles = ["mafia", "don", "doctor", "sheriff", "detective", "bodyguard"];
    if (!activeRoles.includes(actor.role)) {
      return { ok: false, error: "Your role has no night action" };
    }

    actor.nightDone = true;
    actor.nightTargetId = target.id;

    if (!room.nightActions[actor.role]) room.nightActions[actor.role] = [];
    room.nightActions[actor.role].push({
      actorId: actor.id,
      actorUserId: actor.userId,
      targetId: target.id,
      targetUserId: target.userId,
      at: now()
    });

    if (actor.role === "sheriff" || actor.role === "detective") {
      const isMafia = target.team === "mafia";
      return {
        ok: true,
        result: isMafia ? "mafia" : "not_mafia",
        label: isMafia ? "Mafia Team" : "Not Mafia"
      };
    }

    return { ok: true };
  }

  resolveNight(room) {
    const mafiaActions = [
      ...(room.nightActions.mafia || []),
      ...(room.nightActions.don || [])
    ];

    const doctorActions = room.nightActions.doctor || [];
    const bodyguardActions = room.nightActions.bodyguard || [];

    const protectedIds = new Set([
      ...doctorActions.map(a => a.targetId),
      ...bodyguardActions.map(a => a.targetId)
    ]);

    if (!mafiaActions.length) {
      this.event(room, "Night ended. Nobody was attacked.", "night");
      return;
    }

    const voteMap = {};
    mafiaActions.forEach(a => {
      voteMap[a.targetId] = (voteMap[a.targetId] || 0) + 1;
    });

    const targetId = Object.entries(voteMap).sort((a, b) => b[1] - a[1])[0][0];
    const target = room.players.find(p => p.id === targetId);

    if (!target) return;

    if (protectedIds.has(target.id)) {
      this.event(room, `${target.nickname} was attacked but survived.`, "night");
      return;
    }

    target.alive = false;
    this.event(room, `${target.nickname} was killed at night.`, "kill");
  }

  nominate(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor || !actor.alive) return { ok: false, error: "Actor not found" };
    if (room.phase !== PHASES.NOMINATION) return { ok: false, error: "Nomination phase only" };

    const target = room.players.find(p => String(p.id) === String(targetId));
    if (!target || !target.alive) return { ok: false, error: "Target not found" };

    if (!room.nominatedIds.includes(target.id)) {
      room.nominatedIds.push(target.id);
      this.event(room, `${actor.nickname} nominated ${target.nickname}.`, "nomination");
    }

    this.roomState(room);
    return { ok: true };
  }

  vote(room, actor, targetId) {
    if (!room) return { ok: false, error: "Room not found" };
    if (!actor || !actor.alive) return { ok: false, error: "Actor not found" };
    if (room.phase !== PHASES.VOTE) return { ok: false, error: "Vote phase only" };
    if (actor.voted) return { ok: false, error: "Already voted" };

    if (targetId !== "abstain" && !room.nominatedIds.includes(targetId)) {
      return { ok: false, error: "Target is not nominated" };
    }

    actor.voted = true;
    actor.voteTargetId = targetId;
    room.votes[actor.id] = targetId;

    this.event(room, `${actor.nickname} voted.`, "vote");

    const alive = room.players.filter(p => p.alive);
    const votedCount = alive.filter(p => p.voted).length;

    if (votedCount >= alive.length) {
      this.resolveVote(room);
      this.checkWin(room);
    }

    this.roomState(room);
    return { ok: true };
  }

  resolveVote(room) {
    const counts = {};

    Object.values(room.votes || {}).forEach(targetId => {
      if (targetId && targetId !== "abstain") {
        counts[targetId] = (counts[targetId] || 0) + 1;
      }
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      this.event(room, "Vote ended. Nobody was eliminated.", "vote");
      return;
    }

    const [targetId, topVotes] = entries[0];
    const secondVotes = entries[1]?.[1] || 0;

    if (topVotes === secondVotes) {
      this.event(room, "Vote tied. Nobody was eliminated.", "vote");
      return;
    }

    const target = room.players.find(p => p.id === targetId);
    if (target && target.alive) {
      target.alive = false;
      this.event(room, `${target.nickname} was eliminated by vote.`, "vote");
    }
  }

  checkWin(room) {
    const alive = room.players.filter(p => p.alive);
    const mafiaAlive = alive.filter(p => p.team === "mafia");
    const townAlive = alive.filter(p => p.team !== "mafia");

    if (!mafiaAlive.length) {
      room.phase = PHASES.ENDED;
      room.phaseLabel = "Ended";
      room.timer = 0;
      room.gameOver = { winner: "town", label: "Citizens win" };
      this.event(room, "Citizens win.", "end");
      return true;
    }

    if (mafiaAlive.length >= townAlive.length) {
      room.phase = PHASES.ENDED;
      room.phaseLabel = "Ended";
      room.timer = 0;
      room.gameOver = { winner: "mafia", label: "Mafia wins" };
      this.event(room, "Mafia wins.", "end");
      return true;
    }

    return false;
  }

  chat(room, sender, message, channel = "room") {
    if (!room) throw new Error("Room not found");
    if (!sender) throw new Error("Sender not found");

    const clean = safeText(message, 240);
    if (!clean) throw new Error("Message is empty");

    const player = room.players.find(p => Number(p.userId) === Number(sender.userId));

    if (channel === "mafia") {
      if (!player || player.team !== "mafia" || room.phase !== PHASES.NIGHT) {
        throw new Error("Mafia chat is available only for mafia at night");
      }
    }

    const msg = {
      id: uid("m_"),
      at: now(),
      channel,
      userId: Number(sender.userId),
      seat: player ? player.seat : null,
      nickname: sender.nickname || player?.nickname || "Player",
      avatar: sender.avatar || player?.avatar || "◆",
      message: clean
    };

    room.chat.push(msg);
    if (room.chat.length > 150) room.chat.shift();

    room.updatedAt = now();

    return msg;
  }

  event(room, text, type = "system") {
    room.events.push({
      id: uid("e_"),
      at: now(),
      type,
      text: safeText(text, 240)
    });

    if (room.events.length > 150) room.events.shift();
  }

  roomState(room) {
    if (!room) return;

    const io = this.ctx.io;

    for (const player of room.players) {
      if (player.socketId) {
        io.to(player.socketId).emit("room:state", publicRoom(room, player.userId));
      }
    }

    for (const spectator of room.spectators) {
      if (spectator.socketId) {
        io.to(spectator.socketId).emit("room:state", publicRoom(room, spectator.userId));
      }
    }
  }

  publishRooms() {
    const rooms = Array.from(this.ctx.rooms.values()).map(room => ({
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

  terminateRoom(room, reason = "Room terminated") {
    if (!room) return;

    this.event(room, reason, "end");

    const io = this.ctx.io;

    io.to(room.id).emit("room:closed", {
      ok: true,
      roomId: room.id,
      reason
    });

    this.ctx.rooms.delete(room.id);
    this.publishRooms();
  }
}

module.exports = {
  GameEngine,
  ROLES,
  DEFAULT_SETTINGS,
  PHASES,
  publicRoom,
  mergeSettings,
  roleInfo
};