/* public/js/app.js
   VOID MAFIA v16.2 UI FIX
   Fixes:
   - left menu button opens drawer
   - right refresh button works
   - bottom nav is higher / safer on mobile
   - settings modal safer defaults: Doctor=1, Sheriff=1, Citizen auto
   - store copied items removed from API if frontend still receives them
   - host leaving terminates room from client side request
   - chat send freeze protection
*/

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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

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

  setTimeout(() => div.remove(), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
      if (done) return;
      done = true;
      resolve({ ok: false, error: "Timeout" });
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
  bindBaseUi();

  try {
    const webRtc = await api("/api/webrtc");
    if (webRtc.ok && Array.isArray(webRtc.iceServers)) {
      App.iceServers = webRtc.iceServers;
    }
  } catch (_) {}

  try {
    const roles = await api("/api/roles");
    if (roles.ok) {
      App.roles = roles.roles || [];
      renderRoleSettings(roles.defaultSettings?.roles || {});
    }
  } catch (_) {}

  try {
    const me = await api("/api/auth/me");
    if (me.user) {
      enterApp(me.user);
    }
  } catch (_) {}
}

function bindBaseUi() {
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach(x => x.classList.remove("active"));
      button.classList.add("active");

      ["guestForm", "loginForm", "registerForm"].forEach(hide);
      show(button.dataset.tab + "Form");
    };
  });

  $("guestBtn")?.addEventListener("click", async () => {
    const r = await api("/api/auth/guest", {
      method: "POST",
      body: {
        nickname: $("guestNick")?.value,
        avatar: $("guestAvatar")?.value
      }
    });

    r.ok ? enterApp(r.user) : toast(r.error || "Guest login failed");
  });

  $("registerBtn")?.addEventListener("click", async () => {
    const r = await api("/api/auth/register", {
      method: "POST",
      body: {
        nickname: $("regNick")?.value,
        email: $("regEmail")?.value,
        password: $("regPass")?.value
      }
    });

    r.ok ? enterApp(r.user) : toast(r.error || "Registration failed");
  });

  $("loginBtn")?.addEventListener("click", async () => {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: $("loginEmail")?.value,
        password: $("loginPass")?.value
      }
    });

    r.ok ? enterApp(r.user) : toast(r.error || "Login failed");
  });

  $("menuBtn")?.addEventListener("click", openMainMenu);
  $("refreshBtn")?.addEventListener("click", hardRefreshCurrentPage);

  $("hostGameBtn")?.addEventListener("click", () => {
    $("roomCreate")?.classList.toggle("hidden");
  });

  $("joinByCodeBtn")?.addEventListener("click", () => {
    const code = prompt("Room number");
    if (code) joinRoom(code.trim());
  });

  $("createRoomBtn")?.addEventListener("click", createRoom);
  $("createClanBtn")?.addEventListener("click", createClan);
  $("saveProfileBtn")?.addEventListener("click", saveProfile);

  $("leaveBtn")?.addEventListener("click", leaveRoom);
  $("chatTopBtn")?.addEventListener("click", openChatPanel);
  $("roomTopBtn")?.addEventListener("click", openSettingsModal);
  $("settingsBtn")?.addEventListener("click", openSettingsModal);
  $("startBtn")?.addEventListener("click", startGame);
  $("nextPhaseBtn")?.addEventListener("click", nextPhase);
  $("saveSettingsBtn")?.addEventListener("click", saveSettings);

  $("sendChatBtn")?.addEventListener("click", () => sendChat("room"));
  $("sendMafiaBtn")?.addEventListener("click", () => sendChat("mafia"));

  $("chatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat("room");
  });

  $("mafiaInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat("mafia");
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => hide(button.dataset.close));
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

  const stats = normalizeStats(App.user);
  const level = getUserLevel(App.user);

  if ($("userLine")) $("userLine").textContent = `ID ${App.user.userId} · ${App.user.nickname}`;
  if ($("profileName")) $("profileName").textContent = App.user.nickname;
  if ($("profileId")) $("profileId").textContent = `ID ${App.user.userId} · Level ${level}`;
  if ($("profileAvatar")) $("profileAvatar").textContent = App.user.avatar || "◆";

  if ($("statXp")) $("statXp").textContent = stats.xp;
  if ($("statRating")) $("statRating").textContent = stats.rating.toFixed(1);
  if ($("statWins")) $("statWins").textContent = stats.wins;
  if ($("statGames")) $("statGames").textContent = stats.games;

  if ($("editNick")) $("editNick").value = App.user.nickname || "";
  if ($("editAvatar")) $("editAvatar").value = App.user.avatar || "◆";
}

