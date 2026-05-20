const $ = id => document.getElementById(id);

const App = {
  user: null,
  socket: null,
  room: null,
  localStream: null,
  peers: {},
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  roles: []
};

function toast(text) {
  const box = $("toast");

  if (!box) {
    alert(text);
    return;
  }

  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = text;

  box.appendChild(div);

  setTimeout(() => div.remove(), 2600);
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

function show(id) {
  $(id)?.classList.remove("hidden");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  return res.json();
}

function emit(name, payload, timeout = 7000) {
  return new Promise(resolve => {
    if (!App.socket || !App.socket.connected) {
      resolve({ ok: false, error: "Socket disconnected" });
      return;
    }

    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: "Timeout" });
      }
    }, timeout);

    App.socket.emit(name, payload, response => {
      if (done) return;

      done = true;
      clearTimeout(timer);
      resolve(response || { ok: true });
    });
  });
}

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindUi();

  try {
    const webRtc = await api("/api/webrtc");
    if (webRtc.ok && Array.isArray(webRtc.iceServers)) {
      App.iceServers = webRtc.iceServers;
    }
  } catch (_) {}

  try {
    const rolesRes = await api("/api/roles");
    if (rolesRes.ok) {
      App.roles = rolesRes.roles || [];
      renderRoleSettings(rolesRes.defaultSettings?.roles || {});
    }
  } catch (_) {}

  try {
    const me = await api("/api/auth/me");
    if (me.user) enterApp(me.user);
  } catch (_) {}
}

function bindUi() {
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach(x => x.classList.remove("active"));
      button.classList.add("active");

      ["guestForm", "loginForm", "registerForm"].forEach(hide);
      show(button.dataset.tab + "Form");
    };
  });

  $("guestBtn") && ($("guestBtn").onclick = async () => {
    const res = await api("/api/auth/guest", {
      method: "POST",
      body: {
        nickname: $("guestNick")?.value,
        avatar: $("guestAvatar")?.value
      }
    });

    res.ok ? enterApp(res.user) : toast(res.error || "Login failed");
  });

  $("registerBtn") && ($("registerBtn").onclick = async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: {
        nickname: $("regNick")?.value,
        email: $("regEmail")?.value,
        password: $("regPass")?.value
      }
    });

    res.ok ? enterApp(res.user) : toast(res.error || "Register failed");
  });

  $("loginBtn") && ($("loginBtn").onclick = async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: $("loginEmail")?.value,
        password: $("loginPass")?.value
      }
    });

    res.ok ? enterApp(res.user) : toast(res.error || "Login failed");
  });

  $("refreshBtn") && ($("refreshBtn").onclick = loadAll);
  $("hostGameBtn") && ($("hostGameBtn").onclick = () => $("roomCreate")?.classList.toggle("hidden"));
  $("createRoomBtn") && ($("createRoomBtn").onclick = createRoom);

  $("joinByCodeBtn") && ($("joinByCodeBtn").onclick = () => {
    const code = prompt("Room number");
    if (code) joinRoom(code);
  });

  $("createClanBtn") && ($("createClanBtn").onclick = createClan);
  $("saveProfileBtn") && ($("saveProfileBtn").onclick = saveProfile);

  $("leaveBtn") && ($("leaveBtn").onclick = leaveRoom);

  $("chatTopBtn") && ($("chatTopBtn").onclick = openChat);
  $("roomTopBtn") && ($("roomTopBtn").onclick = openSettings);
  $("settingsBtn") && ($("settingsBtn").onclick = openSettings);

  $("startBtn") && ($("startBtn").onclick = startGame);
  $("nextPhaseBtn") && ($("nextPhaseBtn").onclick = nextPhase);
  $("saveSettingsBtn") && ($("saveSettingsBtn").onclick = saveSettings);

  $("sendChatBtn") && ($("sendChatBtn").onclick = () => sendChat("room"));
  $("sendMafiaBtn") && ($("sendMafiaBtn").onclick = () => sendChat("mafia"));

  $("chatInput") && ($("chatInput").onkeydown = e => {
    if (e.key === "Enter") sendChat("room");
  });

  $("mafiaInput") && ($("mafiaInput").onkeydown = e => {
    if (e.key === "Enter") sendChat("mafia");
  });

  $("menuBtn") && ($("menuBtn").onclick = openMainMenu);

  document.querySelectorAll("[data-page]").forEach(button => {
    button.onclick = () => showPage(button.dataset.page);
  });

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => hide(button.dataset.close);
  });
}

