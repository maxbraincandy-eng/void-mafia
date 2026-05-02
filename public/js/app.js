const App = {
  socket: null,
  user: null,
  currentRoom: null,
  currentRoomId: null,
  localStream: null,
  roles: [],
  peers: new Map(),
  audioContext: null,
  analyser: null,
  micData: null
};

function $(id) { return document.getElementById(id); }

function toast(message) {
  const box = $("toast");
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = message;
  div.style.cssText = "position:fixed;left:14px;right:14px;bottom:16px;z-index:99999;background:#05030b;border:1px solid #00f5ff;border-radius:16px;padding:12px;text-align:center";
  box.appendChild(div);
  setTimeout(() => div.remove(), 2600);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function roleLabel(role) {
  return App.roles.find(r => r.id === role)?.label || role;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  return res.json();
}

function showScreen(name) {
  ["auth", "app", "game"].forEach(id => $(id)?.classList.add("hidden"));
  $(name)?.classList.remove("hidden");
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(`page${name}`)?.classList.add("active");
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  $("pageTitle").textContent = { Rooms: "მაგიდები", Clans: "კლანები", Stats: "სტატისტიკა", Profile: "პროფილი" }[name] || name;
  if (name === "Clans") loadClans();
  if (name === "Stats") loadStats();
  if (name === "Profile") updateUserUi();
}

function saveUser(user) {
  App.user = user;
  localStorage.setItem("void_v13_user", JSON.stringify(user));
  updateUserUi();
}

function loadSavedUser() {
  try { return JSON.parse(localStorage.getItem("void_v13_user") || "null"); } catch { return null; }
}

function updateUserUi() {
  const u = App.user;
  if (!u) return;
  const st = u.stats || {};
  $("userLine").textContent = `ID ${u.userId} · ${u.nickname}`;
  $("profileName").textContent = u.nickname;
  $("profileId").textContent = `ID ${u.userId}`;
  $("profileAvatar").textContent = u.avatar || "◆";
  $("pLevel").textContent = st.level || 1;
  $("pXp").textContent = st.xp || 0;
  $("pWins").textContent = st.wins || 0;
  $("pGames").textContent = st.gamesPlayed || 0;
  $("editNickname").value = u.nickname || "";
}

function connectSocket() {
  if (App.socket) return;
  App.socket = io();

  App.socket.on("rooms:list", rooms => renderRooms(rooms || []));
  App.socket.on("room:state", room => {
    App.currentRoom = room;
    App.currentRoomId = room.id;
    renderGame();
    connectPeers();
  });
  App.socket.on("chat:message", msg => {
    if (App.currentRoom) {
      App.currentRoom.chat = App.currentRoom.chat || [];
      App.currentRoom.chat.push(msg);
    }
    addChat(msg);
  });
  App.socket.on("signal:offer", handleOffer);
  App.socket.on("signal:answer", handleAnswer);
  App.socket.on("signal:ice", handleIce);
}

async function ensureMedia() {
  if (App.localStream) return App.localStream;
  try {
    App.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    setupMicAnimation();
  } catch (err) {
    console.error(err);
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }
  return App.localStream;
}

function setupMicAnimation() {
  try {
    App.audioContext = App.audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const source = App.audioContext.createMediaStreamSource(App.localStream);
    App.analyser = App.audioContext.createAnalyser();
    App.analyser.fftSize = 256;
    source.connect(App.analyser);
    App.micData = new Uint8Array(App.analyser.frequencyBinCount);
    setInterval(() => {
      if (!App.analyser) return;
      App.analyser.getByteFrequencyData(App.micData);
      const avg = App.micData.reduce((a, b) => a + b, 0) / App.micData.length;
      const speaking = avg > 18;
      document.querySelectorAll(".is-me").forEach(el => el.classList.toggle("speaking", speaking));
      document.querySelectorAll("#lobbyMicBtn,#micBtn").forEach(el => el.classList.toggle("speaking", speaking));
    }, 130);
  } catch {}
}

async function authGuest() {
  connectSocket();
  const nickname = $("quickNick").value.trim() || "Player";
  const avatar = document.querySelector(".avatar-choice.active")?.textContent || "◆";
  const data = await api("/api/auth/guest", { method: "POST", body: JSON.stringify({ nickname, avatar }) });
  if (!data.ok) return toast(data.error || "შესვლა ვერ მოხერხდა");
  saveUser(data.user);
  showScreen("app");
  loadRooms();
}

async function login() {
  const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value }) });
  if (!data.ok) return toast(data.error || "შესვლა ვერ მოხერხდა");
  saveUser(data.user);
  connectSocket();
  showScreen("app");
  loadRooms();
}

