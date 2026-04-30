const socket = io();

let myNick = "";
let currentRoom = "";
let isSpectator = false;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return text
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

  $("rooms-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");

  $("my-role-card").classList.remove("hidden");

  if (spectator) {
    $("my-role-card").innerText = "სტატუსი: 👁️ SPECTATOR";
    $("my-role-card").style.color = "var(--blue)";

    $("mic-btn").style.display = "none";
    $("cam-btn").style.display = "none";
  } else {
    $("my-role-card").innerText = "მოთამაშე";
    $("mic-btn").style.display = "inline-block";
    $("cam-btn").style.display = "inline-block";
  }
}

/* ------------------ SPECTATOR LIST ------------------ */

let spectators = [];

function renderSpectatorList() {
  const box = $("spectator-list");
  if (!box) return;

  if (!spectators.length) {
    box.innerHTML = `<div class="spectator-item">ჯერ არავინ უყურებს</div>`;
    return;
  }

  box.innerHTML = "";

  spectators.forEach(s => {
    box.innerHTML += `
      <div class="spectator-item">
        👁️ ${escapeHtml(s.name)}
      </div>
    `;
  });
}

socket.on("spectators-update", list => {
  spectators = list || [];
  renderSpectatorList();
});

/* ------------------ CHAT ------------------ */

function setupChat() {
  $("chat-send").addEventListener("click", sendMessage);

  $("chat-input").addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
}

function sendMessage() {
  const input = $("chat-input");
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

  box.innerHTML += `
    <div><b>${escapeHtml(msg.name)}:</b> ${escapeHtml(msg.text)}</div>
  `;

  box.scrollTop = box.scrollHeight;
});

/* ------------------ GAME STATE ------------------ */

socket.on("game-state", state => {
  console.log("[STATE]", state);
});

/* ------------------ PHASE TEXT ------------------ */

socket.on("phase-message", msg => {
  const box = $("phase-box");
  if (!box) return;

  box.innerText = msg;
});

/* ------------------ INIT ------------------ */

window.onload = () => {
  setupJoinRoom();
  setupSpectatorMode();
  setupChat();
};
