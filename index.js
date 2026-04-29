

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};
const users = {};

const NIGHT_SECONDS = 60;
const DAY_SECONDS = 45;
const VOTE_SECONDS = 30;

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function getPublicRooms() {
  return Object.values(rooms).map(room => ({
    code: room.code,
    playerCount: room.players.length,
    spectatorCount: room.spectators.length,
    phase: room.phase
  }));
}

function createRoom(roomCode, hostId) {
  rooms[roomCode] = {
    code: roomCode,
    hostId,
    players: [],
    spectators: [],
    phase: "waiting",
    nightNumber: 0,
    dayNumber: 0,
    nightActions: {
      mafiaTarget: null,
      doctorSave: null,
      sheriffChecks: {}
    },
    votes: {},
    timers: {
      nightTimer: null,
      dayTimer: null,
      voteTimer: null
    }
  };

  return rooms[roomCode];
}

function getFreeIndex(room) {
  const occupied = room.players.map(p => p.index);
  let index = 1;
  while (occupied.includes(index)) index++;
  return index;
}

function buildRoles(playerCount, settings) {
  let roles = [];
  const mafiaCount = Math.max(1, Number(settings.mafia || 1));

  if (settings.don) {
    roles.push("don");
    for (let i = 1; i < mafiaCount; i++) roles.push("mafia");
  } else {
    for (let i = 0; i < mafiaCount; i++) roles.push("mafia");
  }

  if (settings.doctor) roles.push("doctor");
  if (settings.sheriff) roles.push("sheriff");

  while (roles.length < playerCount) roles.push("citizen");

  return shuffle(roles.slice(0, playerCount));
}

function publicGameState(room) {
  return {
    phase: room.phase,
    nightNumber: room.nightNumber,
    dayNumber: room.dayNumber,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      index: p.index,
      alive: p.alive,
      spectator: false
    }))
  };
}

function emitSpectators(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit(
    "spectators-update",
    room.spectators.map(s => ({
      id: s.id,
      name: s.name
    }))
  );
}

function emitGameState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit("game-state", publicGameState(room));
  emitSpectators(roomCode);
  io.emit("update-room-list", getPublicRooms());
}

function clearRoomTimers(room) {
  if (!room || !room.timers) return;

  if (room.timers.nightTimer) clearTimeout(room.timers.nightTimer);
  if (room.timers.dayTimer) clearTimeout(room.timers.dayTimer);
  if (room.timers.voteTimer) clearTimeout(room.timers.voteTimer);

  room.timers.nightTimer = null;
  room.timers.dayTimer = null;
  room.timers.voteTimer = null;
}

function resetNightActions(room) {
  room.nightActions = {
    mafiaTarget: null,
    doctorSave: null,
    sheriffChecks: {}
  };
}

function emitMafiaList(room) {
  const mafiaIds = room.players
    .filter(p => p.role === "mafia" || p.role === "don")
    .map(p => p.id);

  room.players.forEach(player => {
    if (player.role === "mafia" || player.role === "don") {
      io.to(player.id).emit("mafia-list", mafiaIds);
    } else {
      io.to(player.id).emit("mafia-list", []);
    }
  });

  room.spectators.forEach(s => {
    io.to(s.id).emit("mafia-list", mafiaIds);
  });
}

function checkWin(roomCode) {
  const room = rooms[roomCode];
  if (!room) return true;
  if (room.phase === "waiting") return false;

  const alive = room.players.filter(p => p.alive);
  const mafia = alive.filter(p => p.role === "mafia" || p.role === "don");
  const peaceful = alive.filter(p => p.role !== "mafia" && p.role !== "don");

  if (mafia.length === 0) {
    room.phase = "ended";
    clearRoomTimers(room);

    io.to(roomCode).emit("game-over", {
      winner: "citizens",
      message: "მშვიდობიანებმა მოიგეს"
    });

    emitGameState(roomCode);
    return true;
  }

  if (mafia.length >= peaceful.length) {
    room.phase = "ended";
    clearRoomTimers(room);

    io.to(roomCode).emit("game-over", {
      winner: "mafia",
      message: "მაფიამ მოიგო"
    });

    emitGameState(roomCode);
    return true;
  }

  return false;
}

