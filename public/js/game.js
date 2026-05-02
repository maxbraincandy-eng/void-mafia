async function ensureMedia() {
  if (App.localStream) return App.localStream;

  try {
    App.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
  } catch (err) {
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }

  return App.localStream;
}

function renderGame() {
  const room = App.currentRoom;
  if (!room) return;

  const waiting = room.phase === "waiting";
  const host = isRoomHost(room);

  $("phaseName").textContent = waiting ? "მოლოდინი" : (room.phaseLabel || room.phase);
  $("phaseInfo").textContent = waiting
    ? `ლობი · ${room.players?.length || 0}/${room.settings?.maxPlayers || 0}`
    : `დღე ${room.day || 0} · ცოცხალი ${room.alive || 0}`;

  $("timer").textContent = waiting ? "00:00" : fmt(room.timer || 0);

  if ($("roomSettingsBtn")) {
    $("roomSettingsBtn").style.display = host ? "inline-flex" : "none";
  }

  if ($("lobbyView")) {
    $("lobbyView").classList.toggle("hidden", !waiting);
  }

  if ($("videoGrid")) {
    $("videoGrid").classList.toggle("hidden", waiting);
  }

  if ($("actionButton")) {
    $("actionButton").classList.toggle("hidden", waiting);
  }

  renderLobby(room, host);
  fillSettingsModal(room);

  if (!waiting) {
    renderVideoGrid();
    renderLog();
    maybeAction();
  } else {
    renderLog();
    closeAction();
  }

  if (room.gameOver) {
    showOverlay("თამაში დასრულდა", room.gameOver.label);
  }
}

function renderLobby(room, host) {
  const roomName = $("lobbyRoomName");
  const roomInfo = $("lobbyRoomInfo");
  const playersCount = $("lobbyPlayersCount");
  const playersBox = $("lobbyPlayers");
  const lobbyChatMessages = $("lobbyChatMessages");

  const lobbyStartBtn = $("lobbyStartBtn");
  const lobbyRolesBtn = $("lobbyRolesBtn");
  const lobbySettingsBtn = $("lobbySettingsBtn");

  if (!room) return;

  if (roomName) {
    roomName.textContent = room.name || "VOID TABLE";
  }

  if (roomInfo) {
    roomInfo.textContent = `მოლოდინი · ჰოსტი: ${room.hostName || "#1"} · კოდი: ${room.id || "-"}`;
  }

  if (playersCount) {
    playersCount.textContent = `${room.players?.length || 0}/${room.settings?.maxPlayers || 0}`;
  }

  if (lobbyStartBtn) lobbyStartBtn.classList.toggle("hidden", !host);
  if (lobbyRolesBtn) lobbyRolesBtn.classList.toggle("hidden", !host);
  if (lobbySettingsBtn) lobbySettingsBtn.classList.toggle("hidden", !host);

  if (playersBox) {
    playersBox.innerHTML = (room.players || []).map(player => {
      const isMe = String(player.userId) === String(App.user?.userId);
      const isHost = Number(player.seat) === 1;

      return `
        <div class="lobby-player">
          <div class="lobby-player-left">
            <div class="lobby-avatar">${escapeHtml(player.avatar || "◆")}</div>

            <div class="lobby-player-meta">
              <b>
                #${player.seat || "-"} · ${escapeHtml(player.nickname || "Player")}
                ${isMe ? " (you)" : ""}
              </b>
              <span>
                ID ${escapeHtml(player.userId || "-")}
                ${isHost ? " · HOST" : ""}
                ${player.connected === false ? " · offline" : " · online"}
              </span>
            </div>
          </div>

          <div class="lobby-player-right">
            <span class="badge ${player.connected === false ? "" : "live"}">
              ${player.connected === false ? "OFF" : "ON"}
            </span>
          </div>
        </div>
      `;
    }).join("");
  }

  if (lobbyChatMessages) {
    lobbyChatMessages.innerHTML = (room.chat || []).slice(-80).map(msg => {
      return `
        <div class="msg">
          <b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtml(msg.nickname || "Player")}</b><br>
          ${escapeHtml(msg.message || "")}
        </div>
      `;
    }).join("");

    lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;
  }
}

function isRoomHost(room) {
  const me = myPlayer();
  if (!room || !App.user) return false;

  if (me && Number(me.seat) === 1) return true;

  if (room.hostUserId && String(room.hostUserId) === String(App.user.userId)) {
    return true;
  }

  if (room.viewer?.isHost) return true;

  return false;
}

