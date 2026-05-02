async function ensureMedia() {
  if (App.localStream) return App.localStream;

  try {
    App.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const audioTrack = App.localStream.getAudioTracks()?.[0];
    const videoTrack = App.localStream.getVideoTracks()?.[0];

    App.micOn = audioTrack ? audioTrack.enabled : false;
    App.cameraOn = videoTrack ? videoTrack.enabled : false;
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
  const players = getRoomPlayers(room);

  $("phaseName").textContent = waiting ? "მოლოდინი" : (room.phaseLabel || room.phase);
  $("phaseInfo").textContent = waiting
    ? `ლობი · ${players.length}/${getMaxPlayers(room)}`
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
  renderLog();
  renderChatPanel(room);

  if (!waiting) {
    renderVideoGrid();
    maybeAction();
  } else {
    closeAction();
  }

  if (room.gameOver) {
    showOverlay("თამაში დასრულდა", room.gameOver.label);
  }
}

function getRoomPlayers(room) {
  if (!room) return [];
  if (Array.isArray(room.players)) return room.players;
  if (Array.isArray(room.seats)) return room.seats;
  if (Array.isArray(room.members)) return room.members;
  return [];
}

function getMaxPlayers(room) {
  return Number(
    room?.settings?.maxPlayers ||
    room?.maxPlayers ||
    room?.settings?.players ||
    0
  );
}

function renderLobby(room, host) {
  const roomName = $("lobbyRoomName");
  const roomInfo = $("lobbyRoomInfo");
  const playersCount = $("lobbyPlayersCount");
  const playersBox = $("lobbyPlayers");

  const lobbyStartBtn = $("lobbyStartBtn");
  const lobbyRolesBtn = $("lobbyRolesBtn");
  const lobbySettingsBtn = $("lobbySettingsBtn");

  if (!room) return;

  const players = getRoomPlayers(room);
  const maxPlayers = getMaxPlayers(room);

  if (roomName) {
    roomName.textContent = room.name || "VOID TABLE";
  }

  if (roomInfo) {
    roomInfo.textContent = `მოლოდინი · ჰოსტი: ${room.hostName || "#1"} · კოდი: ${room.id || "-"}`;
  }

  if (playersCount) {
    playersCount.textContent = `${players.length}/${maxPlayers || players.length}`;
  }

  if (lobbyStartBtn) lobbyStartBtn.classList.toggle("hidden", !host);
  if (lobbyRolesBtn) lobbyRolesBtn.classList.toggle("hidden", !host);
  if (lobbySettingsBtn) lobbySettingsBtn.classList.toggle("hidden", !host);

  if (!playersBox) return;

  if (!players.length) {
    playersBox.innerHTML = `<div class="lobby-empty">მოთამაშეები ჯერ არ ჩანს. სცადე refresh ან ხელახლა შესვლა.</div>`;
    return;
  }

  playersBox.innerHTML = players.map(player => {
    const isMe = String(player.userId) === String(App.user?.userId);
    const isHost = Number(player.seat) === 1;

    const micOn = player.micOn !== false;
    const camOn = player.cameraOn !== false;

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

            ${
              isMe
                ? `
                  <div class="lobby-player-actions">
                    <button id="lobbyMicBtn" class="${micOn ? "" : "off"}">${micOn ? "MIC ON" : "MIC OFF"}</button>
                    <button id="lobbyCamBtn" class="${camOn ? "" : "off"}">${camOn ? "CAM ON" : "CAM OFF"}</button>
                  </div>
                `
                : ""
            }
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

  if ($("lobbyMicBtn")) $("lobbyMicBtn").onclick = toggleMic;
  if ($("lobbyCamBtn")) $("lobbyCamBtn").onclick = toggleCam;
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

  const players = getRoomPlayers(room);

  $("videoGrid").innerHTML = players.map(p => {
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
  const players = getRoomPlayers(App.currentRoom);
  return players.find(p => String(p.userId) === String(App.user?.userId));
}

async function toggleMic() {
  await ensureMedia();

  const track = App.localStream?.getAudioTracks()?.[0];
  if (!track) return;

  track.enabled = !track.enabled;
  App.micOn = track.enabled;

  App.socket.emit("media:state", {
    roomId: App.currentRoomId,
    micOn: track.enabled
  });

  renderGame();
}

async function toggleCam() {
  await ensureMedia();

  const track = App.localStream?.getVideoTracks()?.[0];
  if (!track) return;

  track.enabled = !track.enabled;
  App.cameraOn = track.enabled;

  App.socket.emit("media:state", {
    roomId: App.currentRoomId,
    cameraOn: track.enabled
  });

  renderGame();
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

  const targets = getRoomPlayers(room).filter(x => x.alive && x.id !== p.id);

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

  const players = getRoomPlayers(room);
  const candidates = players.filter(x => room.nominatedIds.includes(x.id));

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
  const targets = getRoomPlayers(room).filter(x => x.alive && (canSelf || x.id !== p.id));

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

  $("actionModal").classList.remove("hidden");
}

function closeAction() {
  if ($("actionModal")) $("actionModal").classList.add("hidden");
}

function showActionResult(res) {
  if (res?.ok) toast("დაფიქსირდა");
  else toast(res?.error || "ვერ შესრულდა");
}

function renderLog() {
  const events = App.currentRoom?.events || [];
  if (!$("logMessages")) return;

  $("logMessages").innerHTML = events
    .slice(-50)
    .reverse()
    .map(e => `<div class="event">${escapeHtml(e.text)}</div>`)
    .join("");
}

function renderChatPanel(room) {
  if (!$("chatMessages")) return;

  $("chatMessages").innerHTML = (room?.chat || []).slice(-80).map(msg => {
    return `
      <div class="msg">
        <b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtml(msg.nickname || "Player")}</b><br>
        ${escapeHtml(msg.message || "")}
      </div>
    `;
  }).join("");

  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function addChat(msg) {
  if (!$("chatMessages")) return;

  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `
    <b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtml(msg.nickname)}</b><br>
    ${escapeHtml(msg.message)}
  `;

  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function phaseHelp(phase) {
  return ({
    waiting: "მოთამაშეების მოლოდინი.",
    role_reveal: "შეამოწმე შენი როლი.",
    night: "ღამის როლებმა აირჩიონ მოქმედება.",
    night_result: "ღამის შედეგი.",
    day_common: "საერთო განხილვა.",
    day_individual: "თითო მოთამაშე საუბრობს.",
    nomination: "დაასახელე კანდიდატი.",
    vote: "ხმის მიცემის დროა.",
    vote_result: "ხმის შედეგი.",
    last_words: "ბოლო სიტყვა."
  })[phase] || "";
}

function openSettingsModal() {
  const room = App.currentRoom;
  if (!room) return;

  fillSettingsModal(room);

  if ($("settingsModal")) {
    $("settingsModal").classList.remove("hidden");
  }
}

function fillSettingsModal(room) {
  if (!room || !$("settingsModal")) return;

  const settings = room.settings || {};
  const timers = settings.timers || settings || {};
  const roles = settings.roles || {};

  setInputValue("setCommon", timers.common ?? timers.discussionTime ?? timers.roundTime ?? 60);
  setInputValue("setIndividual", timers.individual ?? timers.individualTime ?? 60);
  setInputValue("setNomination", timers.nomination ?? timers.nominationTime ?? 45);
  setInputValue("setVote", timers.vote ?? timers.votingTime ?? 35);
  setInputValue("setLastWords", timers.lastWords ?? timers.lastWordsTime ?? 45);
  setInputValue("setNight", timers.night ?? timers.nightTime ?? 45);

  setInputValue("setRoleMafia", roles.mafia ?? settings.mafiaCount ?? 1);
  setInputValue("setRoleDon", roles.don ?? 0);
  setInputValue("setRoleDoctor", roles.doctor ?? 1);
  setInputValue("setRoleSheriff", roles.sheriff ?? 1);
  setInputValue("setRoleDetective", roles.detective ?? 0);
  setInputValue("setRoleCitizen", roles.citizen ?? Math.max(0, Number(settings.maxPlayers || 10) - 3));
}

function setInputValue(id, value) {
  const el = $(id);
  if (el && (el.value === "" || document.activeElement !== el)) {
    el.value = value;
  }
}

function collectSettingsFromModal() {
  return {
    timers: {
      common: Number($("setCommon")?.value || 60),
      individual: Number($("setIndividual")?.value || 60),
      nomination: Number($("setNomination")?.value || 45),
      vote: Number($("setVote")?.value || 35),
      lastWords: Number($("setLastWords")?.value || 45),
      night: Number($("setNight")?.value || 45)
    },
    roles: {
      mafia: Number($("setRoleMafia")?.value || 0),
      don: Number($("setRoleDon")?.value || 0),
      doctor: Number($("setRoleDoctor")?.value || 0),
      sheriff: Number($("setRoleSheriff")?.value || 0),
      detective: Number($("setRoleDetective")?.value || 0),
      citizen: Number($("setRoleCitizen")?.value || 0)
    }
  };
}

function saveRoomSettings() {
  const room = App.currentRoom;
  const user = App.user;

  if (!room || !user) return;

  emit("room:settings", {
    roomId: room.id,
    userId: user.userId,
    settings: collectSettingsFromModal()
  }).then(res => {
    if (!res?.ok) {
      toast(res?.error || "შენახვა ვერ მოხერხდა");
      return;
    }

    toast("შენახულია");
    $("settingsModal")?.classList.add("hidden");
  });
}

function startCurrentRoom() {
  const room = App.currentRoom;
  const user = App.user;

  if (!room || !user) return;

  emit("game:start", {
    roomId: room.id,
    userId: user.userId
  }).then(res => {
    if (!res?.ok) {
      toast(res?.error || "თამაშის დაწყება ვერ მოხერხდა");
    }
  });
}

function sendRoomChat() {
  const input = $("chatInput") || $("lobbyChatInput");
  const message = input?.value?.trim();

  if (!message || !App.currentRoom) return;

  emit("chat:send", {
    roomId: App.currentRoom.id,
    message
  }).then(res => {
    if (!res?.ok) {
      toast(res?.error || "მესიჯი ვერ გაიგზავნა");
      return;
    }

    input.value = "";
  });
}

function openChatPanel() {
  $("chatPanel")?.classList.remove("hidden");
  renderChatPanel(App.currentRoom);
}

function openLogPanel() {
  $("logPanel")?.classList.remove("hidden");
  renderLog();
}

function bindGameUiOnce() {
  if (window.__voidGameUiBound) return;
  window.__voidGameUiBound = true;

  $("lobbyStartBtn")?.addEventListener("click", startCurrentRoom);
  $("startGame")?.addEventListener("click", startCurrentRoom);

  $("lobbySettingsBtn")?.addEventListener("click", openSettingsModal);
  $("lobbyRolesBtn")?.addEventListener("click", openSettingsModal);
  $("roomSettingsBtn")?.addEventListener("click", openSettingsModal);

  $("saveSettings")?.addEventListener("click", saveRoomSettings);

  $("sendChat")?.addEventListener("click", sendRoomChat);
  $("lobbySendChat")?.addEventListener("click", sendRoomChat);

  $("chatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendRoomChat();
  });

  $("lobbyChatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendRoomChat();
  });

  $("chatBtn")?.addEventListener("click", openChatPanel);
  $("logBtn")?.addEventListener("click", openLogPanel);

  $("closeSettings")?.addEventListener("click", () => {
    $("settingsModal")?.classList.add("hidden");
  });

  $("closeAction")?.addEventListener("click", closeAction);

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-close");
      if (target && $(target)) $(target).classList.add("hidden");
    });
  });
}

bindGameUiOnce();