function enterApp(user) {
  App.user = user;

  hide("auth");
  show("app");

  connectSocket();
  renderMe();
  loadAll();
}

function renderMe() {
  if (!App.user) return;

  const stats = App.user.stats || {};
  const xp = Number(stats.xp || 0);
  const level = Math.max(1, Math.floor(xp / 100) + 1);

  if ($("userLine")) $("userLine").textContent = `ID ${App.user.userId} · ${App.user.nickname}`;
  if ($("profileName")) $("profileName").textContent = App.user.nickname;
  if ($("profileId")) $("profileId").textContent = `ID ${App.user.userId} · Level ${level}`;
  if ($("profileAvatar")) $("profileAvatar").textContent = App.user.avatar || "◆";

  if ($("statXp")) $("statXp").textContent = xp;
  if ($("statRating")) $("statRating").textContent = Number(stats.rating || 5).toFixed(1);
  if ($("statWins")) $("statWins").textContent = Number(stats.wins || 0);
  if ($("statGames")) $("statGames").textContent = Number(stats.games || stats.gamesPlayed || 0);

  if ($("editNick")) $("editNick").value = App.user.nickname || "";
  if ($("editAvatar")) $("editAvatar").value = App.user.avatar || "◆";
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));

  const page = $("page" + name);
  if (page) page.classList.add("active");

  if ($("pageTitle")) {
    $("pageTitle").textContent = name === "Leaderboard" ? "Rank" : name;
  }

  document.querySelectorAll(".bottom button, .bottom-nav button").forEach(button => {
    button.classList.remove("active");

    const text = button.textContent.trim().toLowerCase();

    if (
      (name === "Rooms" && text === "games") ||
      (name === "Clans" && text === "clans") ||
      (name === "Leaderboard" && text === "rank") ||
      (name === "Store" && text === "store") ||
      (name === "Profile" && text === "profile")
    ) {
      button.classList.add("active");
    }
  });

  if (name === "Rooms") loadRooms();
  if (name === "Clans") loadClans();
  if (name === "Leaderboard") loadLeaderboard();
  if (name === "Store") loadStore();
  if (name === "Profile") renderMe();
}

function connectSocket() {
  App.socket = io();

  App.socket.on("connect", () => {
    App.socket.emit("auth", { userId: App.user.userId }, () => {});
  });

  App.socket.on("rooms:list", renderRooms);

  App.socket.on("room:state", room => {
    App.room = room;
    renderRoom();
  });

  App.socket.on("room:closed", payload => {
    toast(payload.reason || "Room closed");
    leaveRoom(false);
  });

  App.socket.on("chat:message", msg => {
    if (msg.channel === "mafia") {
      addMsg("mafiaMessages", msg);
    } else {
      addMsg("chatMessages", msg);
    }
  });

  App.socket.on("signal:offer", onOffer);
  App.socket.on("signal:answer", onAnswer);
  App.socket.on("signal:ice", onIce);
}

async function loadAll() {
  await loadRooms();
  await loadLeaderboard();
  await loadClans();
  await loadStore();
}

async function loadRooms() {
  const res = await api("/api/rooms");
  if (res.ok) renderRooms(res.rooms || []);
}

function renderRooms(rooms) {
  if ($("roomsCount")) $("roomsCount").textContent = rooms.length;

  if (!$("roomsList")) return;

  $("roomsList").innerHTML = rooms.map(room => `
    <div class="room">
      <div class="pic">🎭</div>

      <div class="grow">
        <h3>${esc(room.name)}</h3>
        <p>Host: ${esc(room.hostName)} · ${room.players}/${room.maxPlayers}</p>
        <span class="badge">${esc(room.phase)}</span>
      </div>

      <button onclick="joinRoom('${esc(room.id)}')">JOIN</button>
    </div>
  `).join("") || `<div class="card">No rooms</div>`;
}

async function createRoom() {
  const settings = collectSettings();

  settings.maxPlayers = Number($("maxPlayers")?.value || $("setMaxPlayers")?.value || 10);
  settings.language = $("roomLanguage")?.value || "Georgian";

  const res = await emit("room:create", {
    name: $("roomName")?.value || "VOID TABLE",
    settings
  });

  if (!res.ok) {
    toast(res.error || "Room create failed");
    return;
  }

  enterRoom(res.room);
}

