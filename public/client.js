const socket = io();

let myNick = "";
let currentRoom = "";
let isSpectator = false;
let isHost = false;

let spectators = [];
let latestPlayers = [];
let latestSpectators = [];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ------------------ JOIN AS PLAYER ------------------ */

function setupJoinRoom() {
  $("join-btn").addEventListener("click", () => {
    const room = $("room-id").value.trim();
    const nick = $("nick").value.trim();

    if (!room) return alert("შეიყვანე ოთახის ID");
    if (!nick) return alert("შეიყვანე სახელი");

    currentRoom = room;
    myNick = nick;
    isSpectator = false;

    enterGameUI(false);

    socket.emit("join-room", currentRoom, myNick, false);
  });
}

/* ------------------ SPECTATOR MODE ------------------ */

function setupSpectatorMode() {
  $("spectator-btn").addEventListener("click", () => {
    const room = $("room-id").value.trim();
    const nick = $("nick").value.trim();

    if (!room) return alert("შეიყვანე ოთახის ID");
    if (!nick) return alert("შეიყვანე სახელი");

    currentRoom = room;
    myNick = nick;
    isSpectator = true;

    enterGameUI(true);

    socket.emit("join-room", currentRoom, myNick, true);
  });
}

/* ------------------ UI SWITCH ------------------ */

function enterGameUI(spectator) {
  document.body.classList.add("game-active");

  $("rooms-screen")?.classList.add("hidden");
  $("game-screen")?.classList.remove("hidden");
  $("my-role-card")?.classList.remove("hidden");

  if (spectator) {
    $("my-role-card").innerText = "სტატუსი: 👁️ SPECTATOR";
    $("my-role-card").style.color = "var(--blue)";

    if ($("mic-btn")) $("mic-btn").style.display = "none";
    if ($("cam-btn")) $("cam-btn").style.display = "none";
    if ($("host-panel")) $("host-panel").classList.add("hidden");
  } else {
    $("my-role-card").innerText = "მოთამაშე";

    if ($("mic-btn")) $("mic-btn").style.display = "inline-block";
    if ($("cam-btn")) $("cam-btn").style.display = "inline-block";
  }
}

/* ------------------ SPECTATOR LIST ------------------ */

function renderSpectatorList() {
  const box = $("spectator-list");
  if (!box) return;

  if (!spectators.length) {
    box.innerHTML = `<div class="spectator-item">ჯერ არავინ უყურებს</div>`;
    return;
  }

  box.innerHTML = spectators.map(s => `
    <div class="spectator-item">
      👁️ ${escapeHtml(s.name)}
    </div>
  `).join("");
}

socket.on("spectators-update", list => {
  spectators = list || [];
  latestSpectators = list || [];

  renderSpectatorList();
  renderAdminPanel();
});

/* ------------------ CHAT ------------------ */

function setupChat() {
  $("chat-send")?.addEventListener("click", sendMessage);

  $("chat-input")?.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
}

function sendMessage() {
  const input = $("chat-input");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  socket.emit("send-chat-msg", {
    room: currentRoom,
    text
  });

  input.value = "";
}

socket.on("receive-chat-msg", msg => {
  const box = $("chat-box");
  if (!box) return;

  box.innerHTML += `
    <div><b>${escapeHtml(msg.name)}:</b> ${escapeHtml(msg.text)}</div>
  `;

  box.scrollTop = box.scrollHeight;
});

/* ------------------ GAME STATE ------------------ */

socket.on("game-state", state => {
  console.log("[STATE]", state);

  latestPlayers = state.players || [];

  if (typeof renderPlayers === "function") {
    renderPlayers(state.players);
  }

  renderAdminPanel();
});

/* ------------------ PHASE TEXT ------------------ */

socket.on("phase-message", msg => {
  const box = $("phase-box");
  if (!box) return;

  box.innerText = msg;
});

/* ------------------ ADMIN PANEL ------------------ */

socket.on("is-host", () => {
  isHost = true;

  $("host-panel")?.classList.remove("hidden");
  $("admin-toggle-btn")?.classList.remove("hidden");
  $("admin-panel")?.classList.remove("hidden");

  renderAdminPanel();
});

socket.on("remove-host", () => {
  isHost = false;

  $("host-panel")?.classList.add("hidden");
  $("admin-toggle-btn")?.classList.add("hidden");
  $("admin-panel")?.classList.add("hidden");
});