async function register() {
  const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ nickname: $("regNick").value, email: $("regEmail").value, password: $("regPassword").value }) });
  if (!data.ok) return toast(data.error || "რეგისტრაცია ვერ მოხერხდა");
  saveUser(data.user);
  connectSocket();
  showScreen("app");
  loadRooms();
}

async function refreshProfile() {
  if (!App.user?.userId) return;
  const data = await api(`/api/users/${App.user.userId}/profile`);
  if (data.ok) saveUser(data.profile);
}

async function saveNickname() {
  if (!App.user?.userId) return;
  const nickname = $("editNickname").value.trim();
  const data = await api(`/api/users/${App.user.userId}/profile`, { method: "PATCH", body: JSON.stringify({ nickname }) });
  if (!data.ok) return toast(data.error || "ვერ შეინახა");
  saveUser(data.profile);
  toast("შენახულია");
}

async function loadRoles() {
  const data = await api("/api/roles");
  App.roles = data.roles || [];
  renderRoleInputs();
}

function renderRoleInputs() {
  const create = $("roleGrid");
  const settings = $("settingsRoleGrid");
  if (create) {
    create.innerHTML = App.roles.map(r => `<label>${r.label}<input data-create-role="${r.id}" type="number" min="0" max="16" value="${r.defaultCount}"></label>`).join("");
  }
  if (settings) {
    settings.innerHTML = App.roles.map(r => `<label>${r.label}<input data-set-role="${r.id}" type="number" min="0" max="16" value="${r.defaultCount}"></label>`).join("");
  }
}

function collectCreateSettings() {
  const roles = {};
  document.querySelectorAll("[data-create-role]").forEach(input => roles[input.dataset.createRole] = Number(input.value || 0));
  roles.mafia = Number($("mafiaCount").value || roles.mafia || 1);
  return {
    maxPlayers: Number($("maxPlayers").value || 10),
    roles,
    timers: {
      night: Number($("tNight").value || 45),
      dayCommon: Number($("tDay").value || 60),
      nomination: Number($("tNom").value || 45),
      vote: Number($("tVote").value || 35)
    }
  };
}

async function loadRooms() {
  connectSocket();
  App.socket.emit("rooms:get", {}, res => renderRooms(res?.rooms || []));
}

function renderRooms(rooms) {
  $("roomsCount").textContent = rooms.length;
  $("sRooms").textContent = rooms.length;
  $("sLive").textContent = rooms.filter(r => r.phase !== "waiting").length;
  $("sPlayers").textContent = rooms.reduce((a, r) => a + Number(r.players || 0), 0);

  const box = $("roomsList");
  if (!rooms.length) {
    box.innerHTML = `<div class="room-card">მაგიდები ჯერ არ არის.</div>`;
    return;
  }

  box.innerHTML = rooms.map(r => `
    <div class="room-card">
      <div class="section-head"><h2>${escapeHtml(r.name)}</h2><span class="badge ${r.phase !== "waiting" ? "live" : ""}">${r.phase}</span></div>
      <p>ჰოსტი: ${escapeHtml(r.hostName)} · კოდი: ${r.id}</p>
      <p>${r.players}/${r.maxPlayers}</p>
      <div class="row"><button data-join="${r.id}" class="primary">შესვლა</button><button data-watch="${r.id}">ყურება</button></div>
    </div>
  `).join("");

  box.querySelectorAll("[data-join]").forEach(btn => btn.onclick = () => joinRoom(btn.dataset.join, false));
  box.querySelectorAll("[data-watch]").forEach(btn => btn.onclick = () => joinRoom(btn.dataset.watch, true));
}

function createRoom() {
  if (!App.user) return toast("ჯერ შედი");
  connectSocket();
  App.socket.emit("room:create", { user: App.user, name: $("roomName").value, settings: collectCreateSettings() }, res => {
    if (!res?.ok) return toast(res?.error || "ვერ შეიქმნა");
    App.currentRoom = res.room;
    App.currentRoomId = res.room.id;
    showScreen("game");
    renderGame();
  });
}

function joinRoom(roomId, spectator) {
  connectSocket();
  App.socket.emit("room:join", { roomId, spectator, user: App.user }, res => {
    if (!res?.ok) return toast(res?.error || "ვერ შევედი");
    App.currentRoom = res.room;
    App.currentRoomId = res.room.id;
    showScreen("game");
    renderGame();
    ensureMedia();
  });
}

