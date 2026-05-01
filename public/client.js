const socket = io();

const $ = id => document.getElementById(id);
let me = null;
let selectedAvatar = "◈";
let currentRoom = null;
let currentRoomId = null;
let localStream = null;
let roomsCache = [];

const avatars = ["♛","◇","⬢","✦","☾","♞","☣","◆","🕶️","👑","💀","🐺"];

function toast(text) {
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = text;
  $("toast").appendChild(div);
  setTimeout(() => div.remove(), 2800);
}

function show(id) {
  ["authScreen","lobbyScreen","gameScreen"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function renderAvatars() {
  $("avatarGrid").innerHTML = avatars.map(a => `<button class="avatar ${a===selectedAvatar?'active':''}" data-av="${a}">${a}</button>`).join("");
  document.querySelectorAll(".avatar").forEach(btn => btn.onclick = () => {
    selectedAvatar = btn.dataset.av;
    localStorage.setItem("voidAvatar", selectedAvatar);
    renderAvatars();
  });
}

function boot() {
  selectedAvatar = localStorage.getItem("voidAvatar") || selectedAvatar;
  $("nickInput").value = localStorage.getItem("voidNick") || "";
  renderAvatars();
  const savedUserId = localStorage.getItem("voidUserId");
  const nick = localStorage.getItem("voidNick");
  if (savedUserId && nick) {
    socket.emit("auth:guest", { userId: savedUserId, nickname: nick, avatar: selectedAvatar }, res => {
      if (res.ok) enterLobby(res.user);
    });
  }
}

$("guestBtn").onclick = () => {
  const nickname = $("nickInput").value.trim();
  if (!nickname) return toast("ჩაწერე ნიკნეიმი");
  socket.emit("auth:guest", { nickname, avatar: selectedAvatar, userId: localStorage.getItem("voidUserId") }, res => {
    if (!res.ok) return toast(res.error || "შესვლა ვერ მოხერხდა");
    localStorage.setItem("voidUserId", res.user.userId);
    localStorage.setItem("voidNick", res.user.nickname);
    localStorage.setItem("voidAvatar", res.user.avatar);
    enterLobby(res.user);
  });
};

function enterLobby(user) {
  me = user;
  $("meLine").textContent = `ID ${user.userId} · ${user.nickname}`;
  show("lobbyScreen");
  loadRooms();
  setInterval(loadRooms, 5000);
}

function loadRooms() {
  socket.emit("rooms:get", list => {
    roomsCache = list || [];
    renderRooms();
  });
}

$("refreshRoomsBtn").onclick = loadRooms;

$("searchRooms").oninput = renderRooms;

function renderRooms() {
  const q = $("searchRooms").value.trim().toLowerCase();
  let list = roomsCache;
  if (q) {
    list = list.filter(r =>
      String(r.code).includes(q) ||
      String(r.name).toLowerCase().includes(q) ||
      String(r.hostName).toLowerCase().includes(q)
    );
  }

  $("roomsList").innerHTML = list.length ? list.map(r => `
    <div class="room-card">
      <h3>${escapeHtml(r.name)}</h3>
      <p>${r.hostAvatar || "◆"} ჰოსტი: ${escapeHtml(r.hostName || "Unknown")} · მაგიდა #${r.code}</p>
      <div class="room-meta">
        <span class="pill ${r.status==='live'?'live':''}">${r.status === "live" ? "LIVE" : "OPEN"}</span>
        <span class="pill">${escapeHtml(r.phaseLabel)}</span>
        <span class="pill">${r.players}/${r.maxPlayers}</span>
        <span class="pill">ცოცხალი ${r.alive}</span>
        <span class="pill">${r.activeMinutes} წთ</span>
      </div>
      <div class="room-actions">
        <button onclick="joinRoom('${r.id}', false)" ${r.status==='live'?'disabled':''}>შესვლა</button>
        <button onclick="joinRoom('${r.id}', true)">ყურება</button>
      </div>
    </div>
  `).join("") : `<div class="stats-card"><h3>აქტიური მაგიდები არ არის</h3><p>შექმენი ახალი მაგიდა.</p></div>`;
}

$("createRoomBtn").onclick = () => {
  if (!me) return;
  socket.emit("room:create", {
    user: me,
    name: $("roomNameInput").value.trim() || "VOID TABLE",
    maxPlayers: Number($("maxPlayersInput").value || 10),
    roleSettings: { mafia: Number($("mafiaCountInput").value || 1), don: true, sheriff: true, doctor: true, detective: false },
    timers: readTimers()
  }, res => {
    if (!res.ok) return toast(res.error || "მაგიდა ვერ შეიქმნა");
    joinRoom(res.room.id, false);
  });
};

window.joinRoom = function(roomId, spectator) {
  socket.emit("room:join", { roomId, spectator, user: me }, async res => {
    if (!res.ok) return toast(res.error || "შესვლა ვერ მოხერხდა");
    currentRoomId = roomId;
    currentRoom = res.room;
    show("gameScreen");
    await ensureMedia();
    renderRoom();
  });
};

async function ensureMedia() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }
  return localStream;
}

