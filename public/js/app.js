function initAuth() {
  $("quickNick").value = localStorage.getItem("voidNick") || "";
  renderAvatars();

  $("tabQuick").onclick = () => {
    $("quickForm").classList.remove("hidden");
    $("emailForm").classList.add("hidden");
    $("tabQuick").classList.add("active");
    $("tabEmail").classList.remove("active");
  };

  $("tabEmail").onclick = () => {
    $("emailForm").classList.remove("hidden");
    $("quickForm").classList.add("hidden");
    $("tabEmail").classList.add("active");
    $("tabQuick").classList.remove("active");
  };

  $("quickLogin").onclick = async () => {
    const nick = $("quickNick").value.trim();
    if (!nick) return toast("ჩაწერე ნიკნეიმი");
    try {
      await loginGuest(nick, App.selectedAvatar);
    } catch (err) {
      toast(err.message);
    }
  };

  $("requestCode").onclick = async () => {
    const res = await apiPost("/api/auth/request-code", {
      nickname: $("emailNick").value.trim(),
      email: $("emailAddress").value.trim(),
      password: $("emailPassword").value,
      avatar: App.selectedAvatar
    });
    if (!res.ok) return toast(res.error || "კოდი ვერ გაიგზავნა");
    $("codeBox").classList.remove("hidden");
    toast(res.devCode ? `DEV CODE: ${res.devCode}` : "კოდი გაიგზავნა");
  };

  $("confirmCode").onclick = async () => {
    const res = await apiPost("/api/auth/verify-code", {
      email: $("emailAddress").value.trim(),
      code: $("verifyCode").value.trim()
    });
    if (!res.ok) return toast(res.error || "ვერ დადასტურდა");
    App.user = res.user;
    persistUser(res.user);
    updateUserUi();
    screen("app");
    await loadRooms();
    await refreshStatsPages();
  };

  const savedId = localStorage.getItem("voidUserId");
  const savedNick = localStorage.getItem("voidNick");
  if (savedId && savedNick) loginGuest(savedNick, App.selectedAvatar).catch(() => {});
}

function renderAvatars() {
  $("avatarPicker").innerHTML = AvatarOptions.map(a => `<button class="avatar-choice ${a === App.selectedAvatar ? "active" : ""}" data-a="${a}">${a}</button>`).join("");
  document.querySelectorAll(".avatar-choice").forEach(btn => btn.onclick = () => {
    App.selectedAvatar = btn.dataset.a;
    localStorage.setItem("voidAvatar", App.selectedAvatar);
    renderAvatars();
  });
}

function persistUser(user) {
  localStorage.setItem("voidUserId", user.userId);
  localStorage.setItem("voidNick", user.nickname);
  localStorage.setItem("voidAvatar", user.avatar || "◆");
}

function updateUserUi() {
  if (!App.user) return;
  $("userLine").textContent = `ID ${App.user.userId} · ${App.user.nickname}`;
  $("drawerAvatar").textContent = App.user.avatar || "◆";
  $("drawerName").textContent = App.user.nickname || "Player";
  $("drawerUserId").textContent = `ID ${App.user.userId}`;
  $("profileAvatar").textContent = App.user.avatar || "◆";
  $("profileName").textContent = App.user.nickname || "Player";
  $("profileId").textContent = `ID ${App.user.userId}`;
  $("pLevel").textContent = App.user.level || 1;
  $("pXp").textContent = App.user.xp || 0;
  $("pWins").textContent = App.user.wins || 0;
  $("pMvp").textContent = App.user.mvp || 0;
}

function initLobby() {
  renderRoleGrid();

  $("refreshBtn").onclick = loadRooms;
  $("roomSearch").oninput = renderRooms;
  $("roomFilter").onchange = () => { App.ui.roomFilter = $("roomFilter").value; renderRooms(); };
  $("createRoom").onclick = createRoom;

  $("drawerBtn").onclick = () => $("drawer").classList.remove("hidden");
  $("drawerClose").onclick = () => $("drawer").classList.add("hidden");

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.onclick = () => {
      setPage(btn.dataset.page);
      if (btn.dataset.page === "Stats" || btn.dataset.page === "Clans") refreshStatsPages();
    };
  });

  $("createClan").onclick = async () => {
    const name = $("clanName").value.trim();
    if (!name) return toast("ჩაწერე კლანის სახელი");
    const res = await apiPost("/api/clans", { name, user: App.user });
    if (!res.ok) return toast(res.error || "კლანი ვერ შეიქმნა");
    toast("კლანი შეიქმნა");
    $("clanName").value = "";
    refreshStatsPages();
  };
}

function renderRoleGrid() {
  $("roleGrid").innerHTML = RoleOptions.map(([key, label]) => `
    <label><input type="checkbox" id="role_${key}" ${["don","sheriff","doctor"].includes(key) ? "checked" : ""}> ${label}</label>
  `).join("");
}