function renderGame() {
  const room = App.currentRoom;
  if (!room) return;
  const waiting = room.phase === "waiting";
  $("phaseName").textContent = room.phaseLabel || room.phase;
  $("phaseInfo").textContent = waiting ? `ლობი · ${room.players.length}/${room.settings.maxPlayers}` : `დღე ${room.day} · ცოცხალი ${room.alive}`;
  $("timer").textContent = waiting ? "00:00" : fmt(room.timer);
  $("lobbyView").classList.toggle("hidden", !waiting);
  $("videoGrid").classList.toggle("hidden", waiting);
  renderLobby();
  renderChat(room);
  renderLog();
  if (!waiting) renderVideoGrid();
}

function me() {
  return App.currentRoom?.players?.find(p => String(p.userId) === String(App.user?.userId));
}

function isHost() {
  return String(App.currentRoom?.hostUserId) === String(App.user?.userId);
}

function renderLobby() {
  const room = App.currentRoom;
  if (!room) return;
  $("lobbyRoomName").textContent = room.name;
  $("lobbyRoomInfo").textContent = `მოლოდინი · ჰოსტი: ${room.hostName} · კოდი: ${room.id}`;
  $("lobbyPlayersCount").textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  ["lobbyStartBtn", "lobbyRolesBtn", "lobbySettingsBtn", "roomSettingsBtn"].forEach(id => $(id)?.classList.toggle("hidden", !isHost()));

  $("lobbyPlayers").innerHTML = room.players.map(p => {
    const mine = String(p.userId) === String(App.user?.userId);
    return `<div class="lobby-player ${mine ? "is-me" : ""}" data-socket-id="${escapeHtml(p.socketId || "")}">
      <div class="lobby-player-left">
        <div class="lobby-avatar">${escapeHtml(p.avatar)}</div>
        <div class="lobby-player-meta">
          <b>#${p.seat} · ${escapeHtml(p.nickname)} ${mine ? "(you)" : ""}</b>
          <span>ID ${p.userId}${p.seat === 1 ? " · HOST" : ""} · ${p.connected ? "online" : "offline"}</span>
          ${mine ? `<div class="lobby-player-actions"><button id="lobbyMicBtn">${p.micOn ? "MIC ON" : "MIC OFF"}</button><button id="lobbyCamBtn">${p.cameraOn ? "CAM ON" : "CAM OFF"}</button></div>` : ""}
        </div>
      </div>
      <span class="badge ${p.connected ? "live" : ""}">${p.connected ? "ON" : "OFF"}</span>
    </div>`;
  }).join("");

  if ($("lobbyMicBtn")) $("lobbyMicBtn").onclick = toggleMic;
  if ($("lobbyCamBtn")) $("lobbyCamBtn").onclick = toggleCam;
}

function renderVideoGrid() {
  const room = App.currentRoom;
  $("videoGrid").innerHTML = room.players.map(p => {
    const mine = String(p.userId) === String(App.user?.userId);
    return `<div class="tile ${mine ? "is-me" : ""}" data-socket-id="${escapeHtml(p.socketId || "")}">
      <div class="tile-avatar">${escapeHtml(p.avatar)}</div>
      <video id="vid_${p.id}" autoplay playsinline ${mine ? "muted" : ""}></video>
      <div class="tile-controls">${mine ? `<button id="micBtn">MIC</button><button id="camBtn">CAM</button>` : ""}</div>
      <div class="seat">#${p.seat}</div>
      <div class="tile-name">ID ${p.userId} · ${escapeHtml(p.nickname)}${p.role ? " · " + roleLabel(p.role) : ""}</div>
    </div>`;
  }).join("");
  attachLocalVideo();
  if ($("micBtn")) $("micBtn").onclick = toggleMic;
  if ($("camBtn")) $("camBtn").onclick = toggleCam;
}

function attachLocalVideo() {
  const p = me();
  if (!p || !App.localStream) return;
  const v = $(`vid_${p.id}`);
  if (v) {
    v.srcObject = App.localStream;
    v.muted = true;
    v.play().catch(() => {});
  }
}

async function toggleMic() {
  await ensureMedia();
  const track = App.localStream?.getAudioTracks()?.[0];
  if (!track) return;
  track.enabled = !track.enabled;
  App.socket.emit("media:state", { roomId: App.currentRoomId, micOn: track.enabled });
}

