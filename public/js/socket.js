function emit(event, payload) {
  return new Promise(resolve => App.socket.emit(event, payload, resolve));
}

async function loginGuest(nickname, avatar) {
  const saved = localStorage.getItem("voidUserId");
  const res = await emit("auth:guest", { userId: saved, nickname, avatar });
  if (!res.ok) throw new Error(res.error || "Login failed");

  App.user = res.user;
  localStorage.setItem("voidUserId", res.user.userId);
  localStorage.setItem("voidNick", res.user.nickname);
  localStorage.setItem("voidAvatar", res.user.avatar);
  updateUserUi();
  screen("app");
  await loadRooms();
  await refreshStatsPages();
}

async function loadRooms() {
  const rooms = await emit("rooms:get", {});
  App.rooms = rooms || [];
  renderRooms();
  refreshStatsPages();
}

async function createRoom() {
  const res = await emit("room:create", {
    user: App.user,
    name: $("roomName").value.trim(),
    settings: readRoomSettings()
  });
  if (!res.ok) return toast(res.error || "მაგიდა ვერ შეიქმნა");
  joinRoom(res.room.id, false);
}

async function joinRoom(roomId, spectator = false) {
  const res = await emit("room:join", { roomId, spectator, user: App.user });
  if (!res.ok) return toast(res.error || "შესვლა ვერ მოხერხდა");
  App.currentRoomId = roomId;
  App.currentRoom = res.room;
  screen("game");
  await ensureMedia();
  renderGame();
}

App.socket.on("rooms:list", rooms => {
  App.rooms = rooms || [];
  if (!$("app").classList.contains("hidden")) renderRooms();
});

App.socket.on("room:state", room => {
  if (!App.currentRoomId || room.id !== App.currentRoomId) return;
  App.currentRoom = room;
  renderGame();
  maybeAction();
});

App.socket.on("phase:changed", info => {
  showOverlay(info.label, phaseHelp(info.phase));
});

App.socket.on("phase:tick", data => {
  $("timer").textContent = fmt(data.timer);
});

App.socket.on("audio:cue", data => {
  Sound.play(data.cue);
});

App.socket.on("game:event", ev => {
  if (!App.currentRoom) return;
  App.currentRoom.events = App.currentRoom.events || [];
  App.currentRoom.events.push(ev);
  renderLog();
});

App.socket.on("chat:message", msg => {
  addChat(msg);
});
