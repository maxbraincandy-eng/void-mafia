async function ensureMedia() {
  if (App.localStream) return App.localStream;
  try {
    App.localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
  } catch (err) {
    toast("კამერა/მიკროფონი ვერ ჩაირთო");
  }
  return App.localStream;
}

function renderGame() {
  const room = App.currentRoom;
  if (!room) return;

  $("phaseName").textContent = room.phaseLabel || room.phase;
  $("phaseInfo").textContent = `დღე ${room.day || 0} · ცოცხალი ${room.alive}`;
  $("timer").textContent = fmt(room.timer || 0);
  $("roomSettingsBtn").style.display = room.viewer?.isHost ? "block" : "none";

  renderVideoGrid();
  renderLog();

  if (room.gameOver) showOverlay("თამაში დასრულდა", room.gameOver.label);
}

function renderVideoGrid() {
  const room = App.currentRoom;
  $("videoGrid").innerHTML = room.players.map(p => {
    const isMe = p.userId === App.user.userId;
    const speaker = room.individualSpeakerId === p.id;
    return `
      <div class="tile ${p.alive ? "" : "dead"} ${speaker ? "speaker" : ""}">
        <div class="tile-avatar">${escapeHtml(p.avatar || "◆")}</div>
        <video id="vid_${p.id}" autoplay playsinline muted="${isMe ? "true" : "false"}"></video>
        <div class="tile-controls">${isMe ? `<button id="micBtn">MIC</button><button id="camBtn">CAM</button>` : ""}</div>
        <div class="seat">#${p.seat}</div>
        ${p.engineMuted ? `<div class="engine-muted">MUTED</div>` : ""}
        <div class="tile-name">ID ${p.userId} · ${escapeHtml(p.nickname)}${p.role ? ` · ${roleLabel(p.role)}` : ""}</div>
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
  return App.currentRoom?.players?.find(p => p.userId === App.user?.userId);
}

function toggleMic() {
  const track = App.localStream?.getAudioTracks()?.[0];
  if (!track) return;
  track.enabled = !track.enabled;
  App.socket.emit("media:state", { roomId: App.currentRoomId, micOn: track.enabled });
}

function toggleCam() {
  const track = App.localStream?.getVideoTracks()?.[0];
  if (!track) return;
  track.enabled = !track.enabled;
  App.socket.emit("media:state", { roomId: App.currentRoomId, cameraOn: track.enabled });
}

function maybeAction() {
  const room = App.currentRoom;
  const p = myPlayer();
  if (!room || !p || !p.alive) return closeAction();

  if (room.phase === "nomination") return openNomination(room, p);
  if (room.phase === "vote") return openVote(room, p);
  if (room.phase === "night") return openNight(room, p);

  closeAction();
}

function openNomination(room, p) {
  $("actionTitle").textContent = "კანდიდატის დასახელება";
  $("actionText").textContent = "აირჩიე მოთამაშე, რომელიც ხმის მიცემაზე გადავა.";
  const targets = room.players.filter(x => x.alive && x.id !== p.id);
  renderTargets(targets, t => emit("game:nominate", { roomId: room.id, targetId: t.id }).then(showActionResult));
}

function openVote(room) {
  $("actionTitle").textContent = "ხმის მიცემა";
  $("actionText").textContent = "აირჩიე კანდიდატი ან თავი შეიკავე.";
  const candidates = room.players.filter(x => room.nominatedIds.includes(x.id));
  $("targets").innerHTML = candidates.map(t => `<button data-id="${t.id}">#${t.seat} · ${escapeHtml(t.nickname)}</button>`).join("") + `<button data-id="abstain">თავის შეკავება</button>`;
  $("targets").querySelectorAll("button").forEach(btn => {
    btn.onclick = () => emit("game:vote", { roomId: room.id, targetId: btn.dataset.id }).then(showActionResult);
  });
  $("actionModal").classList.remove("hidden");
}

function openNight(room, p) {
  const map = {
    mafia:"ღამის სამიზნე", don:"ღამის სამიზნე", doctor:"დაცვა", sheriff:"შემოწმება", detective:"გამოძიება",
    serial_killer:"მარტოხელა მოქმედება", yakuza:"ღამის სამიზნე", chogun:"ღამის სამიზნე", vigilante:"მოქმედება",
    maniac:"დაბლოკვა", bodyguard:"მცველობა", journalist:"ჩანაწერი", lawyer:"დღის დაცვა"
  };
  if (!map[p.role]) return closeAction();

  $("actionTitle").textContent = map[p.role];
  $("actionText").textContent = `შენი როლი: ${roleLabel(p.role)}`;
  const canSelf = ["doctor", "bodyguard"].includes(p.role);
  const targets = room.players.filter(x => x.alive && (canSelf || x.id !== p.id));
  renderTargets(targets, t => emit("game:nightAction", { roomId: room.id, targetId: t.id }).then(showActionResult));
}

function renderTargets(targets, onClick) {
  $("targets").innerHTML = targets.map(t => `<button data-id="${t.id}">#${t.seat} · ID ${t.userId} · ${escapeHtml(t.nickname)}</button>`).join("");
  $("targets").querySelectorAll("button").forEach(btn => {
    const t = targets.find(x => x.id === btn.dataset.id);
    btn.onclick = () => onClick(t);
  });
  $("actionModal").classList.remove("hidden");
}

function closeAction() {
  $("actionModal").classList.add("hidden");
}

function showActionResult(res) {
  if (res?.ok) toast("დაფიქსირდა");
  else toast(res?.error || "ვერ შესრულდა");
}

function renderLog() {
  const events = App.currentRoom?.events || [];
  $("logMessages").innerHTML = events.slice(-50).reverse().map(e => `<div class="event">${escapeHtml(e.text)}</div>`).join("");
}

function addChat(msg) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtml(msg.nickname)}</b><br>${escapeHtml(msg.message)}`;
  $("chatMessages").appendChild(div);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function phaseHelp(phase) {
  return ({
    role_reveal:"შეამოწმე შენი როლი.",
    night:"ღამის როლებმა აირჩიონ მოქმედება.",
    night_result:"ღამის შედეგი.",
    day_common:"საერთო განხილვა.",
    day_individual:"თითო მოთამაშე საუბრობს.",
    nomination:"დაასახელე კანდიდატი.",
    vote:"ხმის მიცემის დროა.",
    vote_result:"ხმის შედეგი.",
    last_words:"ბოლო სიტყვა."
  })[phase] || "";
}