function normalizeStats(user) {
  const s = user?.stats || {};
  return {
    xp: Number(s.xp || 0),
    rating: Number(s.rating || 5),
    wins: Number(s.wins || 0),
    losses: Number(s.losses || 0),
    games: Number(s.games || s.gamesPlayed || 0),
    mafiaGames: Number(s.mafiaGames || 0),
    citizenGames: Number(s.citizenGames || 0)
  };
}

function getUserLevel(user) {
  const xp = Number(user?.stats?.xp || 0);
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const page = $("page" + name);
  if (page) page.classList.add("active");

  if ($("pageTitle")) $("pageTitle").textContent = name === "Leaderboard" ? "Rank" : name;

  document.querySelectorAll(".bottom button, .bottom-nav button").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.page === name) btn.classList.add("active");
  });

  if (name === "Rooms") loadRooms();
  if (name === "Clans") loadClans();
  if (name === "Leaderboard") loadLeaderboard();
  if (name === "Store") loadStore();
  if (name === "Profile") renderMe();
}

async function hardRefreshCurrentPage() {
  toast("Refreshing...");
  await loadAll();

  const activePage = document.querySelector(".page.active")?.id?.replace("page", "") || "Rooms";
  showPage(activePage);

  if (App.room) {
    const r = await api(`/api/rooms/${App.room.id}?userId=${App.user.userId}`);
    if (r.ok) {
      App.room = r.room;
      renderRoom();
    }
  }
}

function openMainMenu() {
  let drawer = $("mainDrawer");

  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "mainDrawer";
    drawer.className = "main-drawer hidden";

    drawer.innerHTML = `
      <div class="main-drawer-bg" onclick="closeMainMenu()"></div>
      <div class="main-drawer-card">
        <button class="drawer-close" onclick="closeMainMenu()">×</button>

        <div class="avatar drawer-avatar">${esc(App.user?.avatar || "◆")}</div>
        <h2>${esc(App.user?.nickname || "Player")}</h2>
        <p>ID ${App.user?.userId || "-"} · Level ${getUserLevel(App.user)}</p>

        <button onclick="closeMainMenu(); showPage('Rooms')">Games</button>
        <button onclick="closeMainMenu(); showPage('Clans')">Clans</button>
        <button onclick="closeMainMenu(); showPage('Leaderboard')">Rank</button>
        <button onclick="closeMainMenu(); showPage('Store')">Store</button>
        <button onclick="closeMainMenu(); showPage('Profile')">Profile</button>

        <hr>

        <button onclick="copyMyId()">Copy my ID</button>
        <button onclick="hardRefreshCurrentPage()">Refresh data</button>
        <button onclick="location.reload()">Reload app</button>
      </div>
    `;

    document.body.appendChild(drawer);
  }

  drawer.classList.remove("hidden");
  requestAnimationFrame(() => drawer.classList.add("open"));
}

function closeMainMenu() {
  const drawer = $("mainDrawer");
  if (!drawer) return;
  drawer.classList.remove("open");
  setTimeout(() => drawer.classList.add("hidden"), 220);
}

function copyMyId() {
  const id = String(App.user?.userId || "");
  if (navigator.clipboard) navigator.clipboard.writeText(id);
  toast("ID copied: " + id);
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

  App.socket.on("chat:message", message => {
    addMsg(message.channel === "mafia" ? "mafiaMessages" : "chatMessages", message);
  });

  App.socket.on("signal:offer", onOffer);
  App.socket.on("signal:answer", onAnswer);
  App.socket.on("signal:ice", onIce);
}

async function loadAll() {
  await Promise.allSettled([
    loadRooms(),
    loadLeaderboard(),
    loadClans(),
    loadStore()
  ]);
}

