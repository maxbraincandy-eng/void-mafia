const $ = id => document.getElementById(id);

const App = {
  user: null,
  socket: null,
  room: null,
  localStream: null,
  peers: {},
  remoteStreams: {},
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  roles: [],
  speakingWatcher: null
};

function toast(text) {
  alert(text);
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, match => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[match]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  return response.json();
}

function emit(name, payload, timeout = 7000) {
  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({
        ok: false,
        error: "Timeout"
      });
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
    const webrtc = await api("/api/webrtc");
    if (webrtc.ok && Array.isArray(webrtc.iceServers)) {
      App.iceServers = webrtc.iceServers;
    }
  } catch (err) {
    console.warn("WebRTC config load failed:", err);
  }

  try {
    const roleResponse = await api("/api/roles");

    if (roleResponse.ok) {
      App.roles = roleResponse.roles || [];
      renderRoleSettings(roleResponse.defaultSettings?.roles || {});
    }
  } catch (err) {
    console.warn("Roles load failed:", err);
  }

  try {
    const me = await api("/api/auth/me");

    if (me.user) {
      enterApp(me.user);
    }
  } catch (err) {
    console.warn("Session load failed:", err);
  }
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

  if ($("guestBtn")) {
    $("guestBtn").onclick = async () => {
      const response = await api("/api/auth/guest", {
        method: "POST",
        body: {
          nickname: $("guestNick")?.value,
          avatar: $("guestAvatar")?.value
        }
      });

      response.ok ? enterApp(response.user) : toast(response.error);
    };
  }

  if ($("registerBtn")) {
    $("registerBtn").onclick = async () => {
      const response = await api("/api/auth/register", {
        method: "POST",
        body: {
          nickname: $("regNick")?.value,
          email: $("regEmail")?.value,
          password: $("regPass")?.value
        }
      });

      response.ok ? enterApp(response.user) : toast(response.error);
    };
  }

  if ($("loginBtn")) {
    $("loginBtn").onclick = async () => {
      const response = await api("/api/auth/login", {
        method: "POST",
        body: {
          email: $("loginEmail")?.value,
          password: $("loginPass")?.value
        }
      });

      response.ok ? enterApp(response.user) : toast(response.error);
    };
  }

  if ($("refreshBtn")) $("refreshBtn").onclick = loadAll;

  if ($("hostGameBtn")) {
    $("hostGameBtn").onclick = () => $("roomCreate")?.classList.toggle("hidden");
  }

  if ($("createRoomBtn")) $("createRoomBtn").onclick = createRoom;

  if ($("joinByCodeBtn")) {
    $("joinByCodeBtn").onclick = () => {
      const code = prompt("Room number");
      if (code) joinRoom(code);
    };
  }

  if ($("createClanBtn")) $("createClanBtn").onclick = createClan;
  if ($("saveProfileBtn")) $("saveProfileBtn").onclick = saveProfile;
  if ($("leaveBtn")) $("leaveBtn").onclick = leaveRoom;

  if ($("chatTopBtn")) {
    $("chatTopBtn").onclick = () => {
      show("chatPanel");
      scrollChatToBottom("chatMessages");
    };
  }

  if ($("roomTopBtn")) $("roomTopBtn").onclick = () => show("settingsModal");
  if ($("settingsBtn")) $("settingsBtn").onclick = () => show("settingsModal");
  if ($("startBtn")) $("startBtn").onclick = startGame;
  if ($("nextPhaseBtn")) $("nextPhaseBtn").onclick = nextPhase;
  if ($("saveSettingsBtn")) $("saveSettingsBtn").onclick = saveSettings;

  if ($("sendChatBtn")) $("sendChatBtn").onclick = () => sendChat("room");
  if ($("sendMafiaBtn")) $("sendMafiaBtn").onclick = () => sendChat("mafia");

  if ($("chatInput")) {
    $("chatInput").addEventListener("keydown", event => {
      if (event.key === "Enter") sendChat("room");
    });
  }

  if ($("mafiaInput")) {
    $("mafiaInput").addEventListener("keydown", event => {
      if (event.key === "Enter") sendChat("mafia");
    });
  }

  if ($("menuBtn")) $("menuBtn").onclick = openMainMenu;

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

