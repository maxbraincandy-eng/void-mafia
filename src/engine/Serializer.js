function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function publicPlayer(player, viewerSocketId = null) {
  const isViewer = viewerSocketId && player.socketId === viewerSocketId;

  return {
    id: player.id,
    userId: player.userId,
    nickname: player.nickname || "Player",
    avatar: player.avatar || "◆",
    seat: player.seat || 0,
    alive: player.alive !== false,
    connected: player.connected !== false,
    micOn: player.micOn !== false,
    cameraOn: player.cameraOn !== false,
    engineMuted: !!player.engineMuted,

    // როლი სრულად ჩანს მხოლოდ თვითონ მოთამაშისთვის ან თამაშის დასრულების შემდეგ
    role: isViewer || player.revealed ? player.role : null
  };
}

function publicSpectator(spectator) {
  return {
    userId: spectator.userId,
    nickname: spectator.nickname || "Spectator",
    avatar: spectator.avatar || "◇",
    connected: spectator.connected !== false
  };
}

function countAlive(players) {
  return safeArray(players).filter(p => p.alive !== false).length;
}

function publicRoom(room) {
  const players = safeArray(room.players);

  return {
    id: room.id,
    name: room.name || "VOID TABLE",
    phase: room.phase || "waiting",
    phaseLabel: room.phaseLabel || "მოლოდინი",
    day: room.day || 0,
    timer: room.timer || 0,
    alive: countAlive(players),

    hostUserId: room.hostUserId || players[0]?.userId || null,
    hostName: room.hostName || players[0]?.nickname || "ჰოსტი #1",
    hostAvatar: room.hostAvatar || players[0]?.avatar || "◆",

    playersCount: players.length,
    spectatorsCount: safeArray(room.spectators).length,

    settings: room.settings || {},
    locked: !!room.settings?.locked,
    gameOver: room.gameOver || null
  };
}

function serializeRoom(room, viewerSocketId = null) {
  const players = safeArray(room.players);
  const spectators = safeArray(room.spectators);

  const viewerPlayer = players.find(p => p.socketId === viewerSocketId);
  const viewerSpectator = spectators.find(s => s.socketId === viewerSocketId);

  const isHost =
    !!viewerPlayer &&
    Number(viewerPlayer.seat) === 1;

  const gameOver = room.gameOver || null;

  return {
    id: room.id,
    name: room.name || "VOID TABLE",

    phase: room.phase || "waiting",
    phaseLabel: room.phaseLabel || "მოლოდინი",
    day: room.day || 0,
    timer: room.timer || 0,
    alive: countAlive(players),

    hostUserId: room.hostUserId || players[0]?.userId || null,
    hostSocketId: room.hostSocketId || players[0]?.socketId || null,
    hostName: room.hostName || players[0]?.nickname || "ჰოსტი #1",
    hostAvatar: room.hostAvatar || players[0]?.avatar || "◆",

    settings: room.settings || {},

    players: players.map(p => {
      const item = publicPlayer(p, viewerSocketId);

      if (gameOver || room.phase === "waiting") {
        item.role = p.role || null;
      }

      return item;
    }),

    spectators: spectators.map(publicSpectator),

    chat: safeArray(room.chat).slice(-120),
    events: safeArray(room.events).slice(-120),

    nominatedIds: safeArray(room.nominatedIds),
    individualSpeakerId: room.individualSpeakerId || null,

    gameOver,

    viewer: {
      isHost,
      isSpectator: !!viewerSpectator && !viewerPlayer,
      userId: viewerPlayer?.userId || viewerSpectator?.userId || null,
      seat: viewerPlayer?.seat || null,
      playerId: viewerPlayer?.id || null
    }
  };
}

module.exports = {
  publicRoom,
  serializeRoom
};