socket.on("rooms:list", list => { roomsCache = list || []; if (!$("lobbyScreen").classList.contains("hidden")) renderRooms(); });
socket.on("room:state", room => {
  if (room.id !== currentRoomId) return;
  currentRoom = room;
  renderRoom();
  maybeOpenAction();
});
socket.on("phase:changed", info => {
  if (!currentRoom) return;
  showPhase(info.label, phaseHelp(info.phase));
});
socket.on("phase:tick", ({timer}) => $("timerLabel").textContent = fmt(timer));
socket.on("game:event", ev => addEvent(ev));
socket.on("chat:message", msg => addChat(msg));

function renderRoom() {
  if (!currentRoom) return;
  $("phaseLabel").textContent = currentRoom.phaseLabel || currentRoom.phase;
  $("timerLabel").textContent = fmt(currentRoom.timer || 0);
  $("dayLabel").textContent = `დღე ${currentRoom.dayNumber || 0}`;
  $("aliveLabel").textContent = currentRoom.players.filter(p => p.alive).length;

  const mePlayer = myPlayer();
  $("settingsBtn").style.display = mePlayer && (mePlayer.seat === 1) ? "block" : "none";

  renderVideos();
  renderEvents();
}

function renderVideos() {
  const grid = $("videoGrid");
  grid.innerHTML = currentRoom.players.map(p => `
    <div class="video-tile ${p.alive?'':'dead'}" data-id="${p.id}">
      <video id="v_${p.id}" autoplay playsinline muted="${p.userId===me.userId ? 'true' : 'false'}"></video>
      <div class="tile-controls">${p.userId===me.userId ? `<button id="micBtn">MIC</button><button id="camBtn">CAM</button>` : ""}</div>
      <div class="seat">#${p.seat}</div>
      <div class="tile-name">ID ${p.userId} · ${escapeHtml(p.nickname)}</div>
    </div>
  `).join("");

  const my = myPlayer();
  if (my && localStream) {
    const v = $(`v_${my.id}`);
    if (v) v.srcObject = localStream;
  }
  const mic = $("micBtn");
  if (mic) mic.onclick = () => {
    localStream?.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    toast("MIC toggled");
  };
  const cam = $("camBtn");
  if (cam) cam.onclick = () => {
    localStream?.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    toast("CAM toggled");
  };
}

function myPlayer() {
  return currentRoom?.players?.find(p => p.userId === me?.userId);
}

function maybeOpenAction() {
  const p = myPlayer();
  if (!p || !p.alive) return closeAction();
  if (currentRoom.phase === "nomination") return openNomination();
  if (currentRoom.phase === "vote") return openVote();
  if (currentRoom.phase === "night") return openNightAction(p);
  closeAction();
}

function openNomination() {
  $("actionTitle").textContent = "დაასახელე კანდიდატი";
  $("actionHelp").textContent = "აირჩიე მოთამაშე, რომელიც ხმის მიცემაზე უნდა გადავიდეს.";
  const p = myPlayer();
  const targets = currentRoom.players.filter(x => x.alive && x.id !== p.id);
  renderTargets(targets, t => socket.emit("game:nominate", { roomId: currentRoomId, targetId: t.id }, res => res.ok ? toast("დასახელება დაფიქსირდა") : toast(res.error || "ვერ შესრულდა")));
}

function openVote() {
  $("actionTitle").textContent = "ხმის მიცემა";
  $("actionHelp").textContent = "აირჩიე კანდიდატი ან თავი შეიკავე.";
  const targets = currentRoom.players.filter(x => currentRoom.nominatedIds.includes(x.id));
  $("actionTargets").innerHTML = targets.map(t => `<button data-id="${t.id}">#${t.seat} · ${escapeHtml(t.nickname)}</button>`).join("") + `<button data-id="abstain">თავის შეკავება</button>`;
  $("actionTargets").querySelectorAll("button").forEach(btn => {
    btn.onclick = () => socket.emit("game:vote", { roomId: currentRoomId, targetId: btn.dataset.id }, res => res.ok ? toast("ხმა დაფიქსირდა") : toast(res.error || "ვერ შესრულდა"));
  });
  $("actionModal").classList.remove("hidden");
}