function getUserLevel(user) {
  const xp = Number(user?.stats?.xp || 0);
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function normalizeStats(user) {
  const stats = user?.stats || {};

  return {
    xp: Number(stats.xp || 0),
    rating: Number(stats.rating || 5),
    wins: Number(stats.wins || 0),
    games: Number(stats.games || stats.gamesPlayed || 0),
    losses: Number(stats.losses || 0),
    mafiaGames: Number(stats.mafiaGames || 0),
    citizenGames: Number(stats.citizenGames || 0)
  };
}

function renderMe() {
  if (!App.user) return;

  const stats = normalizeStats(App.user);

  if ($("userLine")) {
    $("userLine").textContent = `ID ${App.user.userId} · ${App.user.nickname}`;
  }

  if ($("profileName")) {
    $("profileName").textContent = App.user.nickname;
  }

  if ($("profileId")) {
    $("profileId").textContent = `ID ${App.user.userId} · Level ${getUserLevel(App.user)}`;
  }

  if ($("profileAvatar")) {
    $("profileAvatar").textContent = App.user.avatar || "◆";
  }

  if ($("statXp")) $("statXp").textContent = stats.xp;
  if ($("statRating")) $("statRating").textContent = stats.rating.toFixed(1);
  if ($("statWins")) $("statWins").textContent = stats.wins;
  if ($("statGames")) $("statGames").textContent = stats.games;

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

  App.socket.on("chat:message", message => {
    addMsg(message.channel === "mafia" ? "mafiaMessages" : "chatMessages", message);

    if (App.room && Array.isArray(App.room.chat) && message.channel !== "mafia") {
      App.room.chat.push(message);
    }
  });

  App.socket.on("signal:offer", onOffer);
  App.socket.on("signal:answer", onAnswer);
  App.socket.on("signal:ice", onIce);

  App.socket.on("webrtc:offer", ({ from, offer }) => onOffer({ from, signal: offer }));
  App.socket.on("webrtc:answer", ({ from, answer }) => onAnswer({ from, signal: answer }));
  App.socket.on("webrtc:ice", ({ from, candidate }) => onIce({ from, candidate }));
}

async function loadAll() {
  await loadRooms();
  loadLeaderboard();
  loadClans();
  loadStore();
}

async function loadRooms() {
  const response = await api("/api/rooms");

  if (response.ok) {
    renderRooms(response.rooms || []);
  }
}

function renderRooms(rooms) {
  if ($("roomsCount")) {
    $("roomsCount").textContent = rooms.length;
  }

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

  settings.maxPlayers = Number($("maxPlayers")?.value || 10);
  settings.language = $("roomLanguage")?.value || "Georgian";

  const response = await emit("room:create", {
    name: $("roomName")?.value || "VOID TABLE",
    settings
  });

  response.ok ? enterRoom(response.room) : toast(response.error);
}

async function joinRoom(id) {
  const response = await emit("room:join", {
    roomId: id
  });

  response.ok ? enterRoom(response.room) : toast(response.error);
}

function enterRoom(room) {
  App.room = room;

  hide("app");
  show("game");

  renderRoom();

  ensureMedia().then(() => {
    renderRoom();
    connectToPeers();
  });
}

function leaveRoom() {
  Object.values(App.peers).forEach(peer => peer.close());

  App.peers = {};
  App.remoteStreams = {};
  App.room = null;

  document.querySelectorAll("audio[data-peer], video[data-peer]").forEach(el => el.remove());

  hide("game");
  show("app");

  loadAll();
}

function renderRoom() {
  const room = App.room;
  if (!room) return;

  const waiting = room.phase === "waiting";

  if ($("phaseName")) $("phaseName").textContent = waiting ? "Lobby" : room.phase;
  if ($("phaseInfo")) {
    $("phaseInfo").textContent = waiting
      ? `${room.players.length}/${room.settings.maxPlayers}`
      : `Day ${room.day}`;
  }

  if ($("timer")) $("timer").textContent = fmt(room.timer || 0);
  if ($("gameRoomName")) $("gameRoomName").textContent = room.name;
  if ($("gameRoomInfo")) {
    $("gameRoomInfo").textContent = `${room.phase} · Host: ${room.hostName} · Code: ${room.id}`;
  }

  if ($("playersCount")) {
    $("playersCount").textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  }

  if ($("lobbyView")) $("lobbyView").classList.toggle("hidden", !waiting);
  if ($("videoGrid")) $("videoGrid").classList.toggle("hidden", waiting);

  ["settingsBtn", "startBtn", "nextPhaseBtn", "roomTopBtn"].forEach(id => {
    const el = $(id);
    if (el) el.style.display = room.viewer?.isHost ? "inline-block" : "none";
  });

  if ($("playersList")) {
    $("playersList").innerHTML = room.players.map(playerRow).join("");
  }

  if ($("chatMessages")) {
    $("chatMessages").innerHTML = (room.chat || []).slice(-80).map(msgHtml).join("");
  }

  const canUseMafiaChat = ["mafia", "don", "yakuza"].includes(room.viewer?.role) && room.phase === "night";

  if ($("mafiaChatBox")) {
    $("mafiaChatBox").classList.toggle("hidden", !canUseMafiaChat);
  }

  if (!waiting) {
    renderVideos();
  }

  connectToPeers();
}

function playerRow(player) {
  const isMe = Number(player.userId) === Number(App.user.userId);
  const level = player.level || getUserLevel(player);
  const speaking = player.speaking ? "SPEAKING" : player.connected ? "ON" : "OFF";

  return `
    <div class="player ${player.speaking ? "speaking" : ""}" onclick="openPlayer(${player.userId})">
      <div class="pic">${esc(player.avatar || "◆")}</div>

      <div class="grow">
        <b>#${player.seat} · ${esc(player.nickname)} ${isMe ? "(you)" : ""}</b>
        <p>ID ${player.userId} · Level ${level}</p>

        ${
          isMe
            ? `
              <button onclick="event.stopPropagation(); toggleMic()">
                ${player.micOn === false ? "MIC OFF" : "MIC"}
              </button>

              <button onclick="event.stopPropagation(); toggleCam()">
                ${player.cameraOn === false ? "CAM OFF" : "CAM"}
              </button>
            `
            : ""
        }
      </div>

      <span class="badge ${player.speaking ? "live speaking-badge" : player.connected ? "live" : ""}">
        ${speaking}
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
        data-peer="${player.socketId || player.id}"
        autoplay
        playsinline
        ${Number(player.userId) === Number(App.user.userId) ? "muted" : ""}
      ></video>

      <div class="seat">#${player.seat}</div>
      <div class="name">ID ${player.userId} · ${esc(player.nickname)}</div>
    </div>
  `).join("");

  const me = room.players.find(player => Number(player.userId) === Number(App.user.userId));

  if (me && App.localStream) {
    const video = $("vid_" + (me.socketId || me.id));

    if (video) {
      video.srcObject = App.localStream;
      video.muted = true;
      video.play?.().catch(() => {});
    }
  }

  Object.entries(App.remoteStreams).forEach(([peerId, stream]) => {
    attachRemoteStream(peerId, stream);
  });
}