async function joinRoom(id) {
  const res = await emit("room:join", { roomId: id });

  if (!res.ok) {
    toast(res.error || "Join failed");
    return;
  }

  enterRoom(res.room);
}

function enterRoom(room) {
  App.room = room;

  hide("app");
  show("game");

  renderRoom();

  ensureMedia().then(() => {
    connectToPeers();
  });
}

async function leaveRoom(sendSignal = true) {
  if (sendSignal && App.room?.id && App.socket?.connected) {
    await emit("room:leave", { roomId: App.room.id }, 3000);
  }

  Object.values(App.peers).forEach(pc => pc.close());
  App.peers = {};

  App.room = null;

  hide("game");
  show("app");

  loadRooms();
}

function renderRoom() {
  const room = App.room;
  if (!room) return;

  const waiting = room.phase === "waiting";

  if ($("phaseName")) $("phaseName").textContent = waiting ? "Lobby" : room.phase;
  if ($("phaseInfo")) {
    $("phaseInfo").textContent = waiting
      ? `${room.players.length}/${room.settings.maxPlayers}`
      : `Day ${room.day || 0}`;
  }

  if ($("timer")) $("timer").textContent = fmt(room.timer || 0);

  if ($("gameRoomName")) $("gameRoomName").textContent = room.name || "VOID TABLE";
  if ($("gameRoomInfo")) {
    $("gameRoomInfo").textContent = `${room.phase} · Host: ${room.hostName} · Code: ${room.id}`;
  }

  if ($("playersCount")) {
    $("playersCount").textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  }

  $("lobbyView")?.classList.toggle("hidden", !waiting);
  $("videoGrid")?.classList.toggle("hidden", waiting);

  ["settingsBtn", "startBtn", "nextPhaseBtn", "roomTopBtn"].forEach(id => {
    if ($(id)) $(id).style.display = room.viewer?.isHost ? "inline-block" : "none";
  });

  if ($("playersList")) {
    $("playersList").innerHTML = room.players.map(playerRow).join("");
  }

  if ($("chatMessages")) {
    $("chatMessages").innerHTML = (room.chat || [])
      .filter(m => m.channel !== "mafia")
      .slice(-80)
      .map(msgHtml)
      .join("");
  }

  const mafiaAllowed =
    ["mafia", "don"].includes(room.viewer?.role) &&
    room.phase === "night";

  $("mafiaChatBox")?.classList.toggle("hidden", !mafiaAllowed);

  if (!waiting) {
    renderVideos();
  }

  connectToPeers();
}

function playerRow(player) {
  const me = Number(player.userId) === Number(App.user.userId);

  return `
    <div class="player" onclick="openPlayer(${player.userId})">
      <div class="pic">${esc(player.avatar || "◆")}</div>

      <div class="grow">
        <b>#${player.seat} · ${esc(player.nickname)} ${me ? "(you)" : ""}</b>
        <p>ID ${player.userId}</p>

        ${me ? `
          <button onclick="event.stopPropagation(); toggleMic()">
            ${player.micOn === false ? "MIC OFF" : "MIC"}
          </button>

          <button onclick="event.stopPropagation(); toggleCam()">
            ${player.cameraOn === false ? "CAM OFF" : "CAM"}
          </button>
        ` : ""}
      </div>

      <span class="badge ${player.speaking ? "speaking" : ""}">
        ${player.speaking ? "SPEAKING" : player.connected ? "ON" : "OFF"}
      </span>
    </div>
  `;
}

function renderVideos() {
  const room = App.room;
  if (!room || !$("videoGrid")) return;

  $("videoGrid").innerHTML = room.players.map(player => `
    <div class="tile ${player.speaking ? "speaking" : ""}">
      <video
        id="vid_${player.socketId || player.id}"
        autoplay
        playsinline
        ${Number(player.userId) === Number(App.user.userId) ? "muted" : ""}
      ></video>

      <div class="seat">#${player.seat}</div>
      <div class="name">ID ${player.userId} · ${esc(player.nickname)}</div>
    </div>
  `).join("");

  const me = room.players.find(p => Number(p.userId) === Number(App.user.userId));

  if (me && App.localStream) {
    const video = $("vid_" + (me.socketId || me.id));

    if (video) {
      video.srcObject = App.localStream;
      video.muted = true;
      video.play?.().catch(() => {});
    }
  }
}