async function loadRooms() {
  const r = await api("/api/rooms");
  if (r.ok) renderRooms(r.rooms || []);
}

function renderRooms(rooms) {
  if ($("roomsCount")) $("roomsCount").textContent = rooms.length;

  if (!$("roomsList")) return;

  $("roomsList").innerHTML = (rooms || []).map(r => `
    <div class="room">
      <div class="pic">🎭</div>
      <div class="grow">
        <h3>${esc(r.name || "VOID TABLE")}</h3>
        <p>Host: ${esc(r.hostName || "Player")} · ${Number(r.players || 0)}/${Number(r.maxPlayers || 10)}</p>
        <span class="badge">${esc(r.phase || "waiting")}</span>
      </div>
      <button onclick="joinRoom('${esc(r.id)}')">JOIN</button>
    </div>
  `).join("") || `<div class="card">No rooms</div>`;
}

async function createRoom() {
  const settings = collectSettings();
  settings.maxPlayers = Number($("maxPlayers")?.value || 10);
  settings.language = $("roomLanguage")?.value || "Georgian";

  const r = await emit("room:create", {
    name: $("roomName")?.value || "VOID TABLE",
    settings
  });

  r.ok ? enterRoom(r.room) : toast(r.error || "Room create failed");
}

async function joinRoom(id) {
  const r = await emit("room:join", { roomId: id });
  r.ok ? enterRoom(r.room) : toast(r.error || "Join failed");
}

function enterRoom(room) {
  App.room = room;
  hide("app");
  show("game");
  renderRoom();
  ensureMedia().then(connectToPeers);
}

async function leaveRoom() {
  if (!App.room) {
    hide("game");
    show("app");
    return;
  }

  const isHost = App.room.viewer?.isHost || App.room.players?.some(p => p.userId === App.user.userId && Number(p.seat) === 1);
  const roomId = App.room.id;

  Object.values(App.peers).forEach(pc => pc.close());
  App.peers = {};

  if (isHost) {
    await emit("room:terminate", { roomId });
  } else {
    await emit("room:leave", { roomId });
  }

  App.room = null;
  hide("game");
  show("app");
  loadRooms();
}

function renderRoom() {
  const r = App.room;
  if (!r) return;

  const waiting = r.phase === "waiting";

  if ($("phaseName")) $("phaseName").textContent = waiting ? "Lobby" : r.phase;
  if ($("phaseInfo")) $("phaseInfo").textContent = waiting ? `${r.players.length}/${r.settings.maxPlayers}` : `Day ${r.day || 0}`;
  if ($("timer")) $("timer").textContent = fmt(r.timer || 0);
  if ($("gameRoomName")) $("gameRoomName").textContent = r.name || "VOID TABLE";
  if ($("gameRoomInfo")) $("gameRoomInfo").textContent = `${r.phase} · Host: ${r.hostName || "-"} · Code: ${r.id}`;
  if ($("playersCount")) $("playersCount").textContent = `${r.players.length}/${r.settings.maxPlayers}`;

  $("lobbyView")?.classList.toggle("hidden", !waiting);
  $("videoGrid")?.classList.toggle("hidden", waiting);

  ["settingsBtn", "startBtn", "nextPhaseBtn", "roomTopBtn"].forEach(id => {
    if ($(id)) $(id).style.display = r.viewer?.isHost ? "inline-block" : "none";
  });

  if ($("playersList")) {
    $("playersList").innerHTML = r.players.map(playerRow).join("");
  }

  if ($("chatMessages")) {
    $("chatMessages").innerHTML = (r.chat || []).slice(-80).map(msgHtml).join("");
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
  }

  if ($("mafiaChatBox")) {
    const mafiaRoles = ["mafia", "don", "yakuza"];
    $("mafiaChatBox").classList.toggle("hidden", !(mafiaRoles.includes(r.viewer?.role) && r.phase === "night"));
  }

  fillSettingsModal(r);

  if (!waiting) renderVideos();
  connectToPeers();
}

