(() => {
  const socket = io({ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1200 });
  const $ = id => document.getElementById(id);
  const AVATARS = ["♛","◈","⬢","✦","☾","♞","☣","◆","🕶️","👑","💀","🐺"];
  const ROLE_ICONS = { citizen:"⚪", mafia:"🔴", don:"👑", sheriff:"⭐", doctor:"💊", detective:"🔎", serial_killer:"🗡", yakuza:"⚔", chogun:"🥷", vigilante:"⚖", maniac:"🎭" };
  const ACTION_ROLES = new Set(["mafia","don","doctor","sheriff","detective","serial_killer","yakuza","chogun","vigilante","maniac"]);
  let selectedAvatar = localStorage.getItem("voidAvatar") || "♛";
  let currentUser = null, currentRoom = "", latestState = null, me = null, myRole = null, activeChat = "main", chatOpen = false, unread = 0;
  let localStream = null, peers = {}, roomPlayers = new Map(), camOn = true, micOn = true;
  const toast = (text, type="info") => { const el=document.createElement("div"); el.className=`toast ${type}`; el.textContent=text; $("toastBox").appendChild(el); setTimeout(()=>el.remove(),3200); };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

  function renderAvatarPickers() {
    const render = (rootId, onPick) => {
      const root = $(rootId); if (!root) return;
      root.innerHTML = AVATARS.map(a => `<button class="avatar-choice ${a===selectedAvatar?'active':''}" data-avatar="${a}">${a}</button>`).join("");
      root.querySelectorAll("button").forEach(btn => btn.onclick = async () => {
        selectedAvatar = btn.dataset.avatar;
        localStorage.setItem("voidAvatar", selectedAvatar);
        $("authEmblem") && ($("authEmblem").textContent = selectedAvatar);
        renderAvatarPickers();
        if (onPick) await onPick(selectedAvatar);
      });
    };
    render("avatarRow");
    render("profileAvatarRow", async avatar => {
      if (!currentUser) return;
      const res = await fetch("/api/profile/avatar", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ avatar }) });
      const data = await res.json().catch(()=>({}));
      if (data.ok) { currentUser = data.user; applyUser(); toast("ავატარი შეიცვალა", "success"); }
    });
  }

  async function authFetch(url, body) {
    const res = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    return res.json();
  }
  async function loadMe() {
    renderAvatarPickers();
    const res = await fetch("/api/auth/me");
    const data = await res.json().catch(()=>({}));
    if (data.ok && data.user) enterApp(data.user); else showAuth();
  }
  function showAuth() { $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); $("game").classList.add("hidden"); }
  function enterApp(user) {
    currentUser = user;
    selectedAvatar = user.avatar || selectedAvatar;
    localStorage.setItem("voidUserId", String(user.userId));
    localStorage.setItem("voidAvatar", selectedAvatar);
    $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); $("game").classList.add("hidden");
    applyUser(); socket.emit("profile:init", user); socket.emit("rooms:get"); loadLeaderboard(); renderAvatarPickers();
  }
  function applyUser() {
    if (!currentUser) return;
    ["drawerAvatar","profileAvatar"].forEach(id => $(id) && ($(id).textContent = currentUser.avatar || "♛"));
    $("drawerName").textContent = currentUser.nickname || "---";
    $("drawerUserId").textContent = currentUser.userId || "---";
    $("drawerLevel").textContent = currentUser.level || 1;
    $("profileName").textContent = currentUser.nickname || "---";
    $("profileId").textContent = currentUser.userId || "---";
    $("profileLevel").textContent = currentUser.level || 1;
    $("profileXp").textContent = currentUser.xp || 0;
    $("profileKarma").textContent = currentUser.karma || 0;
    $("profileKills").textContent = currentUser.kills || 0;
    $("profileChecks").textContent = currentUser.checks || 0;
    $("stGames").textContent = currentUser.games || 0; $("stWins").textContent = currentUser.wins || 0; $("stMvp").textContent = currentUser.mvp || 0; $("stLevel").textContent = currentUser.level || 1;
    const pct = Math.min(100, ((currentUser.xp || 0) % 700) / 7); $("xpFill").style.width = `${pct}%`;
  }

  $("registerBtn")?.addEventListener("click", async () => {
    const data = await authFetch("/api/auth/register", { nickname: $("authNick").value, email: $("authEmail").value, password: $("authPassword").value, avatar: selectedAvatar });
    if (!data.ok) return toast(data.error || "რეგისტრაცია ვერ მოხერხდა", "error"); enterApp(data.user);
  });
  $("loginBtn")?.addEventListener("click", async () => {
    const data = await authFetch("/api/auth/login", { email: $("authEmail").value, password: $("authPassword").value });
    if (!data.ok) return toast(data.error || "შესვლა ვერ მოხერხდა", "error"); enterApp(data.user);
  });
  $("guestBtn")?.addEventListener("click", async () => {
    const nick = $("authNick").value || `Guest-${Math.floor(Math.random()*999)}`;
    const data = await authFetch("/api/auth/guest", { nickname: nick, avatar: selectedAvatar });
    if (!data.ok) return toast(data.error || "Guest ვერ შეიქმნა", "error"); enterApp(data.user);
  });
  $("googleBtn")?.addEventListener("click", () => location.href = "/auth/google");
  $("facebookBtn")?.addEventListener("click", () => location.href = "/auth/facebook");
  $("logoutBtn")?.addEventListener("click", async () => { await fetch("/api/auth/logout", { method:"POST" }); location.reload(); });

  document.querySelectorAll(".nav,[data-tab]").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  function switchTab(tab) {
    if (!tab) return;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    $("tab-"+tab)?.classList.add("active");
    document.querySelectorAll(".nav").forEach(n => n.classList.toggle("active", n.dataset.tab === tab));
    const titles = { tables:["მაგიდები","ცოცხალი ოთახები და სწრაფი შესვლა"], clans:["კლანები","გუნდები და რეიტინგი"], stats:["სტატისტიკა","სეზონი და ლიდერბორდი"], profile:["პროფილი","ID, ავატარი და მიღწევები"] };
    $("pageTitle").textContent = titles[tab]?.[0] || "VOID"; $("pageSub").textContent = titles[tab]?.[1] || "";
    closeDrawer(); if (tab === "stats") loadLeaderboard();
  }
  $("drawerBtn")?.addEventListener("click", () => { $("drawer").classList.add("open"); $("drawerBackdrop").classList.add("open"); });
  $("drawerBackdrop")?.addEventListener("click", closeDrawer);
  function closeDrawer(){ $("drawer")?.classList.remove("open"); $("drawerBackdrop")?.classList.remove("open"); }

  async function loadLeaderboard(){ const users = await fetch("/api/leaderboard").then(r=>r.json()).catch(()=>[]); $("leaderboard").innerHTML = users.map((u,i)=>`<div class="room-card"><div class="room-avatar">${esc(u.avatar)}</div><div><h4>#${i+1} ${esc(u.nickname)}</h4><p>ID ${u.userId} · Level ${u.level}</p><small>${u.xp} XP · ${u.wins} wins</small></div></div>`).join("") || `<p class="muted">ლიდერბორდი ჯერ ცარიელია.</p>`; }

  $("refreshRooms")?.addEventListener("click", () => socket.emit("rooms:get")); $("refreshFab")?.addEventListener("click", () => socket.emit("rooms:get"));
  $("joinRoom")?.addEventListener("click", () => joinRoom(false)); $("watchRoom")?.addEventListener("click", () => joinRoom(true));
  function roomSettingsFromForm(){ return { name: $("roomName").value, maxPlayers: Number($("maxPlayers").value || 10), spectator: $("allowSpectator").checked, private: $("privateRoom").checked }; }
  function joinRoom(spectator=false, codeOverride=null){ if(!currentUser) return showAuth(); const code = codeOverride || $("roomCode").value || Math.floor(100+Math.random()*900); socket.emit("room:join", { code, spectator, settings: roomSettingsFromForm(), userId: currentUser.userId, nickname: currentUser.nickname, avatar: currentUser.avatar }); }
  socket.on("rooms:list", rooms => { const q = ($("roomSearch")?.value || "").toLowerCase(); const list = (rooms || []).filter(r => [r.code,r.name,r.hostName].join(" ").toLowerCase().includes(q)); $("roomCount").textContent = `${rooms.length} LIVE`; $("roomList").classList.toggle("empty-list", !list.length); $("roomList").innerHTML = list.length ? list.map(r => `<div class="room-card"><div class="room-avatar">◈</div><div><h4>${esc(r.name)}</h4><p>Host: ${esc(r.hostName)} · ${r.playerCount}/${r.maxPlayers}</p><small>${esc(r.phase)} ${r.locked?'· LOCKED':''} · spectators ${r.spectatorCount}</small></div><button data-join="${esc(r.code)}">JOIN</button></div>`).join("") : "აქტიური მაგიდები არ არის — შექმენი ახალი."; document.querySelectorAll("[data-join]").forEach(b => b.onclick = () => joinRoom(false, b.dataset.join)); });
  $("roomSearch")?.addEventListener("input", () => socket.emit("rooms:get"));

  socket.on("profile:ready", d => { currentUser = d.profile; applyUser(); });
  socket.on("room:joined", async d => { currentRoom = d.code; latestState = d.state; me = d.me; $("app").classList.add("hidden"); $("game").classList.remove("hidden"); await startMedia(!d.me?.spectator); renderState(d.state); setupSettings(d.state); });
  socket.on("game:state", s => { latestState = s; renderState(s); setupSettings(s); });
  socket.on("phase:timer", tickTimer);
  socket.on("role:assigned", d => { myRole = d.role; $("roleIcon").textContent = ROLE_ICONS[d.role] || "?"; $("roleName").textContent = d.meta?.label || d.role; $("roleDesc").textContent = d.meta?.desc || ""; $("roleModal").classList.remove("hidden"); renderActions(); });
  socket.on("game:history", h => toast(h.text, h.type === "death" ? "error" : "info"));
  socket.on("toast", d => toast(d.text, d.type));
  socket.on("game:end", d => { $("winTitle").textContent = d.winner; $("winDesc").textContent = d.mvp ? `MVP: ${d.mvp.avatar||""} ${d.mvp.name} · ID ${d.mvp.userId}` : ""; $("winModal").classList.remove("hidden"); });
  $("closeRole")?.addEventListener("click", () => $("roleModal").classList.add("hidden"));
  $("leaveGame")?.addEventListener("click", () => location.reload());

  function renderState(s){ if(!s) return; const alive = s.players.filter(p=>p.alive).length; $("phaseText").textContent = phaseName(s.phase); $("aliveText").textContent = `${alive} ცოცხალი`; const my = s.players.find(p => p.id === socket.id); if (my) { me = { ...me, ...my }; $("roomSettingsBtn").classList.toggle("hidden", !(my.index === 1 || currentUser?.isAdmin)); } renderVideos(s.players); renderActions(); }
  function phaseName(p){ return ({waiting:"მზადება",night:"ღამე",day:"დღე",vote:"ხმა",ended:"დასრულდა"})[p] || p; }
  function renderVideos(players){ const grid=$("videoGrid"); const existing = new Set(players.map(p=>p.id)); [...grid.children].forEach(el=>{ if(!existing.has(el.id)) el.remove(); }); players.forEach(p => { let box = $(p.id); if (!box) { box=document.createElement("div"); box.id=p.id; box.className="video-box"; box.innerHTML=`<div class="cam-avatar"><b>${esc(p.avatar||"♛")}</b></div><video autoplay playsinline ${p.id===socket.id?'muted':''}></video><div class="seat-badge">#${p.index}</div><div class="tile-controls"></div><div class="video-label"><b>${esc(p.name)}</b><br><small>ID ${p.userId||"?"}${p.muted?' · muted':''}</small></div>`; grid.appendChild(box); } box.querySelector(".seat-badge").textContent = `#${p.index}`; box.querySelector(".video-label").innerHTML = `<b>${esc(p.name)}</b><br><small>ID ${p.userId||"?"}${p.muted?' · muted':''}</small>`; if(p.id===socket.id) renderTileControls(box); }); }
  function renderTileControls(box){ const c=box.querySelector(".tile-controls"); c.innerHTML = `<button id="tileMic">${micOn?'MIC':'MUT'}</button><button id="tileCam">${camOn?'CAM':'OFF'}</button>`; c.querySelector("#tileMic").onclick = toggleMic; c.querySelector("#tileCam").onclick = toggleCam; }
  async function startMedia(useCam=true){ try { localStream = await navigator.mediaDevices.getUserMedia({ video: useCam, audio: true }); attachStream(socket.id, localStream); } catch(e){ toast("კამერა/მიკროფონი ვერ ჩაირთო", "error"); } }
  function attachStream(id, stream){ const video = $(id)?.querySelector("video"); if(video && video.srcObject !== stream){ video.srcObject = stream; $(id)?.querySelector(".cam-avatar")?.classList.add("hidden"); } }
  function toggleMic(){ micOn=!micOn; localStream?.getAudioTracks().forEach(t=>t.enabled=micOn); renderVideos(latestState?.players||[]); }
  function toggleCam(){ camOn=!camOn; localStream?.getVideoTracks().forEach(t=>t.enabled=camOn); renderVideos(latestState?.players||[]); }

  function createPeer(id, initiator){ if(peers[id]){ try{peers[id].destroy()}catch{} } const peer = new SimplePeer({ initiator, trickle:false, stream:localStream || undefined, config:{ iceServers:[{urls:"stun:stun.l.google.com:19302"}] } }); peers[id]=peer; peer.on("signal", signal => socket.emit(initiator?"signal:offer":"signal:answer", { to:id, signal })); peer.on("stream", stream => attachStream(id, stream)); peer.on("error", err => console.warn("peer", err.message)); return peer; }
  socket.on("webrtc:user-joined", p => { roomPlayers.set(p.id,p); if(localStream) createPeer(p.id,true); });
  socket.on("webrtc:user-left", p => { $(p.id)?.remove(); if(peers[p.id]){ try{peers[p.id].destroy()}catch{} delete peers[p.id]; } });
  socket.on("signal:offer", d => { const peer = createPeer(d.from,false); peer.signal(d.signal); });
  socket.on("signal:answer", d => peers[d.from]?.signal(d.signal));

  function setupSettings(s){ if(!s) return; const set=(id,v)=>{ if($(id)) $(id).checked=!!v; }; const val=(id,v)=>{ if($(id)) $(id).value=v??""; }; val("rsName",s.name); val("rsMaxPlayers",s.settings.maxPlayers); val("rsMafiaCount",s.settings.mafiaCount); set("rsSpectator",s.settings.spectator); set("rsReveal",s.settings.revealRoles); set("rsRoleDon",s.settings.don); set("rsRoleSheriff",s.settings.sheriff); set("rsRoleDoctor",s.settings.doctor); set("rsRoleDetective",s.settings.detective); set("rsRoleSerial",s.settings.serialKiller); set("rsRoleYakuza",s.settings.yakuza); set("rsRoleChogun",s.settings.chogun); set("rsRoleVigilante",s.settings.vigilante); set("rsRoleManiac",s.settings.maniac); renderRoleSummary(); }
  $("roomSettingsBtn")?.addEventListener("click", () => $("roomSettings").classList.remove("hidden")); $("closeSettings")?.addEventListener("click", () => $("roomSettings").classList.add("hidden"));
  document.querySelectorAll("[data-cmd]").forEach(b=>b.addEventListener("click",()=>socket.emit("room:control", b.dataset.cmd)));
  document.querySelectorAll("#roomSettings input").forEach(i=>i.addEventListener("change", renderRoleSummary));
  $("saveRoomSettings")?.addEventListener("click", () => { socket.emit("room:update-settings", { name: $("rsName").value, settings: collectRoomSettings() }); $("roomSettings").classList.add("hidden"); });
  function collectRoomSettings(){ return { maxPlayers:Number($("rsMaxPlayers").value||10), spectator:$("rsSpectator").checked, revealRoles:$("rsReveal").checked, mafiaCount:Number($("rsMafiaCount").value||1), don:$("rsRoleDon").checked, sheriff:$("rsRoleSheriff").checked, doctor:$("rsRoleDoctor").checked, detective:$("rsRoleDetective").checked, serialKiller:$("rsRoleSerial").checked, yakuza:$("rsRoleYakuza").checked, chogun:$("rsRoleChogun").checked, vigilante:$("rsRoleVigilante").checked, maniac:$("rsRoleManiac").checked }; }
  function renderRoleSummary(){ const s=collectRoomSettings(); const chips=[`🔴 Mafia x${s.mafiaCount}`]; if(s.don) chips.push("👑 Don"); if(s.sheriff) chips.push("⭐ Sheriff"); if(s.doctor) chips.push("💊 Doctor"); if(s.detective) chips.push("🔎 Detective"); if(s.serialKiller) chips.push("🗡 Serial"); if(s.yakuza) chips.push("⚔ Yakuza"); if(s.chogun) chips.push("🥷 Chogun"); if(s.vigilante) chips.push("⚖ Vigilante"); if(s.maniac) chips.push("🎭 Maniac"); $("roleSummary").innerHTML = chips.map(c=>`<span>${c}</span>`).join(""); }

  function renderActions(){ const p=$("actionPanel"); if(!latestState || !me || !myRole){ p.classList.add("hidden"); return; } const alive = latestState.players.filter(x=>x.alive && x.id!==socket.id); if(latestState.phase === "night" && ACTION_ROLES.has(myRole)){ p.classList.remove("hidden"); p.innerHTML = `<h3>ღამის მოქმედება · ${ROLE_ICONS[myRole]||''}</h3><div class="target-grid">${alive.concat(myRole==='doctor'?[me]:[]).map(t=>`<button data-night="${t.id}">#${t.index} ${esc(t.name)}</button>`).join("")}</div>`; p.querySelectorAll("[data-night]").forEach(b=>b.onclick=()=>socket.emit("night:action", { targetId:b.dataset.night })); return; } if(latestState.phase === "vote" && me.alive){ p.classList.remove("hidden"); p.innerHTML = `<h3>ხმის მიცემა</h3><div class="target-grid">${alive.map(t=>`<button data-vote="${t.id}">#${t.index} ${esc(t.name)}</button>`).join("")}</div>`; p.querySelectorAll("[data-vote]").forEach(b=>b.onclick=()=>socket.emit("vote:cast", { targetId:b.dataset.vote })); return; } p.classList.add("hidden"); }

  function tickTimer(d){ clearInterval(window.__timer); const update=()=>{ const sec=Math.max(0,Math.ceil((d.endsAt-Date.now())/1000)); const m=String(Math.floor(sec/60)).padStart(2,"0"), s=String(sec%60).padStart(2,"0"); $("timerText").textContent=`${m}:${s}`; }; update(); window.__timer=setInterval(update,1000); }

  $("chatBtn")?.addEventListener("click",()=>{ chatOpen=true; unread=0; $("unread").classList.add("hidden"); $("chatPanel").classList.add("open"); }); $("closeChat")?.addEventListener("click",()=>{ chatOpen=false; $("chatPanel").classList.remove("open"); });
  document.querySelectorAll(".chat-tab").forEach(b=>b.onclick=()=>{ document.querySelectorAll(".chat-tab").forEach(x=>x.classList.remove("active")); b.classList.add("active"); activeChat=b.dataset.chat; });
  $("sendChat")?.addEventListener("click",sendChat); $("chatInput")?.addEventListener("keydown",e=>{ if(e.key==="Enter") sendChat(); });
  function sendChat(){ const text=$("chatInput").value.trim(); if(!text) return; socket.emit("chat:send", { text, tab:activeChat }); $("chatInput").value=""; }
  socket.on("chat:message", m => { const el=document.createElement("div"); el.className="msg"; el.innerHTML=`<b>${esc(m.avatar||'')} ${esc(m.from)}</b><br>${esc(m.text)}`; $("messages").appendChild(el); $("messages").scrollTop=$("messages").scrollHeight; if(!chatOpen){ unread++; $("unread").textContent=unread; $("unread").classList.remove("hidden"); }});

  loadMe();
})();