function renderRoleSettings(defaultRoles = {}) {
  if (!$("roleSettings")) return;

  $("roleSettings").innerHTML = `
    <label>
      Mafia
      <input id="role_mafia" type="number" min="1" value="${defaultRoles.mafia ?? 1}">
    </label>

    <label>
      Doctor
      <input id="role_doctor" type="number" value="1" disabled>
    </label>

    <label>
      Sheriff
      <input id="role_sheriff" type="number" value="1" disabled>
    </label>

    <label>
      Don
      <input id="role_don" type="number" min="0" value="${defaultRoles.don ?? 0}">
    </label>

    <label>
      Detective
      <input id="role_detective" type="number" min="0" value="${defaultRoles.detective ?? 0}">
    </label>

    <label>
      Bodyguard
      <input id="role_bodyguard" type="number" min="0" value="${defaultRoles.bodyguard ?? 0}">
    </label>

    <div class="role-note">
      Citizen ავტომატურად დაემატება ყველა დარჩენილ მოთამაშეს.
    </div>
  `;
}

function collectSettings() {
  return {
    maxPlayers: Number($("setMaxPlayers")?.value || $("maxPlayers")?.value || 10),
    language: $("roomLanguage")?.value || "Georgian",
    timers: {
      night: Number($("setNight")?.value || 45),
      day: Number($("setDay")?.value || 90),
      vote: Number($("setVote")?.value || 35),
      nomination: Number($("setNomination")?.value || 45),
      roleReveal: Number($("setRoleReveal")?.value || 15)
    },
    roles: {
      mafia: Number($("role_mafia")?.value || 1),
      don: Number($("role_don")?.value || 0),
      doctor: 1,
      sheriff: 1,
      detective: Number($("role_detective")?.value || 0),
      bodyguard: Number($("role_bodyguard")?.value || 0),
      citizen: 0
    }
  };
}

async function saveSettings() {
  if (!App.room) return;

  const res = await emit("room:settings", {
    roomId: App.room.id,
    settings: collectSettings()
  });

  if (res.ok) {
    toast("Saved");
    hide("settingsModal");
  } else {
    toast(res.error || "Save failed");
  }
}

async function startGame() {
  if (!App.room) return;

  const res = await emit("game:start", {
    roomId: App.room.id
  });

  if (!res.ok) toast(res.error || "Start failed");
}

async function nextPhase() {
  if (!App.room) return;

  const res = await emit("game:next", {
    roomId: App.room.id
  });

  if (!res.ok) toast(res.error || "Next phase failed");
}

function openChat() {
  show("chatPanel");

  if ($("chatInput")) {
    setTimeout(() => $("chatInput").focus(), 100);
  }
}

function openSettings() {
  show("settingsModal");
}

async function sendChat(channel = "room") {
  if (!App.socket || !App.socket.connected) {
    toast("სერვერთან კავშირი არ არის");
    return;
  }

  if (!App.room?.id) {
    toast("ოთახი არ არის არჩეული");
    return;
  }

  const input = channel === "mafia" ? $("mafiaInput") : $("chatInput");

  if (!input) {
    toast("ჩათის ველი ვერ მოიძებნა");
    return;
  }

  const message = input.value.trim();
  if (!message) return;

  input.disabled = true;

  const res = await emit("chat:send", {
    roomId: App.room.id,
    message,
    channel
  });

  input.disabled = false;

  if (!res.ok) {
    toast(res.error || "მესიჯი ვერ გაიგზავნა");
    return;
  }

  input.value = "";
}

function msgHtml(msg) {
  return `
    <div class="msg">
      <b>${msg.seat ? "#" + msg.seat + " · " : ""}${esc(msg.nickname)}</b><br>
      ${esc(msg.message)}
    </div>
  `;
}

function addMsg(id, msg) {
  const box = $(id);
  if (!box) return;

  box.insertAdjacentHTML("beforeend", msgHtml(msg));
  box.scrollTop = box.scrollHeight;
}

async function loadLeaderboard() {
  const res = await api("/api/leaderboard");

  if (!res.ok || !$("leaderboard")) return;

  $("leaderboard").innerHTML = (res.users || []).map((user, index) => {
    const stats = user.stats || {};
    const xp = Number(stats.xp || 0);
    const level = Math.max(1, Math.floor(xp / 100) + 1);

    return `
      <div class="item" onclick="openPlayer(${user.userId})">
        <div class="pic">${esc(user.avatar || "◆")}</div>

        <div class="grow">
          <b>#${index + 1} ${esc(user.nickname || "Player")}</b>
          <p>ID ${user.userId} · Level ${level}</p>
        </div>

        <b>⭐ ${xp}</b>
      </div>
    `;
  }).join("");
}