function openNightAction(p) {
  const roles = {
    mafia: "ღამის სამიზნე",
    don: "ღამის სამიზნე",
    doctor: "ვის დაიცავ?",
    sheriff: "ვის შეამოწმებ?",
    detective: "ვის გამოიკვლევ?",
    serial_killer: "ვის მოიშორებ?",
    yakuza: "ღამის სამიზნე",
    chogun: "ღამის სამიზნე",
    vigilante: "ერთჯერადი მოქმედება",
    maniac: "ვის დაბლოკავ?"
  };
  if (!roles[p.role]) return closeAction();
  $("actionTitle").textContent = roles[p.role];
  $("actionHelp").textContent = `შენი როლი: ${roleName(p.role)}`;
  const targets = currentRoom.players.filter(x => x.alive && (p.role === "doctor" || x.id !== p.id));
  renderTargets(targets, t => socket.emit("game:nightAction", { roomId: currentRoomId, targetId: t.id }, res => res.ok ? toast("ქმედება დაფიქსირდა") : toast(res.error || "ვერ შესრულდა")));
}

function renderTargets(targets, fn) {
  $("actionTargets").innerHTML = targets.map(t => `<button data-id="${t.id}">#${t.seat} · ID ${t.userId} · ${escapeHtml(t.nickname)}</button>`).join("");
  $("actionTargets").querySelectorAll("button").forEach(btn => {
    const t = targets.find(x => x.id === btn.dataset.id);
    btn.onclick = () => fn(t);
  });
  $("actionModal").classList.remove("hidden");
}

function closeAction(){ $("actionModal").classList.add("hidden"); }
$("closeActionModal").onclick = closeAction;

$("settingsBtn").onclick = () => $("settingsModal").classList.remove("hidden");
$("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
$("startGameBtn").onclick = () => socket.emit("game:start", { roomId: currentRoomId }, res => res?.ok ? toast("თამაში დაიწყო") : toast(res?.error || "ვერ დაიწყო"));
$("forceNightBtn").onclick = () => socket.emit("game:forcePhase", { roomId: currentRoomId, phase: "night" });
$("saveTimersBtn").onclick = () => socket.emit("room:settings", { roomId: currentRoomId, timers: readTimers() }, res => res?.ok ? toast("დროები შენახულია") : toast(res?.error || "ვერ შეინახა"));

function readTimers() {
  return {
    dayCommon: Number($("tCommon")?.value || 60),
    individual: Number($("tIndividual")?.value || 60),
    nomination: Number($("tNomination")?.value || 45),
    vote: Number($("tVote")?.value || 35),
    lastWords: Number($("tLastWords")?.value || 45),
    night: Number($("tNight")?.value || 45)
  };
}

function addEvent(ev) {
  if (currentRoom?.events) currentRoom.events.push(ev);
  renderEvents();
}

function renderEvents() {
  $("eventLog").innerHTML = (currentRoom?.events || []).slice(-30).reverse().map(e => `<div class="ev">${escapeHtml(e.text)}</div>`).join("");
}

$("chatFab").onclick = () => $("chatPanel").classList.toggle("hidden");
$("logFab").onclick = () => $("logPanel").classList.toggle("hidden");
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));
$("sendChatBtn").onclick = sendChat;
$("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

function sendChat() {
  const message = $("chatInput").value.trim();
  if (!message) return;
  socket.emit("chat:send", { roomId: currentRoomId, message }, res => {
    if (res.ok) $("chatInput").value = "";
  });
}

function addChat(m) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${m.seat ? "#" + m.seat + " · " : ""}${escapeHtml(m.nickname)}</b><br>${escapeHtml(m.message)}`;
  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function showPhase(title, text) {
  $("phaseBannerTitle").textContent = title;
  $("phaseBannerText").textContent = text || "";
  $("phaseBanner").classList.remove("hidden");
  setTimeout(() => $("phaseBanner").classList.add("hidden"), 3600);
}

function phaseHelp(p) {
  return ({
    role_reveal: "შეამოწმე შენი როლი.",
    night: "ღამის როლებმა აირჩიონ მოქმედება.",
    day_common: "ყველა საუბრობს საერთო დროს.",
    day_individual: "თითო მოთამაშე გამოდის რიგით.",
    nomination: "დაასახელე კანდიდატი.",
    vote: "მიეცი ხმა კანდიდატს.",
    last_words: "გამორჩეულის ბოლო სიტყვა.",
    game_over: "თამაში დასრულდა."
  })[p] || "";
}

function fmt(sec) {
  sec = Math.max(0, Number(sec || 0));
  return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function roleName(r) {
  return ({
    citizen:"მოქალაქე", mafia:"მაფია", don:"დონი", sheriff:"შერიფი", doctor:"ექიმი", detective:"დეტექტივი",
    serial_killer:"მარტოხელა", yakuza:"აღმოსავლური გუნდი", chogun:"მხარდამჭერი", vigilante:"მსროლელი", maniac:"დამბლოკავი"
  })[r] || r;
}

$("leaveBtn").onclick = () => location.reload();

boot();
