function setupSpectatorMode() {
  $("spectator-btn").addEventListener("click", () => startSpectator());
}

async function startSpectator(roomFromList) {
  currentRoom = roomFromList || $("room-id").value.trim();

  if (!currentRoom) {
    alert("ჩაწერე ოთახის ID, მაგალითად 123");
    return;
  }

  isSpectator = true;
  playSFX();

  try {
    localStream = new MediaStream();

    document.body.classList.add("game-active");
    $("rooms-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    $("host-panel").classList.add("hidden");

    $("my-role-card").classList.remove("hidden");
    $("my-role-card").innerText = "სტატუსი: SPECTATOR";
    $("my-role-card").style.color = "var(--blue)";

    $("mic-btn").style.display = "none";
    $("cam-btn").style.display = "none";

    socket.emit("join-room", currentRoom, myNick, true);
  } catch (err) {
    console.error(err);
    alert("spectator რეჟიმში შესვლა ვერ მოხერხდა");
  }
}

function renderSpectatorList() {
  const box = $("spectator-list");
  if (!box) return;

  if (!spectators.length) {
    box.innerHTML = `<div class="spectator-item">ჯერ არავინ უყურებს</div>`;
    return;
  }

  box.innerHTML = "";

  spectators.forEach(s => {
    box.innerHTML += `<div class="spectator-item">👁️ ${escapeHtml(s.name)}</div>`;
  });
}

socket.on("spectators-update", list => {
  spectators = list || [];
  renderSpectatorList();
});