function playerRow(p) {
  return `
    <div class="player ${p.speaking ? "speaking" : ""}" onclick="openPlayer(${p.userId})">
      <div class="pic">${esc(p.avatar || "◆")}</div>
      <div class="grow">
        <b>#${p.seat} · ${esc(p.nickname || "Player")} ${p.userId === App.user.userId ? "(you)" : ""}</b>
        <p>ID ${p.userId} · Level ${getUserLevel(p)}</p>
        ${p.userId === App.user.userId ? `
          <button onclick="event.stopPropagation();toggleMic()">MIC</button>
          <button onclick="event.stopPropagation();toggleCam()">CAM</button>
        ` : ""}
      </div>
      <span class="badge ${p.speaking ? "speaking-badge" : ""}">
        ${p.speaking ? "SPEAKING" : p.connected ? "ON" : "OFF"}
      </span>
    </div>
  `;
}

function renderVideos() {
  const r = App.room;
  if (!$("videoGrid")) return;

  $("videoGrid").innerHTML = r.players.map(p => `
    <div class="tile ${p.speaking ? "speaking" : ""}">
      <video id="vid_${p.socketId || p.id}" autoplay playsinline ${p.userId === App.user.userId ? "muted" : ""}></video>
      <div class="seat">#${p.seat}</div>
      <div class="name">ID ${p.userId} · ${esc(p.nickname || "Player")}</div>
    </div>
  `).join("");

  const me = r.players.find(p => p.userId === App.user.userId);

  if (me && App.localStream) {
    const v = $("vid_" + (me.socketId || me.id));
    if (v) {
      v.srcObject = App.localStream;
      v.muted = true;
      v.play?.().catch(() => {});
    }
  }
}

function openSettingsModal() {
  fillSettingsModal(App.room);
  show("settingsModal");
}

function fillSettingsModal(room) {
  if (!room) return;

  const settings = room.settings || {};
  const timers = settings.timers || {};
  const roles = settings.roles || {};

  if ($("setMaxPlayers")) $("setMaxPlayers").value = Number(settings.maxPlayers || 10);
  if ($("setNight")) $("setNight").value = Number(timers.night || 45);
  if ($("setDay")) $("setDay").value = Number(timers.day || 90);
  if ($("setVote")) $("setVote").value = Number(timers.vote || 35);

  if ($("role_mafia")) $("role_mafia").value = Number(roles.mafia ?? 1);
  if ($("role_don")) $("role_don").value = Number(roles.don ?? 0);
  if ($("role_doctor")) $("role_doctor").value = 1;
  if ($("role_sheriff")) $("role_sheriff").value = 1;
  if ($("role_citizen")) $("role_citizen").value = 0;
}

function renderRoleSettings(defaults = {}) {
  const box = $("roleSettings");
  if (!box) return;

  const rolesToRender = (App.roles || []).filter(r => !["citizen"].includes(r.key));

  box.innerHTML = rolesToRender.map(r => {
    const fixed = ["doctor", "sheriff"].includes(r.key);
    const value = fixed ? 1 : Number(defaults[r.key] ?? (r.key === "mafia" ? 1 : 0));

    return `
      <label>
        ${esc(r.label || r.key)}
        <input
          id="role_${esc(r.key)}"
          type="number"
          min="${fixed ? 1 : 0}"
          max="${fixed ? 1 : 10}"
          value="${value}"
          ${fixed ? "readonly" : ""}
        >
      </label>
    `;
  }).join("") + `
    <p class="settings-note">Citizen ავტომატურად შეივსება დარჩენილი მოთამაშეებით. Doctor და Sheriff ყოველთვის 1 არის.</p>
  `;
}

function collectSettings() {
  const maxPlayers = Number($("setMaxPlayers")?.value || $("maxPlayers")?.value || 10);

  const roles = {};
  (App.roles || []).forEach(r => {
    if (r.key === "citizen") return;
    roles[r.key] = Number($("role_" + r.key)?.value || 0);
  });

  roles.doctor = 1;
  roles.sheriff = 1;

  const specialCount = Object.values(roles).reduce((a, b) => a + Number(b || 0), 0);
  roles.citizen = Math.max(0, maxPlayers - specialCount);

  return {
    maxPlayers,
    timers: {
      night: Number($("setNight")?.value || 45),
      day: Number($("setDay")?.value || 90),
      vote: Number($("setVote")?.value || 35)
    },
    roles
  };
}