function renderVideoGrid() {
  const room = App.currentRoom;
  if (!room) return;

  $("videoGrid").innerHTML = room.players.map(p => {
    const isMe = String(p.userId) === String(App.user.userId);
    const speaker = room.individualSpeakerId === p.id;

    return `
      <div class="tile ${p.alive ? "" : "dead"} ${speaker ? "speaker" : ""}">
        <div class="tile-avatar">${escapeHtml(p.avatar || "◆")}</div>
        <video id="vid_${p.id}" autoplay playsinline ${isMe ? "muted" : ""}></video>

        <div class="tile-controls">
          ${isMe ? `<button id="micBtn">MIC</button><button id="camBtn">CAM</button>` : ""}
        </div>

        <div class="seat">#${p.seat}</div>

        ${p.engineMuted ? `<div class="engine-muted">MUTED</div>` : ""}

        <div class="tile-name">
          ID ${escapeHtml(p.userId)} · ${escapeHtml(p.nickname)}
          ${p.role ? ` · ${roleLabel(p.role)}` : ""}
        </div>
      </div>
    `;
  }).join("");

  const me = myPlayer();

  if (me && App.localStream) {
    const v = $(`vid_${me.id}`);
    if (v) v.srcObject = App.localStream;
  }

  if ($("micBtn")) $("micBtn").onclick = toggleMic;
  if ($("camBtn")) $("camBtn").onclick = toggleCam;
}

function myPlayer() {
  return App.currentRoom?.players?.find(p => String(p.userId) === String(App.user?.userId));
}

function toggleMic() {
  const track = App.localStream?.getAudioTracks()?.[0];
  if (!track) return;

  track.enabled = !track.enabled;

  App.socket.emit("media:state", {
    roomId: App.currentRoomId,
    micOn: track.enabled
  });
}

function toggleCam() {
  const track = App.localStream?.getVideoTracks()?.[0];
  if (!track) return;

  track.enabled = !track.enabled;

  App.socket.emit("media:state", {
    roomId: App.currentRoomId,
    cameraOn: track.enabled
  });
}

function maybeAction() {
  const room = App.currentRoom;
  const p = myPlayer();

  if (!room || !p || !p.alive) return closeAction();

  if (room.phase === "waiting") return closeAction();
  if (room.phase === "nomination") return openNomination(room, p);
  if (room.phase === "vote") return openVote(room, p);
  if (room.phase === "night") return openNight(room, p);

  closeAction();
}

function openNomination(room, p) {
  $("actionTitle").textContent = "კანდიდატის დასახელება";
  $("actionText").textContent = "აირჩიე მოთამაშე, რომელიც ხმის მიცემაზე გადავა.";

  const targets = room.players.filter(x => x.alive && x.id !== p.id);

  renderTargets(targets, t => {
    emit("game:nominate", {
      roomId: room.id,
      targetId: t.id
    }).then(showActionResult);
  });
}

function openVote(room) {
  $("actionTitle").textContent = "ხმის მიცემა";
  $("actionText").textContent = "აირჩიე კანდიდატი ან თავი შეიკავე.";

  const candidates = room.players.filter(x => room.nominatedIds.includes(x.id));

  $("targets").innerHTML =
    candidates.map(t => `<button data-id="${t.id}">#${t.seat} · ${escapeHtml(t.nickname)}</button>`).join("") +
    `<button data-id="abstain">თავის შეკავება</button>`;

  $("targets").querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      emit("game:vote", {
        roomId: room.id,
        targetId: btn.dataset.id
      }).then(showActionResult);
    };
  });

  $("actionModal").classList.remove("hidden");
}

function openNight(room, p) {
  const map = {
    mafia: "ღამის სამიზნე",
    don: "ღამის სამიზნე",
    doctor: "დაცვა",
    sheriff: "შემოწმება",
    detective: "გამოძიება",
    serial_killer: "მარტოხელა მოქმედება",
    yakuza: "ღამის სამიზნე",
    chogun: "ღამის სამიზნე",
    vigilante: "მოქმედება",
    maniac: "დაბლოკვა",
    bodyguard: "მცველობა",
    journalist: "ჩანაწერი",
    lawyer: "დღის დაცვა"
  };

  if (!map[p.role]) return closeAction();

  $("actionTitle").textContent = map[p.role];
  $("actionText").textContent = `შენი როლი: ${roleLabel(p.role)}`;

  const canSelf = ["doctor", "bodyguard"].includes(p.role);
  const targets = room.players.filter(x => x.alive && (canSelf || x.id !== p.id));

  renderTargets(targets, t => {
    emit("game:nightAction", {
      roomId: room.id,
      targetId: t.id
    }).then(showActionResult);
  });
}

function renderTargets(targets, onClick) {
  $("targets").innerHTML = targets.map(t => {
    return `<button data-id="${t.id}">#${t.seat} · ID ${t.userId} · ${escapeHtml(t.nickname)}</button>`;
  }).join("");

  $("targets").querySelectorAll("button").forEach(btn => {
    const t = targets.find(x => String(x.id) === String(btn.dataset.id));
    btn.onclick = () => onClick(t);
  });

  $("actionModal").classList.remove("hidden
