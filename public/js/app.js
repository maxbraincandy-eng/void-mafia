const $=id=>document.getElementById(id), App={user:null,socket:null,room:null,localStream:null,peers:{},iceServers:[{urls:'stun:stun.l.google.com:19302'}],roles:[]}; function toast(t){alert(t)} function hide(id){$(id)?.classList.add('hidden')} function show(id){$(id)?.classList.remove('hidden')} function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))} async function api(p,o={}){const r=await fetch(p,{headers:{'Content-Type':'application/json'},credentials:'include',...o,body:o.body?JSON.stringify(o.body):undefined});return r.json()} function emit(n,p,t=5000){return new Promise(res=>{let d=false;const x=setTimeout(()=>{if(!d){d=true;res({ok:false,error:'Timeout'})}},t);App.socket.emit(n,p,r=>{if(d)return;d=true;clearTimeout(x);res(r||{ok:true})})})}
document.addEventListener('DOMContentLoaded',init); async function init(){bind(); const w=await api('/api/webrtc'); if(w.ok)App.iceServers=w.iceServers; const rr=await api('/api/roles'); if(rr.ok){App.roles=rr.roles; renderRoleSettings(rr.defaultSettings.roles)} const me=await api('/api/auth/me'); if(me.user)enterApp(me.user)} function bind(){document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');['guestForm','loginForm','registerForm'].forEach(hide);show(b.dataset.tab+'Form')}); $('guestBtn').onclick=async()=>{const r=await api('/api/auth/guest',{method:'POST',body:{nickname:$('guestNick').value,avatar:$('guestAvatar').value}});r.ok?enterApp(r.user):toast(r.error)}; $('registerBtn').onclick=async()=>{const r=await api('/api/auth/register',{method:'POST',body:{nickname:$('regNick').value,email:$('regEmail').value,password:$('regPass').value}});r.ok?enterApp(r.user):toast(r.error)}; $('loginBtn').onclick=async()=>{const r=await api('/api/auth/login',{method:'POST',body:{email:$('loginEmail').value,password:$('loginPass').value}});r.ok?enterApp(r.user):toast(r.error)}; $('refreshBtn').onclick=loadAll; $('hostGameBtn').onclick=()=>$('roomCreate').classList.toggle('hidden'); $('createRoomBtn').onclick=createRoom; $('joinByCodeBtn').onclick=()=>{const c=prompt('Room number'); if(c)joinRoom(c)}; $('createClanBtn').onclick=createClan; $('saveProfileBtn').onclick=saveProfile; $('leaveBtn').onclick=leaveRoom; $('chatTopBtn').onclick=()=>show('chatPanel'); $('roomTopBtn').onclick=()=>show('settingsModal'); $('settingsBtn').onclick=()=>show('settingsModal'); $('startBtn').onclick=startGame; $('nextPhaseBtn').onclick=nextPhase; $('saveSettingsBtn').onclick=saveSettings; $('sendChatBtn').onclick=()=>sendChat('room'); $('sendMafiaBtn').onclick=()=>sendChat('mafia')}
function enterApp(u){App.user=u;hide('auth');show('app');connectSocket();renderMe();loadAll()} function renderMe(){$('userLine').textContent=`ID ${App.user.userId} · ${App.user.nickname}`;$('profileName').textContent=App.user.nickname;$('profileId').textContent=`ID ${App.user.userId} · ${App.user.rank}`;$('profileAvatar').textContent=App.user.avatar||'◆';$('statXp').textContent=App.user.stats?.xp||0;$('statRating').textContent=Number(App.user.stats?.rating||5).toFixed(1);$('statWins').textContent=App.user.stats?.wins||0;$('statGames').textContent=App.user.stats?.games||0;$('editNick').value=App.user.nickname;$('editAvatar').value=App.user.avatar||'◆'} function showPage(n){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page'+n).classList.add('active');$('pageTitle').textContent=n;if(n==='Clans')loadClans();if(n==='Leaderboard')loadLeaderboard();if(n==='Store')loadStore();if(n==='Profile')renderMe()}
function connectSocket(){App.socket=io();App.socket.on('connect',()=>App.socket.emit('auth',{userId:App.user.userId},()=>{}));App.socket.on('rooms:list',renderRooms);App.socket.on('room:state',r=>{App.room=r;renderRoom()});App.socket.on('chat:message',m=>addMsg(m.channel==='mafia'?'mafiaMessages':'chatMessages',m));App.socket.on('signal:offer',onOffer);App.socket.on('signal:answer',onAnswer);App.socket.on('signal:ice',onIce)} async function loadAll(){const r=await api('/api/rooms');if(r.ok)renderRooms(r.rooms);loadLeaderboard();loadClans();loadStore()} function renderRooms(rooms){$('roomsCount').textContent=rooms.length;$('roomsList').innerHTML=rooms.map(r=>`<div class="room"><div class="pic">🎭</div><div class="grow"><h3>${esc(r.name)}</h3><p>Host: ${esc(r.hostName)} · ${r.players}/${r.maxPlayers}</p><span class="badge">${r.phase}</span></div><button onclick="joinRoom('${r.id}')">JOIN</button></div>`).join('')||'<div class="card">No rooms</div>'}
async function createRoom(){const s=collectSettings();s.maxPlayers=Number($('maxPlayers').value||10);s.language=$('roomLanguage').value||'Georgian';const r=await emit('room:create',{name:$('roomName').value,settings:s});r.ok?enterRoom(r.room):toast(r.error)} async function joinRoom(id){const r=await emit('room:join',{roomId:id});r.ok?enterRoom(r.room):toast(r.error)} function enterRoom(r){App.room=r;hide('app');show('game');renderRoom();ensureMedia().then(connectToPeers)} function leaveRoom(){Object.values(App.peers).forEach(pc=>pc.close());App.peers={};App.room=null;hide('game');show('app');loadAll()} function renderRoom(){const r=App.room;if(!r)return;const waiting=r.phase==='waiting';$('phaseName').textContent=waiting?'Lobby':r.phase;$('phaseInfo').textContent=waiting?`${r.players.length}/${r.settings.maxPlayers}`:`Day ${r.day}`;$('timer').textContent=fmt(r.timer||0);$('gameRoomName').textContent=r.name;$('gameRoomInfo').textContent=`${r.phase} · Host: ${r.hostName} · Code: ${r.id}`;$('playersCount').textContent=`${r.players.length}/${r.settings.maxPlayers}`;$('lobbyView').classList.toggle('hidden',!waiting);$('videoGrid').classList.toggle('hidden',waiting);['settingsBtn','startBtn','nextPhaseBtn','roomTopBtn'].forEach(id=>$(id).style.display=r.viewer?.isHost?'inline-block':'none');$('playersList').innerHTML=r.players.map(playerRow).join('');$('chatMessages').innerHTML=(r.chat||[]).slice(-80).map(msgHtml).join('');$('mafiaChatBox').classList.toggle('hidden',!(['mafia','don','yakuza'].includes(r.viewer?.role)&&r.phase==='night'));if(!waiting)renderVideos();connectToPeers()} function playerRow(p){return`<div class="player" onclick="openPlayer(${p.userId})"><div class="pic">${esc(p.avatar||'◆')}</div><div class="grow"><b>#${p.seat} · ${esc(p.nickname)} ${p.userId===App.user.userId?'(you)':''}</b><p>ID ${p.userId} ${p.role?'· '+p.role:''}</p><button onclick="event.stopPropagation();toggleMic()">MIC</button> <button onclick="event.stopPropagation();toggleCam()">CAM</button></div><span class="badge">${p.speaking?'SPEAKING':p.connected?'ON':'OFF'}</span></div>`} function renderVideos(){const r=App.room;$('videoGrid').innerHTML=r.players.map(p=>`<div class="tile ${p.speaking?'speaking':''}"><video id="vid_${p.socketId||p.id}" autoplay playsinline ${p.userId===App.user.userId?'muted':''}></video><div class="seat">#${p.seat}</div><div class="name">ID ${p.userId} · ${esc(p.nickname)}</div></div>`).join('');const me=r.players.find(p=>p.userId===App.user.userId);if(me&&App.localStream){const v=$('vid_'+(me.socketId||me.id));if(v){v.srcObject=App.localStream;v.play?.().catch(()=>{})}}}
function renderRoleSettings(d={}){$('roleSettings').innerHTML=App.roles.map(r=>`<label>${r.label}<input id="role_${r.key}" type="number" min="0" value="${d[r.key]??0}"></label>`).join('')} function collectSettings(){const roles={};App.roles.forEach(r=>roles[r.key]=Number($('role_'+r.key)?.value||0));return{maxPlayers:Number($('setMaxPlayers').value||10),timers:{night:Number($('setNight').value||45),day:Number($('setDay').value||90),vote:Number($('setVote').value||35)},roles}} async function saveSettings(){const r=await emit('room:settings',{roomId:App.room.id,settings:collectSettings()});toast(r.ok?'Saved':r.error);hide('settingsModal')} async function startGame(){const r=await emit('game:start',{roomId:App.room.id});toast(r.ok?'Started':r.error)} async function nextPhase(){const r=await emit('game:next',{roomId:App.room.id});if(!r.ok)toast(r.error)} async function sendChat(channel){const input=channel==='mafia'?$('mafiaInput'):$('chatInput');const message=input.value.trim();if(!message)return;input.disabled=true;const r=await emit('chat:send',{roomId:App.room.id,message,channel});input.disabled=false;if(r.ok)input.value='';else toast(r.error)} function msgHtml(m){return`<div class="msg"><b>${m.seat?'#'+m.seat+' · ':''}${esc(m.nickname)}</b><br>${esc(m.message)}</div>`} function addMsg(id,m){$(id).insertAdjacentHTML('beforeend',msgHtml(m));$(id).scrollTop=$(id).scrollHeight}
async function loadLeaderboard(){const r=await api('/api/leaderboard');if(r.ok)$('leaderboard').innerHTML=r.users.map((u,i)=>`<div class="item" onclick="openPlayer(${u.userId})"><div class="pic">${esc(u.avatar)}</div><div class="grow"><b>#${i+1} ${esc(u.nickname)}</b><p>ID ${u.userId} · ${u.rank}</p></div><b>⭐ ${u.stats.xp}</b></div>`).join('')} async function loadClans(){const r=await api('/api/clans');if(r.ok)$('clansList').innerHTML=r.clans.map((c,i)=>`<div class="item"><div class="pic">${esc(c.emblem)}</div><div class="grow"><b>#${i+1} ${esc(c.name)} ${esc(c.tag)}</b><p>Level ${c.level} · Members ${c.members.length}</p></div><button onclick="joinClan('${c.clanId}')">JOIN</button></div>`).join('')||'<div class="card">No clans</div>'} async function createClan(){const r=await api('/api/clans',{method:'POST',body:{name:$('clanName').value,tag:$('clanTag').value,user:App.user}});toast(r.ok?'Clan created':r.error);loadClans()} async function joinClan(id){const r=await api(`/api/clans/${id}/join`,{method:'POST',body:{user:App.user}});toast(r.ok?'Joined':r.error)} async function loadStore(){const r=await api('/api/store');if(r.ok)$('storeList').innerHTML=r.items.map(i=>`<div class="item"><div class="pic">💠</div><div class="grow"><b>${esc(i.title)}</b><p>${esc(i.description)}</p></div><button>${i.price?i.price+' coins':'Owned'}</button></div>`).join('')} async function saveProfile(){const r=await api('/api/auth/me',{method:'PUT',body:{userId:App.user.userId,nickname:$('editNick').value,avatar:$('editAvatar').value}});if(r.ok){App.user=r.user;renderMe();toast('Saved')}else toast(r.error)} async function openPlayer(id){const r=await api('/api/users/'+id);if(!r.ok)return toast(r.error);const u=r.user;$('playerProfile').innerHTML=`<div class="profile"><div class="avatar">${esc(u.avatar)}</div><h2>${esc(u.nickname)}</h2><p>ID ${u.userId} · ${u.rank}</p><div class="grid2 stats"><div><b>${u.stats.games}</b><span>Games</span></div><div><b>${u.stats.wins}</b><span>Wins</span></div><div><b>${u.stats.mafiaGames}</b><span>As Mafia</span></div><div><b>${u.stats.citizenGames}</b><span>As Citizen</span></div><div><b>${Number(u.stats.rating).toFixed(1)}</b><span>Rating</span></div><div><b>${u.stats.xp}</b><span>XP</span></div></div></div>`;show('playerModal')}
async function ensureMedia(){if(App.localStream)return App.localStream;try{App.localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});setupVoiceActivity()}catch(e){toast('კამერა/მიკროფონი ვერ ჩაირთო')}return App.localStream} function toggleMic(){const t=App.localStream?.getAudioTracks?.()[0];if(!t)return ensureMedia();t.enabled=!t.enabled;App.socket.emit('media:state',{roomId:App.room?.id,micOn:t.enabled})} function toggleCam(){const t=App.localStream?.getVideoTracks?.()[0];if(!t)return ensureMedia();t.enabled=!t.enabled;App.socket.emit('media:state',{roomId:App.room?.id,cameraOn:t.enabled})} function setupVoiceActivity(){try{const c=new AudioContext(),src=c.createMediaStreamSource(App.localStream),an=c.createAnalyser();src.connect(an);const data=new Uint8Array(an.frequencyBinCount);let last=false;setInterval(()=>{an.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b,0)/data.length,speaking=avg>12;if(speaking!==last){last=speaking;App.socket?.emit('media:state',{roomId:App.room?.id,speaking})}},300)}catch(e){}}
async function connectToPeers(){if(!App.room||!App.localStream)return;const me=App.room.players.find(p=>p.userId===App.user.userId);for(const p of App.room.players){if(!p.socketId||p.socketId===me?.socketId||App.peers[p.socketId])continue;const pc=createPeer(p.socketId),offer=await pc.createOffer();await pc.setLocalDescription(offer);App.socket.emit('signal:offer',{to:p.socketId,signal:offer})}} function createPeer(id){const pc=new RTCPeerConnection({iceServers:App.iceServers});App.peers[id]=pc;App.localStream?.getTracks().forEach(t=>pc.addTrack(t,App.localStream));pc.onicecandidate=e=>{if(e.candidate)App.socket.emit('signal:ice',{to:id,candidate:e.candidate})};pc.ontrack=e=>{const v=$('vid_'+id);if(v){v.srcObject=e.streams[0];v.play?.().catch(()=>{})}};return pc} async function onOffer({from,signal}){await ensureMedia();const pc=App.peers[from]||createPeer(from);await pc.setRemoteDescription(signal);const ans=await pc.createAnswer();await pc.setLocalDescription(ans);App.socket.emit('signal:answer',{to:from,signal:ans})} async function onAnswer({from,signal}){const pc=App.peers[from];if(pc)await pc.setRemoteDescription(signal)} async function onIce({from,candidate}){const pc=App.peers[from];if(pc&&candidate)try{await pc.addIceCandidate(candidate)}catch(e){}} function fmt(s){s=Number(s||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

/* =========================
   VOID FIX PATCH v16.1
   Profile / Store / Drawer
========================= */

function getUserLevel(user) {
  const xp = Number(user?.stats?.xp || 0);
  return Math.max(1, Math.floor(xp / 100) + 1);
}

function normalizeStats(user) {
  const s = user?.stats || {};
  return {
    xp: Number(s.xp || 0),
    rating: Number(s.rating || 5),
    wins: Number(s.wins || 0),
    games: Number(s.games || s.gamesPlayed || 0),
    losses: Number(s.losses || 0),
    mafiaGames: Number(s.mafiaGames || 0),
    citizenGames: Number(s.citizenGames || 0)
  };
}

/* Override profile render */
window.renderMe = function renderMe() {
  if (!App.user) return;

  const s = normalizeStats(App.user);

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

  if ($("statXp")) $("statXp").textContent = s.xp;
  if ($("statRating")) $("statRating").textContent = s.rating.toFixed(1);
  if ($("statWins")) $("statWins").textContent = s.wins;
  if ($("statGames")) $("statGames").textContent = s.games;

  if ($("editNick")) $("editNick").value = App.user.nickname || "";
  if ($("editAvatar")) $("editAvatar").value = App.user.avatar || "◆";
};

/* Override leaderboard render */
window.loadLeaderboard = async function loadLeaderboard() {
  const r = await api("/api/leaderboard");

  if (!r.ok) {
    toast(r.error || "Leaderboard ვერ ჩაიტვირთა");
    return;
  }

  if (!$("leaderboard")) return;

  $("leaderboard").innerHTML = (r.users || []).map((u, i) => {
    const s = normalizeStats(u);

    return `
      <div class="item" onclick="openPlayer(${u.userId})">
        <div class="pic">${esc(u.avatar || "◆")}</div>

        <div class="grow">
          <b>#${i + 1} ${esc(u.nickname || "Player")}</b>
          <p>ID ${u.userId} · Level ${getUserLevel(u)}</p>
        </div>

        <b>⭐ ${s.xp}</b>
      </div>
    `;
  }).join("");
};

/* Override player profile modal */
window.openPlayer = async function openPlayer(id) {
  const r = await api("/api/users/" + id);

  if (!r.ok) {
    toast(r.error || "User ვერ მოიძებნა");
    return;
  }

  const u = r.user;
  const s = normalizeStats(u);

  if (!$("playerProfile")) return;

  $("playerProfile").innerHTML = `
    <div class="profile">
      <div class="avatar">${esc(u.avatar || "◆")}</div>

      <h2>${esc(u.nickname || "Player")}</h2>
      <p>ID ${u.userId} · Level ${getUserLevel(u)}</p>

      <div class="grid2 stats">
        <div>
          <b>${s.games}</b>
          <span>Games</span>
        </div>

        <div>
          <b>${s.wins}</b>
          <span>Wins</span>
        </div>

        <div>
          <b>${s.losses}</b>
          <span>Losses</span>
        </div>

        <div>
          <b>${s.rating.toFixed(1)}</b>
          <span>Rating</span>
        </div>

        <div>
          <b>${s.mafiaGames}</b>
          <span>As Mafia</span>
        </div>

        <div>
          <b>${s.citizenGames}</b>
          <span>As Citizen</span>
        </div>

        <div>
          <b>${s.xp}</b>
          <span>XP</span>
        </div>

        <div>
          <b>${getUserLevel(u)}</b>
          <span>Level</span>
        </div>
      </div>
    </div>
  `;

  show("playerModal");
};

/* Override page switching so bottom active button works correctly */
window.showPage = function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const page = $("page" + name);
  if (page) page.classList.add("active");

  if ($("pageTitle")) {
    $("pageTitle").textContent = name === "Leaderboard" ? "Rank" : name;
  }

  document.querySelectorAll(".bottom button").forEach(btn => {
    btn.classList.remove("active");

    const text = btn.textContent.trim().toLowerCase();

    if (
      (name === "Rooms" && text === "games") ||
      (name === "Clans" && text === "clans") ||
      (name === "Leaderboard" && text === "rank") ||
      (name === "Store" && text === "store") ||
      (name === "Profile" && text === "profile")
    ) {
      btn.classList.add("active");
    }
  });

  if (name === "Rooms") loadRooms?.();
  if (name === "Clans") loadClans?.();
  if (name === "Leaderboard") loadLeaderboard?.();
  if (name === "Store") loadStore?.();
  if (name === "Profile") renderMe?.();
};

/* Drawer / menu */
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

/* Attach drawer button safely */
setTimeout(() => {
  if ($("menuBtn")) {
    $("menuBtn").onclick = openMainMenu;
  }

  renderMe?.();
}, 300);