async function saveSettings() {
  const r = await emit("room:settings", {
    roomId: App.room?.id,
    settings: collectSettings()
  });

  if (r.ok) {
    toast("Saved");
    hide("settingsModal");
  } else {
    toast(r.error || "Save failed");
  }
}

async function startGame() {
  const r = await emit("game:start", { roomId: App.room?.id });
  if (!r.ok) toast(r.error || "Start failed");
}

async function nextPhase() {
  const r = await emit("game:next", { roomId: App.room?.id });
  if (!r.ok) toast(r.error || "Next phase failed");
}

function openChatPanel() {
  show("chatPanel");
  setTimeout(() => $("chatInput")?.focus(), 100);
}

async function sendChat(channel) {
  const input = channel === "mafia" ? $("mafiaInput") : $("chatInput");
  const message = input?.value?.trim();

  if (!message || !App.room) return;

  input.disabled = true;

  const r = await emit("chat:send", {
    roomId: App.room.id,
    message,
    channel
  }, 5000);

  input.disabled = false;

  if (r.ok) {
    input.value = "";
  } else {
    toast(r.error || "Message failed");
  }
}

function msgHtml(m) {
  return `
    <div class="msg">
      <b>${m.seat ? "#" + m.seat + " · " : ""}${esc(m.nickname || "Player")}</b><br>
      ${esc(m.message || "")}
    </div>
  `;
}

function addMsg(id, m) {
  const box = $(id);
  if (!box) return;

  box.insertAdjacentHTML("beforeend", msgHtml(m));
  box.scrollTop = box.scrollHeight;
}

async function loadLeaderboard() {
  const r = await api("/api/leaderboard");
  if (!r.ok || !$("leaderboard")) return;

  $("leaderboard").innerHTML = (r.users || []).map((u, i) => {
    const s = normalizeStats(u);

    return `
      <div class="item" onclick="openPlayer(${u.userId})">
        <div class="pic">${esc(u.avatar || "◆")}</div>
        <div class="grow">
          <b>#${i + 1} ${esc(u.nickname || "Player")}</b>
          <p>ID ${u.userId} · Level ${getUserLevel(u)}</p>
        </div>
        <b>⭐ ${s.xp}</b>
      </div>
    `;
  }).join("");
}

async function loadClans() {
  const r = await api("/api/clans");
  if (!r.ok || !$("clansList")) return;

  $("clansList").innerHTML = (r.clans || []).map((c, i) => `
    <div class="item">
      <div class="pic">${esc(c.emblem || "◆")}</div>
      <div class="grow">
        <b>#${i + 1} ${esc(c.name || "Clan")} ${esc(c.tag || "")}</b>
        <p>Level ${c.level || 1} · Members ${(c.members || []).length}</p>
      </div>
      <button onclick="joinClan('${esc(c.clanId || c.id)}')">JOIN</button>
    </div>
  `).join("") || `<div class="card">No clans</div>`;
}

async function createClan() {
  const r = await api("/api/clans", {
    method: "POST",
    body: {
      name: $("clanName")?.value,
      tag: $("clanTag")?.value,
      user: App.user
    }
  });

  toast(r.ok ? "Clan created" : (r.error || "Clan create failed"));
  loadClans();
}

async function joinClan(id) {
  const r = await api(`/api/clans/${id}/join`, {
    method: "POST",
    body: { user: App.user }
  });

  toast(r.ok ? "Joined" : (r.error || "Join clan failed"));
  loadClans();
}

async function loadStore() {
  const r = await api("/api/store");
  if (!r.ok || !$("storeList")) return;

  const banned = ["walkieTalkie", "roomNames", "blueMagicBall", "avatarFrameNeon"];

  const items = (r.items || []).filter(item => !banned.includes(item.key));

  $("storeList").innerHTML = items.length ? items.map(i => `
    <div class="item">
      <div class="pic">${esc(i.icon || "💠")}</div>
      <div class="grow">
        <b>${esc(i.title)}</b>
        <p>${esc(i.description)}</p>
      </div>
      <button>${i.price ? i.price + " coins" : "Owned"}</button>
    </div>
  `).join("") : `<div class="card">Store items coming soon</div>`;
}