function startNight(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase === "ended") return;

  clearRoomTimers(room);

  room.phase = "night";
  room.nightNumber++;
  room.votes = {};
  resetNightActions(room);

  io.to(roomCode).emit(
    "phase-message",
    `ღამის ფაზა დაიწყო. ღამე #${room.nightNumber}: მაფია კლავს, ექიმი იცავს, შერიფი ამოწმებს.`
  );

  emitMafiaList(room);
  emitGameState(roomCode);

  room.timers.nightTimer = setTimeout(() => {
    resolveNight(roomCode);
  }, NIGHT_SECONDS * 1000);
}

function startDay(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase === "ended") return;

  clearRoomTimers(room);

  room.phase = "day";
  room.dayNumber++;
  room.votes = {};

  io.to(roomCode).emit(
    "phase-message",
    `დღის ფაზა დაიწყო. დღე #${room.dayNumber}: ყველას ხმა ჩართულია. იმსჯელეთ.`
  );

  emitGameState(roomCode);

  room.timers.dayTimer = setTimeout(() => {
    startVote(roomCode);
  }, DAY_SECONDS * 1000);
}

function startVote(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase === "ended") return;

  clearRoomTimers(room);

  room.phase = "vote";
  room.votes = {};

  io.to(roomCode).emit("phase-message", "დაიწყო ხმის მიცემა.");
  emitGameState(roomCode);

  room.timers.voteTimer = setTimeout(() => {
    resolveVotes(roomCode);
  }, VOTE_SECONDS * 1000);
}

function checkNightComplete(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== "night") return;

  const alive = room.players.filter(p => p.alive);

  const hasMafia = alive.some(p => p.role === "mafia" || p.role === "don");
  const hasDoctor = alive.some(p => p.role === "doctor");
  const hasSheriff = alive.some(p => p.role === "sheriff");

  const mafiaDone = !hasMafia || !!room.nightActions.mafiaTarget;
  const doctorDone = !hasDoctor || !!room.nightActions.doctorSave;
  const sheriffDone =
    !hasSheriff ||
    Object.keys(room.nightActions.sheriffChecks || {}).length > 0;

  if (mafiaDone && doctorDone && sheriffDone) {
    resolveNight(roomCode);
  }
}

function resolveNight(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== "night") return;

  clearRoomTimers(room);

  const killedId = room.nightActions.mafiaTarget;
  const savedId = room.nightActions.doctorSave;

  if (killedId && killedId !== savedId) {
    const victim = room.players.find(p => p.id === killedId);

    if (victim && victim.alive) {
      victim.alive = false;

      io.to(roomCode).emit(
        "phase-message",
        `ღამით მოკლეს: #${victim.index} ${victim.name}`
      );
    }
  } else if (killedId && killedId === savedId) {
    io.to(roomCode).emit(
      "phase-message",
      "ექიმმა გადაარჩინა მაფიის სამიზნე. ღამით არავინ მომკვდარა."
    );
  } else {
    io.to(roomCode).emit("phase-message", "ღამით არავინ მომკვდარა.");
  }

  resetNightActions(room);

  if (checkWin(roomCode)) return;

  startDay(roomCode);
}

function resolveVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.phase !== "vote") return;

  clearRoomTimers(room);

  const counts = {};

  Object.values(room.votes).forEach(targetId => {
    counts[targetId] = (counts[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  let eliminatedId = null;
  let tie = false;

  for (const id in counts) {
    if (counts[id] > maxVotes) {
      maxVotes = counts[id];
      eliminatedId = id;
      tie = false;
    } else if (counts[id] === maxVotes) {
      tie = true;
    }
  }

  if (!eliminatedId || tie) {
    io.to(roomCode).emit("phase-message", "ხმები გაიყო. არავინ გავარდა.");
  } else {
    const eliminated = room.players.find(p => p.id === eliminatedId);

    if (eliminated && eliminated.alive) {
      eliminated.alive = false;

      io.to(roomCode).emit(
        "phase-message",
        `ხმის მიცემით გავარდა: #${eliminated.index} ${eliminated.name}`
      );
    }
  }

  room.votes = {};

  if (checkWin(roomCode)) return;

  startNight(roomCode);
}

io.on("connection", socket => {
  console.log(`[SOCKET] connected: ${socket.id}`);

  socket.on("get-rooms", () => {
    socket.emit("update-room-list", getPublicRooms());
  });

  socket.on("join-room", (roomCode, playerName, isSpectator = false) => {
    if (!roomCode || !playerName) return;

    let room = rooms[roomCode];

    if (!room) {
      room = createRoom(roomCode, socket.id);
    }

    const alreadyPlayer = room.players.some(p => p.id === socket.id);
    const alreadySpectator = room.spectators.some(s => s.id === socket.id);
    if (alreadyPlayer || alreadySpectator) return;

    socket.join(roomCode);

    if (isSpectator) {
      const spectator = {
        id: socket.id,
        name: playerName,
        room: roomCode,
        index: 0,
        role: null,
        alive: false,
        spectator: true
      };

      users[socket.id] = spectator;
      room.spectators.push(spectator);

      socket.emit("all-users-info", room.players);
      socket.emit("room-users-list", room.players);

      socket.to(roomCode).emit("phase-message", `👁️ ${playerName} spectator-ად შემოვიდა.`);
      emitSpectators(roomCode);
      emitGameState(roomCode);

      console.log(`[VOID] spectator joined room ${roomCode}: ${playerName}`);
      return;
    }

    if (room.players.length >= 10) {
      return socket.emit("error", { msg: "ოთახი სავსეა" });
    }

    if (room.phase !== "waiting") {
      return socket.emit("error", {
        msg: "თამაში უკვე დაწყებულია. შეგიძლია მხოლოდ spectator-ად შესვლა."
      });
    }

    const playerIndex = getFreeIndex(room);

    const newUser = {
      id: socket.id,
      name: playerName,
      room: roomCode,
      index: playerIndex,
      role: null,
      alive: true,
      spectator: false
    };

    users[socket.id] = newUser;
    room.players.push(newUser);

    if (room.hostId === socket.id) {
      socket.emit("is-host");
    }

    const otherUsers = room.players.filter(p => p.id !== socket.id);

    socket.emit("all-users-info", otherUsers);

    socket.to(roomCode).emit("user-joined-with-info", {
      id: socket.id,
      nick: playerName,
      index: playerIndex,
      spectator: false
    });

    socket.emit("room-users-list", room.players);

    io.to(roomCode).emit(
      "phase-message",
      `#${playerIndex} ${playerName} შემოვიდა ოთახში.`
    );

    emitGameState(roomCode);

    console.log(`[VOID] #${playerIndex} joined room ${roomCode}: ${playerName}`);
  });

  socket.on("sending-signal", payload => {
    const sender = users[socket.id];
    if (!sender) return;

    io.to(payload.userToSignal).emit("user-joined-with-info", {
      signal: payload.signal,
      id: payload.callerID,
      nick: sender.name,
      index: sender.index,
      spectator: sender.spectator
    });
  });

  socket.on("returning-signal", payload => {
    io.to(payload.callerID).emit("receiving-returned-signal", {
      signal: payload.signal,
      id: socket.id
    });
  });

  socket.on("start-game-request", data => {
    const room = rooms[data.room];

    if (!room) return;
    if (room.hostId !== socket.id) return;

    if (room.players.length < 4) {
      return socket.emit(
        "phase-message",
        "თამაშის დასაწყებად საჭიროა მინიმუმ 4 მოთამაშე."
      );
    }

    clearRoomTimers(room);

    const settings = data.settings || {};
    const roles = buildRoles(room.players.length, settings);

    room.nightNumber = 0;
    room.dayNumber = 0;

    room.players.forEach((player, i) => {
      player.role = roles[i];
      player.alive = true;

      io.to(player.id).emit("assign-role", player.role);
    });

    emitMafiaList(room);

    room.votes = {};
    resetNightActions(room);

    io.to(data.room).emit("phase-message", "თამაში დაიწყო. პირველი ფაზაა ღამე.");
    console.log(`[GAME] started in room: ${data.room}`);

    startNight(data.room);
  });

  socket.on("night-action", data => {
    const room = rooms[data.room];
    if (!room || room.phase !== "night") return;

    const actor = room.players.find(p => p.id === socket.id);
    if (!actor || !actor.alive || actor.spectator) return;

    const target = room.players.find(p => p.id === data.targetId);
    if (!target || !target.alive || target.spectator) return;

    if (
      (actor.role === "mafia" || actor.role === "don") &&
      data.action === "kill"
    ) {
      room.nightActions.mafiaTarget = target.id;

      socket.emit(
        "phase-message",
        `მაფიის არჩევანი მიღებულია: #${target.index} ${target.name}`
      );
    }

    if (actor.role === "doctor" && data.action === "save") {
      room.nightActions.doctorSave = target.id;

      socket.emit(
        "phase-message",
        `ექიმის არჩევანი მიღებულია: #${target.index} ${target.name}`
      );
    }

    if (actor.role === "sheriff" && data.action === "check") {
      room.nightActions.sheriffChecks[socket.id] = target.id;

      socket.emit("sheriff-result", {
        name: target.name,
        isMafia: target.role === "mafia" || target.role === "don"
      });
    }

    checkNightComplete(data.room);
  });

  socket.on("vote-player", data => {
    const room = rooms[data.room];
    if (!room || room.phase !== "vote") return;

    const voter = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === data.targetId);

    if (!voter || !voter.alive || voter.spectator) return;
    if (!target || !target.alive || target.spectator) return;
    if (target.id === voter.id) return;

    room.votes[voter.id] = target.id;

    const aliveCount = room.players.filter(p => p.alive).length;
    const votesCount = Object.keys(room.votes).length;

    io.to(data.room).emit(
      "phase-message",
      `ხმა მიღებულია: ${votesCount}/${aliveCount}`
    );

    if (votesCount >= aliveCount) {
      resolveVotes(data.room);
    }
  });

  socket.on("send-chat-msg", data => {
    if (!data || !data.room) return;

    const user = users[socket.id];
    if (!user) return;

    io.to(data.room).emit("receive-chat-msg", {
      name: user.spectator ? `👁️ ${user.name}` : user.name,
      text: String(data.text || "").slice(0, 300)
    });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (!user) return;

    const roomCode = user.room;
    const room = rooms[roomCode];

    if (room) {
      room.players = room.players.filter(p => p.id !== socket.id);
      room.spectators = room.spectators.filter(s => s.id !== socket.id);

      socket.to(roomCode).emit("user-left", socket.id);

      if (room.hostId === socket.id && room.players.length > 0) {
        room.hostId = room.players[0].id;
        io.to(room.hostId).emit("is-host");

        io.to(roomCode).emit(
          "phase-message",
          `ჰოსტი გახდა: #${room.players[0].index} ${room.players[0].name}`
        );
      }

      if (room.players.length <= 0 && room.spectators.length <= 0) {
        clearRoomTimers(room);
        delete rooms[roomCode];
      } else {
        emitSpectators(roomCode);
        emitMafiaList(room);
        emitGameState(roomCode);
      }
    }

    delete users[socket.id];

    io.emit("update-room-list", getPublicRooms());

    console.log(`[SOCKET] disconnected: ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`> VOID MAFIA SERVER აქტიურია პორტზე ${PORT}`);
});