async function loadClans() {
  const res = await api("/api/clans");

  if (!res.ok || !$("clansList")) return;

  $("clansList").innerHTML = (res.clans || []).map((clan, index) => `
    <div class="item">
      <div class="pic">${esc(clan.emblem || "◆")}</div>

      <div class="grow">
        <b>#${index + 1} ${esc(clan.name || "Clan")} ${esc(clan.tag || "")}</b>
        <p>Level ${clan.level || 1} · Members ${clan.members?.length || 0}</p>
      </div>

      <button onclick="joinClan('${esc(clan.clanId || clan.id)}')">JOIN</button>
    </div>
  `).join("") || `<div class="card">No clans</div>`;
}

async function createClan() {
  const res = await api("/api/clans", {
    method: "POST",
    body: {
      name: $("clanName")?.value,
      tag: $("clanTag")?.value,
      user: App.user
    }
  });

  toast(res.ok ? "Clan created" : res.error || "Clan failed");
  loadClans();
}

async function joinClan(id) {
  const res = await api(`/api/clans/${id}/join`, {
    method: "POST",
    body: {
      user: App.user
    }
  });

  toast(res.ok ? "Joined" : res.error || "Join failed");
  loadClans();
}

async function loadStore() {
  const res = await api("/api/store");

  if (!res.ok || !$("storeList")) return;

  $("storeList").innerHTML = (res.items || []).map(item => `
    <div class="item">
      <div class="pic">💠</div>

      <div class="grow">
        <b>${esc(item.title)}</b>
        <p>${esc(item.description)}</p>
      </div>

      <button>${item.price ? item.price + " coins" : "Owned"}</button>
    </div>
  `).join("");
}

async function saveProfile() {
  const res = await api("/api/auth/me", {
    method: "PUT",
    body: {
      userId: App.user.userId,
      nickname: $("editNick")?.value,
      avatar: $("editAvatar")?.value
    }
  });

  if (!res.ok) {
    toast(res.error || "Profile save failed");
    return;
  }

  App.user = res.user;
  renderMe();
  toast("Saved");
}

async function openPlayer(id) {
  const res = await api("/api/users/" + id);

  if (!res.ok) {
    toast(res.error || "User not found");
    return;
  }

  const user = res.user;
  const stats = user.stats || {};
  const xp = Number(stats.xp || 0);
  const level = Math.max(1, Math.floor(xp / 100) + 1);

  if (!$("playerProfile")) return;

  $("playerProfile").innerHTML = `
    <div class="profile">
      <div class="avatar">${esc(user.avatar || "◆")}</div>

      <h2>${esc(user.nickname || "Player")}</h2>
      <p>ID ${user.userId} · Level ${level}</p>

      <div class="grid2 stats">
        <div><b>${Number(stats.games || stats.gamesPlayed || 0)}</b><span>Games</span></div>
        <div><b>${Number(stats.wins || 0)}</b><span>Wins</span></div>
        <div><b>${Number(stats.losses || 0)}</b><span>Losses</span></div>
        <div><b>${Number(stats.rating || 5).toFixed(1)}</b><span>Rating</span></div>
        <div><b>${Number(stats.mafiaGames || 0)}</b><span>As Mafia</span></div>
        <div><b>${Number(stats.citizenGames || 0)}</b><span>As Citizen</span></div>
        <div><b>${xp}</b><span>XP</span></div>
        <div><b>${level}</b><span>Level</span></div>
      </div>
    </div>
  `;

  show("playerModal");
}

async function ensureMedia() {
  if (App.localStream) return App.localStream;

  try {
    App.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    setupVoiceActivity();
  } catch (err) {
    console.error("ensureMedia failed:", err);
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }

  return App.localStream;
}

async function toggleMic() {
  await ensureMedia();

  const track = App.localStream?.getAudioTracks?.()[0];
  if (!track) return;

  track.enabled = !track.enabled;

  App.socket?.emit("media:state", {
    roomId: App.room?.id,
    micOn: track.enabled
  });
}