function readRoomSettings() {
  const roles = { mafia: Number($("mafiaCount").value || 1) };
  RoleOptions.forEach(([key]) => roles[key] = !!$(`role_${key}`)?.checked);
  return {
    maxPlayers: Number($("maxPlayers").value || 10),
    roles,
    timers: {
      dayCommon: Number($("tCommon").value || 60),
      individual: Number($("tIndividual").value || 60),
      nomination: Number($("tNomination").value || 45),
      vote: Number($("tVote").value || 35),
      lastWords: Number($("tLastWords").value || 45),
      night: Number($("tNight").value || 45)
    }
  };
}

function renderRooms() {
  const q = $("roomSearch").value.trim().toLowerCase();
  const filter = App.ui.roomFilter;
  let list = App.rooms;
  if (filter !== "all") list = list.filter(r => r.status === filter);
  if (q) list = list.filter(r => String(r.code).includes(q) || String(r.name).toLowerCase().includes(q) || String(r.hostName).toLowerCase().includes(q));

  $("roomsCount").textContent = list.length;
  $("roomsList").innerHTML = list.length ? list.map(r => `
    <article class="room-card">
      <div class="room-title">
        <div>
          <h3>${escapeHtml(r.name)}</h3>
          <p>${escapeHtml(r.hostAvatar || "◆")} ჰოსტი: ${escapeHtml(r.hostName || "Unknown")} · #${r.code}</p>
        </div>
        <span class="badge ${r.status === "live" ? "live" : ""}">${r.status === "live" ? "LIVE" : "OPEN"}</span>
      </div>
      <div class="room-meta">
        <span class="badge">${escapeHtml(r.phaseLabel)}</span>
        <span class="badge">${r.players}/${r.maxPlayers}</span>
        <span class="badge">ცოცხალი ${r.alive}</span>
        <span class="badge">Level ${r.avgLevel}</span>
        <span class="badge">${r.activeMinutes} წთ</span>
      </div>
      <div class="room-actions">
        <button onclick="joinRoom('${r.id}', false)" ${r.status === "live" ? "disabled" : ""}>შესვლა</button>
        <button onclick="joinRoom('${r.id}', true)">ყურება</button>
      </div>
    </article>
  `).join("") : `<article class="room-card"><h3>მაგიდები ჯერ არ არის</h3><p>შექმენი ახალი მაგიდა.</p></article>`;
}

function initGame() {
  $("leaveGame").onclick = () => location.reload();
  $("roomSettingsBtn").onclick = openSettings;
  $("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
  $("closeAction").onclick = () => $("actionModal").classList.add("hidden");
  $("chatBtn").onclick = () => $("chatPanel").classList.toggle("hidden");
  $("logBtn").onclick = () => $("logPanel").classList.toggle("hidden");
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));

  $("sendChat").onclick = sendChat;
  $("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  $("startGame").onclick = () => emit("game:start", { roomId: App.currentRoomId, userId: App.user.userId }).then(r => r?.ok ? toast("თამაში დაიწყო") : toast(r?.error || "ვერ დაიწყო"));
  $("lockRoom").onclick = () => emit("room:settings", { roomId: App.currentRoomId, userId: App.user.userId, settings: { locked: true } }).then(r => r?.ok ? toast("მაგიდა დაიხურა") : toast(r?.error || "ვერ შესრულდა"));
  $("saveSettings").onclick = saveSettings;

  $("enableAudio").onclick = () => {
    Sound.ensure();
    toast("ხმა ჩაირთო");
  };
}

function openSettings() {
  const t = App.currentRoom?.settings?.timers || {};
  $("setCommon").value = t.dayCommon || 60;
  $("setIndividual").value = t.individual || 60;
  $("setNomination").value = t.nomination || 45;
  $("setVote").value = t.vote || 35;
  $("setLastWords").value = t.lastWords || 45;
  $("setNight").value = t.night || 45;
  $("settingsModal").classList.remove("hidden");
}

function saveSettings() {
  emit("room:settings", {
    roomId: App.currentRoomId,
    userId: App.user.userId,
    settings: {
      timers: {
        dayCommon: Number($("setCommon").value || 60),
        individual: Number($("setIndividual").value || 60),
        nomination: Number($("setNomination").value || 45),
        vote: Number($("setVote").value || 35),
        lastWords: Number($("setLastWords").value || 45),
        night: Number($("setNight").value || 45)
      }
    }
  }).then(r => r?.ok ? toast("შენახულია") : toast(r?.error || "ვერ შეინახა"));
}

function sendChat() {
  const message = $("chatInput").value.trim();
  if (!message) return;
  emit("chat:send", { roomId: App.currentRoomId, message }).then(r => {
    if (r?.ok) $("chatInput").value = "";
  });
}

initAuth();
initLobby();
initGame();