async function toggleCam() {
  await ensureMedia();
  const track = App.localStream?.getVideoTracks()?.[0];
  if (!track) return;
  track.enabled = !track.enabled;
  App.socket.emit("media:state", { roomId: App.currentRoomId, cameraOn: track.enabled });
}

function renderChat(room) {
  const html = (room.chat || []).slice(-80).map(m => `<div class="msg"><b>${m.seat ? "#" + m.seat + " · " : ""}${escapeHtml(m.nickname)}</b><br>${escapeHtml(m.message)}</div>`).join("");
  $("chatMessages").innerHTML = html;
  $("lobbyChatMessages").innerHTML = html;
}

function addChat(msg) {
  const html = `<div class="msg"><b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtml(msg.nickname)}</b><br>${escapeHtml(msg.message)}</div>`;
  $("chatMessages")?.insertAdjacentHTML("beforeend", html);
  $("lobbyChatMessages")?.insertAdjacentHTML("beforeend", html);
}

function activeChatInput() {
  if (document.activeElement === $("lobbyChatInput")) return $("lobbyChatInput");
  if (document.activeElement === $("chatInput")) return $("chatInput");
  return !$("lobbyView").classList.contains("hidden") ? $("lobbyChatInput") : $("chatInput");
}

function sendChat() {
  const input = activeChatInput();
  const message = input.value.trim();
  if (!message) return;
  if (!App.socket?.connected) return toast("სერვერთან კავშირი გაწყდა");

  input.disabled = true;
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    input.disabled = false;
    toast("ჩატი ვერ გაიგზავნა — სერვერმა პასუხი არ დააბრუნა");
  }, 5000);

  App.socket.emit("chat:send", { roomId: App.currentRoomId, message }, res => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    input.disabled = false;
    if (!res?.ok) return toast(res?.error || "მესიჯი ვერ გაიგზავნა");
    input.value = "";
  });
}

function renderLog() {
  $("logMessages").innerHTML = (App.currentRoom?.events || []).slice(-80).reverse().map(e => `<div class="event">${escapeHtml(e.text)}</div>`).join("");
}

function openSettings() {
  const room = App.currentRoom;
  if (!room) return;
  $("setNight").value = room.settings.timers.night || 45;
  $("setDay").value = room.settings.timers.dayCommon || 60;
  $("setNom").value = room.settings.timers.nomination || 45;
  $("setVote").value = room.settings.timers.vote || 35;
  document.querySelectorAll("[data-set-role]").forEach(input => input.value = room.settings.roles[input.dataset.setRole] || 0);
  $("settingsModal").classList.remove("hidden");
}

function saveSettings() {
  const roles = {};
  document.querySelectorAll("[data-set-role]").forEach(input => roles[input.dataset.setRole] = Number(input.value || 0));
  App.socket.emit("room:settings", { roomId: App.currentRoomId, settings: {
    roles,
    timers: {
      night: Number($("setNight").value || 45),
      dayCommon: Number($("setDay").value || 60),
      nomination: Number($("setNom").value || 45),
      vote: Number($("setVote").value || 35)
    }
  }}, res => {
    if (!res?.ok) return toast(res?.error || "ვერ შეინახა");
    $("settingsModal").classList.add("hidden");
  });
}

function startGame() {
  App.socket.emit("game:start", { roomId: App.currentRoomId }, res => {
    if (!res?.ok) toast(res?.error || "ვერ დაიწყო");
  });
}

function leaveGame() {
  App.currentRoom = null;
  App.currentRoomId = null;
  showScreen("app");
  loadRooms();
}

async function loadClans() {
  const data = await api("/api/clans");
  const clans = data.clans || [];
  $("sClans").textContent = clans.length;
  $("clansList").innerHTML = clans.length ? clans.map(c => `<div class="clan-card"><h2>${escapeHtml(c.name)}</h2><p>ლიდერი: ${escapeHtml(c.leaderName)} · წევრები: ${c.members?.length || 0} · ქულა: ${c.points || 0}</p></div>`).join("") : `<div class="clan-card">კლანები ჯერ არ არის.</div>`;
}

async function createClan() {
  const name = $("clanName").value.trim();
  if (!name) return toast("კლანის სახელი ჩაწერე");
  const data = await api("/api/clans", { method: "POST", body: JSON.stringify({ name, user: App.user }) });
  if (!data.ok) return toast(data.error || "ვერ შეიქმნა");
  $("clanName").value = "";
  toast("კლანი შეიქმნა");
  loadClans();
  refreshProfile();
}