async function toggleCam() {
  await ensureMedia();

  const track = App.localStream?.getVideoTracks?.()[0];
  if (!track) return;

  track.enabled = !track.enabled;

  App.socket?.emit("media:state", {
    roomId: App.room?.id,
    cameraOn: track.enabled
  });
}

function setupVoiceActivity() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(App.localStream);
    const analyser = context.createAnalyser();

    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;

    setInterval(() => {
      if (!App.room?.id) return;

      analyser.getByteFrequencyData(data);

      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const speaking = avg > 12;

      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;

        App.socket?.emit("media:state", {
          roomId: App.room.id,
          speaking
        });
      }
    }, 350);
  } catch (err) {
    console.warn("Voice activity failed:", err);
  }
}

async function connectToPeers() {
  if (!App.room || !App.localStream || !App.socket) return;

  const me = App.room.players.find(p => Number(p.userId) === Number(App.user.userId));
  if (!me) return;

  for (const player of App.room.players) {
    if (!player.socketId) continue;
    if (player.socketId === me.socketId) continue;
    if (App.peers[player.socketId]) continue;

    const peer = createPeer(player.socketId);

    try {
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await peer.setLocalDescription(offer);

      App.socket.emit("signal:offer", {
        to: player.socketId,
        signal: offer
      });
    } catch (err) {
      console.warn("Offer failed:", err);
    }
  }
}

function createPeer(socketId) {
  const peer = new RTCPeerConnection({
    iceServers: App.iceServers
  });

  App.peers[socketId] = peer;

  App.localStream?.getTracks().forEach(track => {
    peer.addTrack(track, App.localStream);
  });

  peer.onicecandidate = event => {
    if (event.candidate) {
      App.socket.emit("signal:ice", {
        to: socketId,
        candidate: event.candidate
      });
    }
  };

  peer.ontrack = event => {
    let video = $("vid_" + socketId);

    if (!video) {
      return;
    }

    video.srcObject = event.streams[0];
    video.muted = false;
    video.volume = 1;
    video.play?.().catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
      peer.close();
      delete App.peers[socketId];
    }
  };

  return peer;
}

async function onOffer({ from, signal }) {
  await ensureMedia();

  const peer = App.peers[from] || createPeer(from);

  try {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    App.socket.emit("signal:answer", {
      to: from,
      signal: answer
    });
  } catch (err) {
    console.warn("Answer failed:", err);
  }
}

async function onAnswer({ from, signal }) {
  const peer = App.peers[from];
  if (!peer) return;

  try {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  } catch (err) {
    console.warn("Set answer failed:", err);
  }
}

async function onIce({ from, candidate }) {
  const peer = App.peers[from];
  if (!peer || !candidate) return;

  try {
    await peer.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("ICE failed:", err);
  }
}

function openMainMenu() {
  let drawer = $("mainDrawer");

  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "mainDrawer";
    drawer.className = "drawer";

    drawer.innerHTML = `
      <div class="drawer-card">
        <button class="drawer-close" onclick="closeMainMenu()">×</button>

        <div class="avatar drawer-avatar">${esc(App.user?.avatar || "◆")}</div>

        <h2>${esc(App.user?.nickname || "Player")}</h2>
        <p>ID ${App.user?.userId || "-"} </p>

        <button onclick="closeMainMenu(); showPage('Rooms')">Games</button>
        <button onclick="closeMainMenu(); showPage('Clans')">Clans</button>
        <button onclick="closeMainMenu(); showPage('Leaderboard')">Rank</button>
        <button onclick="closeMainMenu(); showPage('Store')">Store</button>
        <button onclick="closeMainMenu(); showPage('Profile')">Profile</button>

        <hr>

        <button onclick="copyMyId()">Copy my ID</button>
        <button onclick="location.reload()">Reload App</button>
      </div>
    `;

    document.body.appendChild(drawer);
  }

  drawer.classList.add("open");
}

function closeMainMenu() {
  $("mainDrawer")?.classList.remove("open");
}

function copyMyId() {
  const id = String(App.user?.userId || "");

  if (navigator.clipboard) {
    navigator.clipboard.writeText(id);
    toast("ID copied");
  } else {
    toast("Your ID: " + id);
  }
}

function fmt(seconds) {
  const s = Number(seconds || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;

  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

window.joinRoom = joinRoom;
window.openPlayer = openPlayer;
window.joinClan = joinClan;
window.showPage = showPage;
window.closeMainMenu = closeMainMenu;
window.copyMyId = copyMyId;