async function saveProfile() {
  const r = await api("/api/auth/me", {
    method: "PUT",
    body: {
      userId: App.user.userId,
      nickname: $("editNick")?.value,
      avatar: $("editAvatar")?.value
    }
  });

  if (r.ok) {
    App.user = r.user;
    renderMe();
    toast("Saved");
  } else {
    toast(r.error || "Profile save failed");
  }
}

async function openPlayer(id) {
  const r = await api("/api/users/" + id);
  if (!r.ok) return toast(r.error || "User not found");

  const u = r.user;
  const s = normalizeStats(u);

  if (!$("playerProfile")) return;

  $("playerProfile").innerHTML = `
    <div class="profile">
      <div class="avatar">${esc(u.avatar || "◆")}</div>
      <h2>${esc(u.nickname || "Player")}</h2>
      <p>ID ${u.userId} · Level ${getUserLevel(u)}</p>

      <div class="grid2 stats">
        <div><b>${s.games}</b><span>Games</span></div>
        <div><b>${s.wins}</b><span>Wins</span></div>
        <div><b>${s.losses}</b><span>Losses</span></div>
        <div><b>${s.rating.toFixed(1)}</b><span>Rating</span></div>
        <div><b>${s.mafiaGames}</b><span>As Mafia</span></div>
        <div><b>${s.citizenGames}</b><span>As Citizen</span></div>
        <div><b>${s.xp}</b><span>XP</span></div>
        <div><b>${getUserLevel(u)}</b><span>Level</span></div>
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
  } catch (e) {
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }

  return App.localStream;
}

function toggleMic() {
  const track = App.localStream?.getAudioTracks?.()[0];

  if (!track) {
    ensureMedia();
    return;
  }

  track.enabled = !track.enabled;

  App.socket?.emit("media:state", {
    roomId: App.room?.id,
    micOn: track.enabled
  });
}

function toggleCam() {
  const track = App.localStream?.getVideoTracks?.()[0];

  if (!track) {
    ensureMedia();
    return;
  }

  track.enabled = !track.enabled;

  App.socket?.emit("media:state", {
    roomId: App.room?.id,
    cameraOn: track.enabled
  });
}

function setupVoiceActivity() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const source = ctx.createMediaStreamSource(App.localStream);
    const analyser = ctx.createAnalyser();

    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let last = false;

    setInterval(() => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const speaking = avg > 12;

      if (speaking !== last) {
        last = speaking;
        App.socket?.emit("media:state", {
          roomId: App.room?.id,
          speaking
        });
      }
    }, 300);
  } catch (_) {}
}

async function connectToPeers() {
  if (!App.room || !App.localStream) return;

  const me = App.room.players.find(p => p.userId === App.user.userId);
  if (!me) return;

  for (const p of App.room.players) {
    if (!p.socketId || p.socketId === me.socketId || App.peers[p.socketId]) continue;

    const pc = createPeer(p.socketId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    App.socket.emit("signal:offer", {
      to: p.socketId,
      signal: offer
    });
  }
}

function createPeer(socketId) {
  const pc = new RTCPeerConnection({ iceServers: App.iceServers });
  App.peers[socketId] = pc;

  App.localStream?.getTracks().forEach(track => {
    pc.addTrack(track, App.localStream);
  });

  pc.onicecandidate = event => {
    if (event.candidate) {
      App.socket.emit("signal:ice", {
        to: socketId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = event => {
    const video = $("vid_" + socketId);
    if (video) {
      video.srcObject = event.streams[0];
      video.play?.().catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      delete App.peers[socketId];
    }
  };

  return pc;
}

async function onOffer({ from, signal }) {
  await ensureMedia();

  const pc = App.peers[from] || createPeer(from);
  await pc.setRemoteDescription(signal);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  App.socket.emit("signal:answer", {
    to: from,
    signal: answer
  });
}

async function onAnswer({ from, signal }) {
  const pc = App.peers[from];
  if (pc) await pc.setRemoteDescription(signal);
}

async function onIce({ from, candidate }) {
  const pc = App.peers[from];

  if (pc && candidate) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (_) {}
  }
}

function fmt(seconds) {
  seconds = Number(seconds || 0);
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}