async function loadStats() {
  loadClans();
  const data = await api("/api/leaderboard");
  const users = data.users || [];
  $("leaderboard").innerHTML = users.length ? users.map(u => `<div class="leader-row"><b>ID ${u.userId} · ${escapeHtml(u.nickname)}</b><br>XP ${u.stats?.xp || 0} · Wins ${u.stats?.wins || 0}</div>`).join("") : "ჯერ მონაცემები არ არის.";
}

function createPeer(to, initiator) {
  if (!to || to === App.socket.id) return;
  if (App.peers.has(to)) return App.peers.get(to);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  App.peers.set(to, pc);
  if (App.localStream) App.localStream.getTracks().forEach(t => pc.addTrack(t, App.localStream));
  pc.onicecandidate = e => e.candidate && App.socket.emit("signal:ice", { to, candidate: e.candidate });
  pc.ontrack = e => {
    let audio = $(`aud_${to}`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `aud_${to}`;
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = e.streams[0];
    audio.play().catch(() => {});
  };
  if (initiator) {
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .then(() => App.socket.emit("signal:offer", { to, signal: pc.localDescription }))
      .catch(console.error);
  }
  return pc;
}

async function connectPeers() {
  if (!App.currentRoom || !App.localStream) return;
  for (const p of App.currentRoom.players || []) {
    if (p.socketId && p.socketId !== App.socket.id) createPeer(p.socketId, true);
  }
}

async function handleOffer({ from, signal }) {
  await ensureMedia();
  const pc = createPeer(from, false);
  await pc.setRemoteDescription(new RTCSessionDescription(signal));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  App.socket.emit("signal:answer", { to: from, signal: pc.localDescription });
}

async function handleAnswer({ from, signal }) {
  const pc = App.peers.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal));
}

async function handleIce({ from, candidate }) {
  const pc = App.peers.get(from);
  if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
}

function bind() {
  ["Quick", "Login", "Register"].forEach(tab => {
    $(`tab${tab}`).onclick = () => {
      ["Quick", "Login", "Register"].forEach(t => {
        $(`tab${t}`).classList.toggle("active", t === tab);
        $(`${t.toLowerCase()}Form`)?.classList.toggle("hidden", t !== tab);
      });
    };
  });

  $("avatarPicker").innerHTML = ["◆", "♛", "♞", "●", "✦", "☾", "🔥", "👑", "🧠", "🐺", "🦊", "🕶"].map((a, i) => `<button class="avatar-choice ${i === 0 ? "active" : ""}">${a}</button>`).join("");
  document.querySelectorAll(".avatar-choice").forEach(b => b.onclick = () => {
    document.querySelectorAll(".avatar-choice").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
  });

  $("quickLogin").onclick = authGuest;
  $("loginBtn").onclick = login;
  $("registerBtn").onclick = register;
  $("refreshBtn").onclick = loadRooms;
  $("createRoom").onclick = createRoom;
  $("createClan").onclick = createClan;
  $("saveNickname").onclick = saveNickname;
  $("logoutBtn").onclick = () => { localStorage.removeItem("void_v13_user"); location.reload(); };

  document.querySelectorAll(".bottom-nav button").forEach(b => b.onclick = () => showPage(b.dataset.page));
  $("lobbySendChat").onclick = sendChat;
  $("sendChat").onclick = sendChat;
  $("chatInput").onkeydown = e => { if (e.key === "Enter") sendChat(); };
  $("lobbyChatInput").onkeydown = e => { if (e.key === "Enter") sendChat(); };
  $("chatBtn").onclick = () => $("chatPanel").classList.remove("hidden");
  $("logBtn").onclick = () => $("logPanel").classList.remove("hidden");
  $("leaveGame").onclick = leaveGame;
  $("roomSettingsBtn").onclick = openSettings;
  $("lobbySettingsBtn").onclick = openSettings;
  $("lobbyRolesBtn").onclick = openSettings;
  $("saveSettings").onclick = saveSettings;
  $("startGame").onclick = startGame;
  $("lobbyStartBtn").onclick = startGame;
  $("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
  $("closeAction").onclick = () => $("actionModal").classList.add("hidden");
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));
}

async function init() {
  bind();
  await loadRoles();
  const saved = loadSavedUser();
  if (saved?.userId) {
    App.user = saved;
    connectSocket();
    await refreshProfile();
    showScreen("app");
    loadRooms();
  } else {
    showScreen("auth");
  }
}

init();