function setupAdminPanel() {
  const toggle = $("admin-toggle-btn");
  const panel = $("admin-panel");

  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("admin-open");
    });
  }

  $("admin-close-btn")?.addEventListener("click", () => {
    $("admin-panel")?.classList.remove("admin-open");
  });

  bindAdminButton("admin-start-game", () => {
    if (!isHost) return alert("მხოლოდ ადმინს შეუძლია.");

    socket.emit("start-game-request", {
      room: currentRoom,
      settings: getGameSettings()
    });
  });

  bindAdminButton("admin-end-game", () => adminAction("end-game"));
  bindAdminButton("admin-reset-game", () => adminAction("reset-game"));
  bindAdminButton("admin-lock-room", () => adminAction("lock-room"));
  bindAdminButton("admin-unlock-room", () => adminAction("unlock-room"));
  bindAdminButton("admin-clear-chat", () => adminAction("clear-chat"));

  bindAdminButton("admin-close-room", () => {
    if (confirm("ნამდვილად გინდა ოთახის დახურვა?")) {
      adminAction("close-room");
    }
  });

  bindAdminButton("admin-announce-btn", () => {
    const input = $("admin-announce-input");
    const message = input ? input.value.trim() : "";

    if (!message) return alert("ჩაწერე განცხადება");

    adminAction("announce", null, message);
    input.value = "";
  });
}

function bindAdminButton(id, fn) {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
}

function adminAction(action, targetId = null, message = "") {
  if (!isHost) return alert("მხოლოდ ადმინს შეუძლია.");

  socket.emit("admin-action", {
    room: currentRoom,
    action,
    targetId,
    message
  });
}

function getGameSettings() {
  return {
    mafia: $("mafia-count") ? $("mafia-count").value : 1,
    don: $("role-don") ? $("role-don").checked : false,
    doctor: $("role-doctor") ? $("role-doctor").checked : true,
    sheriff: $("role-sheriff") ? $("role-sheriff").checked : true
  };
}

function renderAdminPanel() {
  if (!isHost) return;

  const playersBox = $("admin-players-list");
  const spectatorsBox = $("admin-spectators-list");

  if (playersBox) {
    if (!latestPlayers.length) {
      playersBox.innerHTML = `<div class="admin-empty">მოთამაშეები არ არიან</div>`;
    } else {
      playersBox.innerHTML = latestPlayers.map(p => `
        <div class="admin-user-row">
          <span>
            #${p.index} ${escapeHtml(p.name)}
            ${p.alive ? "" : "<small>(dead)</small>"}
          </span>

          <div class="admin-user-actions">
            <button onclick="adminAction('kick', '${p.id}')">Kick</button>
            <button onclick="adminAction('make-host', '${p.id}')">Make Host</button>
          </div>
        </div>
      `).join("");
    }
  }

  if (spectatorsBox) {
    if (!latestSpectators.length) {
      spectatorsBox.innerHTML = `<div class="admin-empty">spectator არ არის</div>`;
    } else {
      spectatorsBox.innerHTML = latestSpectators.map(s => `
        <div class="admin-user-row">
          <span>👁️ ${escapeHtml(s.name)}</span>

          <div class="admin-user-actions">
            <button onclick="adminAction('kick', '${s.id}')">Kick</button>
          </div>
        </div>
      `).join("");
    }
  }
}

/* ------------------ ADMIN EVENTS ------------------ */

socket.on("kicked", msg => {
  alert(msg);
  location.reload();
});

socket.on("room-closed", msg => {
  alert(msg);
  location.reload();
});

socket.on("clear-chat", () => {
  const box = $("chat-box");
  if (box) box.innerHTML = "";
});

socket.on("admin-announcement", data => {
  alert("ADMIN: " + data.message);

  const box = $("chat-box");
  if (!box) return;

  box.innerHTML += `
    <div class="admin-chat-announcement">
      <b>ADMIN:</b> ${escapeHtml(data.message)}
    </div>
  `;

  box.scrollTop = box.scrollHeight;
});

/* ------------------ ROLE EVENTS ------------------ */

socket.on("assign-role", role => {
  const card = $("my-role-card");
  if (!card) return;

  if (!role) {
    card.innerText = "მოთამაშე";
    return;
  }

  card.innerText = `შენი როლი: ${role.toUpperCase()}`;
});

socket.on("mafia-list", mafiaIds => {
  console.log("[MAFIA LIST]", mafiaIds);
});

socket.on("sheriff-result", data => {
  alert(`${data.name} არის ${data.isMafia ? "მაფია" : "არა მაფია"}`);
});

socket.on("game-over", data => {
  alert(data.message || "თამაში დასრულდა");
});

/* ------------------ ERROR ------------------ */

socket.on("error", err => {
  alert(err?.msg || "შეცდომა მოხდა");
});

/* ------------------ INIT ------------------ */

window.onload = () => {
  setupJoinRoom();
  setupSpectatorMode();
  setupChat();
  setupAdminPanel();
};