function renderRoleSettings(defaults = {}) {
  if (!$("roleSettings")) return;

  $("roleSettings").innerHTML = App.roles.map(role => `
    <label>
      ${esc(role.label)}
      <input id="role_${role.key}" type="number" min="0" value="${defaults[role.key] ?? 0}">
    </label>
  `).join("");
}

function collectSettings() {
  const roles = {};

  App.roles.forEach(role => {
    roles[role.key] = Number($("role_" + role.key)?.value || 0);
  });

  return {
    maxPlayers: Number($("setMaxPlayers")?.value || $("maxPlayers")?.value || 10),
    timers: {
      night: Number($("setNight")?.value || 45),
      day: Number($("setDay")?.value || 90),
      vote: Number($("setVote")?.value || 35)
    },
    roles
  };
}

async function saveSettings() {
  const response = await emit("room:settings", {
    roomId: App.room.id,
    settings: collectSettings()
  });

  toast(response.ok ? "Saved" : response.error);
  hide("settingsModal");
}

async function startGame() {
  const response = await emit("game:start", {
    roomId: App.room.id
  });

  toast(response.ok ? "Started" : response.error);
}

async function nextPhase() {
  const response = await emit("game:next", {
    roomId: App.room.id
  });

  if (!response.ok) toast(response.error);
}

async function sendChat(channel) {
  const input = channel === "mafia" ? $("mafiaInput") : $("chatInput");
  const message = input?.value?.trim();

  if (!message || !App.room) return;

  input.disabled = true;

  const response = await emit("chat:send", {
    roomId: App.room.id,
    message,
    channel
  });

  input.disabled = false;

  if (response.ok) {
    input.value = "";
  } else {
    toast(response.error || "Message failed");
  }
}

function msgHtml(message) {
  return `
    <div class="msg">
      <b>${message.seat ? "#" + message.seat + " · " : ""}${esc(message.nickname)}</b><br>
      ${esc(message.message)}
    </div>
  `;
}

function addMsg(id, message) {
  const box = $(id);
  if (!box) return;

  box.insertAdjacentHTML("beforeend", msgHtml(message));
  scrollChatToBottom(id);
}

function scrollChatToBottom(id) {
  const box = $(id);
  if (!box) return;

  box.scrollTop = box.scrollHeight;
}

async function loadLeaderboard() {
  const response = await api("/api/leaderboard");

  if (!response.ok) {
    toast(response.error || "Leaderboard ვერ ჩაიტვირთა");
    return;
  }

  if (!$("leaderboard")) return;

  $("leaderboard").innerHTML = (response.users || []).map((user, index) => {
    const stats = normalizeStats(user);

    return `
      <div class="item" onclick="openPlayer(${user.userId})">
        <div class="pic">${esc(user.avatar || "◆")}</div>

        <div class="grow">
          <b>#${index + 1} ${esc(user.nickname || "Player")}</b>
          <p>ID ${user.userId} · Level ${getUserLevel(user)}</p>
        </div>

        <b>⭐ ${stats.xp}</b>
      </div>
    `;
  }).join("");
}

async function loadClans() {
  const response = await api("/api/clans");

  if (!response.ok) {
    toast(response.error || "Clans ვერ ჩაიტვირთა");
    return;
  }

  if (!$("clansList")) return;

  $("clansList").innerHTML = (response.clans || []).map((clan, index) => `
    <div class="item">
      <div class="pic">${esc(clan.emblem || "◆")}</div>

      <div class="grow">
        <b>#${index + 1} ${esc(clan.name)} ${esc(clan.tag || "")}</b>
        <p>Level ${clan.level || 1} · Members ${clan.members?.length || 0}</p>
      </div>

      <button onclick="joinClan('${esc(clan.clanId)}')">JOIN</button>
    </div>
  `).join("") || `<div class="card">No clans</div>`;
}

async function createClan() {
  const response = await api("/api/clans", {
    method: "POST",
    body: {
      name: $("clanName")?.value,
      tag: $("clanTag")?.value,
      user: App.user
    }
  });

  toast(response.ok ? "Clan created" : response.error);
  loadClans();
}

async function joinClan(id) {
  const response = await api(`/api/clans/${id}/join`, {
    method: "POST",
    body: {
      user: App.user
    }
  });

  toast(response.ok ? "Joined" : response.error);
  loadClans();
}

async function loadStore() {
  const response = await api("/api/store");

  if (!response.ok || !$("storeList")) return;

  const blocked = new Set([
    "walkieTalkie",
    "roomNames",
    "blueMagicBall",
    "avatarFrameNeon"
  ]);

  const items = (response.items || []).filter(item => !blocked.has(item.key));

  $("storeList").innerHTML = items.length
    ? items.map(item => `
        <div class="item">
          <div class="pic">💠</div>

          <div class="grow">
            <b>${esc(item.title)}</b>
            <p>${esc(item.description)}</p>
          </div>

          <button>${item.price ? item.price + " coins" : "Owned"}</button>
        </div>
      `).join("")
    : `<div class="card">Store disabled for now</div>`;
}

async function saveProfile() {
  const response = await api("/api/auth/me", {
    method: "PUT",
    body: {
      userId: App.user.userId,
      nickname: $("editNick")?.value,
      avatar: $("editAvatar")?.value
    }
  });

  if (response.ok) {
    App.user = response.user;
    renderMe();
    toast("Saved");
  } else {
    toast(response.error);
  }
}

async function openPlayer(id) {
  const response = await api("/api/users/" + id);

  if (!response.ok) {
    toast(response.error || "User ვერ მოიძებნა");
    return;
  }

  const user = response.user;
  const stats = normalizeStats(user);

  if (!$("playerProfile")) return;

  $("playerProfile").innerHTML = `
    <div class="profile">
      <div class="avatar">${esc(user.avatar || "◆")}</div>

      <h2>${esc(user.nickname || "Player")}</h2>
      <p>ID ${user.userId} · Level ${getUserLevel(user)}</p>

      <div class="grid2 stats">
        <div>
          <b>${stats.games}</b>
          <span>Games</span>
        </div>

        <div>
          <b>${stats.wins}</b>
          <span>Wins</span>
        </div>

        <div>
          <b>${stats.losses}</b>
          <span>Losses</span>
        </div>

        <div>
          <b>${stats.rating.toFixed(1)}</b>
          <span>Rating</span>
        </div>

        <div>
          <b>${stats.mafiaGames}</b>
          <span>As Mafia</span>
        </div>

        <div>
          <b>${stats.citizenGames}</b>
          <span>As Citizen</span>
        </div>

        <div>
          <b>${stats.xp}</b>
          <span>XP</span>
        </div>

        <div>
          <b>${getUserLevel(user)}</b>
          <span>Level</span>
        </div>
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
    console.error("Media failed:", err);
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

  App.socket.emit("media:state", {
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

  App.socket.emit("media:state", {
    roomId: App.room?.id,
    cameraOn: track.enabled
  });
}

function setupVoiceActivity() {
  try {
    if (App.speakingWatcher) clearInterval(App.speakingWatcher);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(App.localStream);
    const analyser = context.createAnalyser();

    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    let lastSpeaking = false;

    App.speakingWatcher = setInterval(() => {
      analyser.getByteFrequencyData(data);

      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      const speaking = average > 12;

      if (speaking !== lastSpeaking) {
        lastSpeaking = speaking;

        App.socket?.emit("media:state", {
          roomId: App.room?.id,
          speaking
        });
      }
    }, 300);
  } catch (err) {
    console.warn("Voice activity failed:", err);
  }
}

async function connectToPeers() {
  if (!App.room || !App.localStream || !Array.isArray(App.room.players)) return;

  const me = App.room.players.find(player => Number(player.userId) === Number(App.user.userId));
  if (!me) return;

  for (const player of App.room.players) {
    if (!player.socketId) continue;
    if (player.socketId === me.socketId) continue;
    if (App.peers[player.socketId]) continue;

    try {
      const peer = createPeer(player.socketId);
      const offer = await peer.createOffer();

      await peer.setLocalDescription(offer);

      App.socket.emit("signal:offer", {
        to: player.socketId,
        signal: offer
      });

      App.socket.emit("webrtc:offer", {
        to: player.socketId,
        offer
      });
    } catch (err) {
      console.warn("Offer failed:", err);
    }
  }
}

function createPeer(peerId) {
  const peer = new RTCPeerConnection({
    iceServers: App.iceServers
  });

  App.peers[peerId] = peer;

  App.localStream?.getTracks().forEach(track => {
    peer.addTrack(track, App.localStream);
  });

  peer.onicecandidate = event => {
    if (!event.candidate) return;

    App.socket.emit("signal:ice", {
      to: peerId,
      candidate: event.candidate
    });

    App.socket.emit("webrtc:ice", {
      to: peerId,
      candidate: event.candidate
    });
  };

  peer.ontrack = event => {
    const stream = event.streams[0];
    if (!stream) return;

    App.remoteStreams[peerId] = stream;
    attachRemoteStream(peerId, stream);
  };

  peer.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
      try {
        peer.close();
      } catch (err) {}

      delete App.peers[peerId];
    }
  };

  return peer;
}

function attachRemoteStream(peerId, stream) {
  const video = $("vid_" + peerId);

  if (video) {
    video.srcObject = stream;
    video.muted = false;
    video.volume = 1;
    video.play?.().catch(() => {});
    return;
  }

  let audio = document.querySelector(`audio[data-peer="${peerId}"]`);

  if (!audio) {
    audio = document.createElement("audio");
    audio.dataset.peer = peerId;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    audio.style.display = "none";
    document.body.appendChild(audio);
  }

  audio.srcObject = stream;
  audio.muted = false;
  audio.volume = 1;
  audio.play?.().catch(() => {});
}

async function onOffer({ from, signal }) {
  await ensureMedia();

  const peer = App.peers[from] || createPeer(from);

  await peer.setRemoteDescription(new RTCSessionDescription(signal));

  const answer = await peer.createAnswer();

  await peer.setLocalDescription(answer);

  App.socket.emit("signal:answer", {
    to: from,
    signal: answer
  });

  App.socket.emit("webrtc:answer", {
    to: from,
    answer
  });
}

async function onAnswer({ from, signal }) {
  const peer = App.peers[from];

  if (!peer) return;

  await peer.setRemoteDescription(new RTCSessionDescription(signal));
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

function fmt(seconds) {
  const total = Number(seconds || 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
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
        <p>ID ${App.user?.userId || "-"} · Level ${getUserLevel(App.user)}</p>

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




/* =========================
   VOID FIX PATCH v16.2
   Buttons / Season remove / Host terminate room
========================= */

function removeSeasonBanner() {
  const possibleSelectors = [
    ".season-card",
    ".season-banner",
    ".season",
    "#seasonBanner",
    "#seasonCard",
    ".promo-card",
    ".event-card"
  ];

  possibleSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      const text = (el.textContent || "").toLowerCase();

      if (
        text.includes("season") ||
        text.includes("silence") ||
        text.includes("void") ||
        text.includes("goal")
      ) {
        el.remove();
      }
    });
  });

  document.querySelectorAll("*").forEach(el => {
    const text = (el.textContent || "").trim().toLowerCase();

    if (
      text.includes("season 1") ||
      text.includes("season of void") ||
      text.includes("silence of the void")
    ) {
      const card = el.closest(".card, .glass, .banner, section, article, div");
      if (card && card !== document.body && card.id !== "app" && card.id !== "game") {
        card.remove();
      }
    }
  });
}

function fixAllButtons() {
  document.querySelectorAll("[data-page]").forEach(btn => {
    btn.onclick = () => {
      const page = btn.getAttribute("data-page");
      if (page) showPage(page);
    };
  });

  const pageMap = {
    Games: "Rooms",
    Rooms: "Rooms",
    Clans: "Clans",
    Rank: "Leaderboard",
    Leaderboard: "Leaderboard",
    Store: "Store",
    Profile: "Profile"
  };

  document.querySelectorAll(".bottom button, .bottom-nav button").forEach(btn => {
    const label = btn.textContent.trim();

    if (pageMap[label]) {
      btn.onclick = () => showPage(pageMap[label]);
    }
  });

  if ($("menuBtn")) $("menuBtn").onclick = openMainMenu;
  if ($("drawerBtn")) $("drawerBtn").onclick = openMainMenu;

  if ($("refreshBtn")) $("refreshBtn").onclick = loadAll;

  if ($("hostGameBtn")) {
    $("hostGameBtn").onclick = () => {
      $("roomCreate")?.classList.toggle("hidden");
    };
  }

  if ($("createRoomBtn")) $("createRoomBtn").onclick = createRoom;

  if ($("joinByCodeBtn")) {
    $("joinByCodeBtn").onclick = () => {
      const code = prompt("Room number");
      if (code) joinRoom(code);
    };
  }

  if ($("chatTopBtn")) {
    $("chatTopBtn").onclick = () => {
      show("chatPanel");
      scrollChatToBottom("chatMessages");
    };
  }

  if ($("roomTopBtn")) {
    $("roomTopBtn").onclick = () => show("settingsModal");
  }

  if ($("settingsBtn")) {
    $("settingsBtn").onclick = () => show("settingsModal");
  }

  if ($("startBtn")) $("startBtn").onclick = startGame;
  if ($("nextPhaseBtn")) $("nextPhaseBtn").onclick = nextPhase;
  if ($("saveSettingsBtn")) $("saveSettingsBtn").onclick = saveSettings;

  if ($("leaveBtn")) $("leaveBtn").onclick = leaveRoom;

  if ($("sendChatBtn")) {
    $("sendChatBtn").onclick = () => sendChat("room");
  }

  if ($("sendMafiaBtn")) {
    $("sendMafiaBtn").onclick = () => sendChat("mafia");
  }

  if ($("chatInput")) {
    $("chatInput").onkeydown = e => {
      if (e.key === "Enter") sendChat("room");
    };
  }

  if ($("mafiaInput")) {
    $("mafiaInput").onkeydown = e => {
      if (e.key === "Enter") sendChat("mafia");
    };
  }

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute("data-close");
      if (target) hide(target);
    };
  });
}

/* override leaveRoom */
window.leaveRoom = function leaveRoom() {
  if (App.socket && App.room) {
    App.socket.emit("room:leave", {
      roomId: App.room.id,
      userId: App.user?.userId
    });
  }

  Object.values(App.peers || {}).forEach(peer => {
    try {
      peer.close();
    } catch (err) {}
  });

  App.peers = {};
  App.remoteStreams = {};
  App.room = null;

  document.querySelectorAll("audio[data-peer], video[data-peer]").forEach(el => {
    try {
      el.srcObject = null;
    } catch (err) {}

    if (el.tagName.toLowerCase() === "audio") {
      el.remove();
    }
  });

  hide("game");
  show("app");

  loadAll();
};

/* listen room closed */
function bindRoomClosedOnce() {
  if (window.__roomClosedBound) return;
  window.__roomClosedBound = true;

  const waitSocket = setInterval(() => {
    if (!App.socket) return;

    clearInterval(waitSocket);

    App.socket.on("room:closed", data => {
      toast(data?.message || "ჰოსტმა ოთახი დახურა.");

      Object.values(App.peers || {}).forEach(peer => {
        try {
          peer.close();
        } catch (err) {}
      });

      App.peers = {};
      App.remoteStreams = {};
      App.room = null;

      hide("game");
      show("app");

      loadAll();
    });
  }, 300);
}

setInterval(() => {
  removeSeasonBanner();
}, 1000);

setTimeout(() => {
  fixAllButtons();
  removeSeasonBanner();
  bindRoomClosedOnce();
}, 500);

