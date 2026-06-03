const $ = id => document.getElementById(id);
const App = {
  user:null,
  socket:null,
  room:null,
  roles:[],
  localStream:null,
  peers:{},
  iceServers:[{urls:'stun:stun.l.google.com:19302'}],
  musicOn: localStorage.getItem('voidMusicOn') !== '0',
  sfxOn: localStorage.getItem('voidSfxOn') !== '0',
  audioCtx:null,
  musicNodes:null
};

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;Object.assign(d.style,{position:'fixed',left:'50%',bottom:'118px',transform:'translateX(-50%)',background:'#070813',color:'#fff',border:'1px solid #35e8ff',borderRadius:'18px',padding:'14px 18px',zIndex:999,boxShadow:'0 0 26px rgba(54,232,255,.35)',fontWeight:'800'});document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
function show(id){$(id)?.classList.remove('hidden')}
function hide(id){$(id)?.classList.add('hidden')}
function closeAll(){document.querySelectorAll('.overlay').forEach(x=>x.classList.add('hidden'))}
function activateScreen(id){document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('active')});$(id)?.classList.remove('hidden');$(id)?.classList.add('active')}
async function api(path,opt={}){const r=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json'},...opt,body:opt.body?JSON.stringify(opt.body):undefined});return r.json()}
function emit(name,payload,timeout=7000){return new Promise(res=>{if(!App.socket?.connected)return res({ok:false,error:'Socket offline'});let done=false;const t=setTimeout(()=>{if(!done){done=true;res({ok:false,error:'Timeout'})}},timeout);App.socket.emit(name,payload,r=>{if(done)return;done=true;clearTimeout(t);res(r||{ok:true})})})}
function fmt(s){s=Number(s||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function level(u){return u?.level||Math.max(1,Math.floor(Number(u?.stats?.xp||0)/100)+1)}

function ensureAudio(){return null} // audio disabled — use React app
function playSfx(){}
function startMusic(){}
function stopMusic(){}
function syncAudioButtons(){if($('musicToggleBtn'))$('musicToggleBtn').textContent='Music: OFF';if($('sfxToggleBtn'))$('sfxToggleBtn').textContent='SFX: OFF'}

// audio pointerdown listener removed
document.addEventListener('click',e=>{if(e.target.closest('button'))playSfx('tap')});
document.addEventListener('DOMContentLoaded', init);

async function init(){
  bindStatic(); syncAudioButtons();
  const w=await api('/api/webrtc').catch(()=>({ok:false})); if(w.ok)App.iceServers=w.iceServers;
  const rr=await api('/api/roles').catch(()=>({ok:false})); if(rr.ok){App.roles=rr.roles;renderRoleSettings(rr.defaultSettings)}
  const me=await api('/api/auth/me').catch(()=>({})); if(me.user)enterApp(me.user);
}

function bindStatic(){
  document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-auth]').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.form').forEach(x=>x.classList.remove('active'));$(b.dataset.auth+'Form')?.classList.add('active')});
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
  $('guestBtn').onclick=async()=>{const r=await api('/api/auth/guest',{method:'POST',body:{nickname:$('guestNick').value,avatar:$('guestAvatar').value}});r.ok?enterApp(r.user):toast(r.error)};
  $('registerBtn').onclick=async()=>{const r=await api('/api/auth/register',{method:'POST',body:{nickname:$('regNick').value,email:$('regEmail').value,password:$('regPass').value}});r.ok?enterApp(r.user):toast(r.error)};
  $('loginBtn').onclick=async()=>{const r=await api('/api/auth/login',{method:'POST',body:{email:$('loginEmail').value,password:$('loginPass').value}});r.ok?enterApp(r.user):toast(r.error)};
  $('menuBtn').onclick=()=>{syncDrawer();show('drawer')}; $('refreshBtn').onclick=loadAll;
  $('hostGameBtn').onclick=()=>$('roomCreate').classList.toggle('hidden'); $('createRoomBtn').onclick=createRoom;
  $('joinByCodeBtn').onclick=()=>{const c=prompt('Room code'); if(c)joinRoom(c)};
  $('createClanBtn').onclick=createClan; $('saveProfileBtn').onclick=saveProfile; $('logoutBtn').onclick=logout;
  $('musicToggleBtn').onclick=()=>{App.musicOn=!App.musicOn;localStorage.setItem('voidMusicOn',App.musicOn?'1':'0');syncAudioButtons();App.musicOn?startMusic():stopMusic()};
  $('sfxToggleBtn').onclick=()=>{App.sfxOn=!App.sfxOn;localStorage.setItem('voidSfxOn',App.sfxOn?'1':'0');syncAudioButtons()};
  $('leaveBtn').onclick=leaveRoom; $('chatTopBtn').onclick=()=>show('chatPanel'); $('roomTopBtn').onclick=()=>show('settingsModal'); $('settingsBtn').onclick=()=>show('settingsModal'); $('startBtn').onclick=startGame; $('nextPhaseBtn').onclick=nextPhase; $('saveSettingsBtn').onclick=saveSettings;
  $('sendChatBtn').onclick=()=>sendChat('room'); $('sendMafiaBtn').onclick=()=>sendChat('mafia');
  $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat('room')}); $('mafiaInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat('mafia')});
}

function enterApp(user){App.user=user;activateScreen('app');connectSocket();renderMe();showPage('Rooms');loadAll();startMusic()}
function renderMe(){
  if(!App.user)return; const s=App.user.stats||{};
  $('userLine').textContent=`ID ${App.user.userId} · ${App.user.nickname}`;
  $('profileAvatar').textContent=App.user.avatar||'◆'; $('profileName').textContent=App.user.nickname; $('profileId').textContent=`ID ${App.user.userId} · Level ${level(App.user)}`;
  $('statXp').textContent=s.xp||0; $('statRating').textContent=Number(s.rating||5).toFixed(1); $('statWins').textContent=s.wins||0; $('statGames').textContent=s.games||0;
  $('editNick').value=App.user.nickname||''; $('editAvatar').value=App.user.avatar||'◆'; syncDrawer();
}
function syncDrawer(){if(!App.user)return; if($('drawerAvatar'))$('drawerAvatar').textContent=App.user.avatar||'◆'; if($('drawerName'))$('drawerName').textContent=App.user.nickname||'Player'; if($('drawerMeta'))$('drawerMeta').textContent=`ID ${App.user.userId} · Level ${level(App.user)}`; syncAudioButtons()}
function showPage(name){
  closeAll();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $('page'+name)?.classList.add('active');
  $('pageTitle').textContent=name==='Stats'?'Stats':name;
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  if(name==='Rooms')loadRooms(); if(name==='Clans')loadClans(); if(name==='Stats')loadLeaderboard(); if(name==='Profile')renderMe(); startMusic();
}
function connectSocket(){
  if(App.socket)App.socket.disconnect(); App.socket=io();
  App.socket.on('connect',()=>App.socket.emit('auth',{userId:App.user.userId},()=>{}));
  App.socket.on('rooms:list',renderRooms); App.socket.on('room:state',room=>{App.room=room;renderRoom()});
  App.socket.on('chat:message',m=>addMsg(m.channel==='mafia'?'mafiaMessages':'chatMessages',m));
  App.socket.on('webrtc:peer-ready',()=>connectToPeers()); App.socket.on('webrtc:reset-peer',({socketId})=>{App.peers[socketId]?.close();delete App.peers[socketId];connectToPeers()});
  App.socket.on('signal:offer',onOffer); App.socket.on('signal:answer',onAnswer); App.socket.on('signal:ice',onIce);
}
async function loadAll(){await Promise.all([loadRooms(),loadLeaderboard(),loadClans()])}
async function loadRooms(){const r=await api('/api/rooms').catch(()=>({ok:false}));if(r.ok)renderRooms(r.rooms)}
function renderRooms(rooms=[]){$('roomsCount').textContent=rooms.length;$('roomsList').innerHTML=rooms.map(r=>`<div class="room"><div class="pic">🎭</div><div class="grow"><h3>${esc(r.name)}</h3><p>Host: ${esc(r.hostName)} · ${r.players}/${r.maxPlayers} · ${esc(r.language||'Georgian')}</p><span class="badge">${esc(r.phase)}</span></div><button onclick="joinRoom('${r.id}')">JOIN</button></div>`).join('')||'<div class="card">No active rooms</div>'}

function collectSettings(){const roles={};App.roles.forEach(r=>{if(r.key==='citizen')return;roles[r.key]=Number($('role_'+r.key)?.value||0)});roles.doctor=1;roles.sheriff=1;return{maxPlayers:Number($('setMaxPlayers').value||10),language:$('roomLanguage')?.value||'Georgian',timers:{night:Number($('setNight').value||45),day:Number($('setDay').value||90),vote:Number($('setVote').value||35)},roles}}
function renderRoleSettings(defaults={}){const d=defaults.roles||{};$('roleSettings').innerHTML=App.roles.filter(r=>r.key!=='citizen').map(r=>`<label>${esc(r.label)}<input id="role_${r.key}" type="number" min="0" value="${r.key==='doctor'||r.key==='sheriff'?1:(d[r.key]??0)}" ${r.key==='doctor'||r.key==='sheriff'?'disabled':''}></label>`).join('')}
async function createRoom(){stopMusic();const settings=collectSettings();settings.maxPlayers=Number($('maxPlayers').value||10);const r=await emit('room:create',{name:$('roomName').value,settings});if(r.ok){playSfx('ok');enterRoom(r.room)}else{playSfx('error');toast(r.error)}}
async function joinRoom(id){stopMusic();const r=await emit('room:join',{roomId:id});r.ok?enterRoom(r.room):(toast(r.error),startMusic())}
function enterRoom(room){App.room=room;activateScreen('game');closeAll();renderRoom();ensureMedia().then(()=>{App.socket.emit('webrtc:ready',{roomId:room.id});connectToPeers()})}
async function leaveRoom(){await emit('room:leave',{roomId:App.room?.id});Object.values(App.peers).forEach(pc=>pc.close());App.peers={};App.room=null;activateScreen('app');showPage('Rooms');loadRooms();startMusic()}
function renderRoom(){
  const r=App.room;if(!r)return;const waiting=r.phase==='waiting';
  $('phaseName').textContent=waiting?'Lobby':r.phaseLabel||r.phase; $('phaseInfo').textContent=waiting?`${r.players.length}/${r.settings.maxPlayers}`:`Day ${r.day}`; $('timer').textContent=fmt(r.timer);
  $('gameRoomName').textContent=r.name; $('gameRoomInfo').textContent=`${r.phase} · Host: ${r.hostName} · Code: ${r.id}`; $('playersCount').textContent=`${r.players.length}/${r.settings.maxPlayers}`;
  $('lobbyView').classList.toggle('hidden',!waiting); $('videoGrid').classList.toggle('hidden',waiting);
  ['settingsBtn','startBtn','nextPhaseBtn','roomTopBtn'].forEach(id=>$(id).style.display=r.viewer?.isHost?'inline-block':'none');
  $('playersList').innerHTML=r.players.map(playerRow).join(''); $('chatMessages').innerHTML=(r.chat||[]).filter(m=>m.channel==='room').slice(-80).map(msgHtml).join('');
  $('logMessages').innerHTML=(r.events||[]).slice(-80).reverse().map(e=>`<div class="msg"><b>${esc(e.type)}</b><br>${esc(e.text)}</div>`).join('');
  $('mafiaChatBox').classList.toggle('hidden',!(r.viewer?.team==='mafia')); renderAction(); if(!waiting)renderVideos();
}
function playerRow(p){return`<div class="player ${p.speaking?'speaking':''}" onclick="openPlayer(${p.userId})"><div class="pic">${esc(p.avatar||'◆')}</div><div class="grow"><b>#${p.seat} · ${esc(p.nickname)} ${p.userId===App.user.userId?'(you)':''}</b><p>ID ${p.userId} · Level ${p.level||1} ${p.role?'· '+esc(p.role):''}</p><button onclick="event.stopPropagation();toggleMic()">MIC</button> <button onclick="event.stopPropagation();toggleCam()">CAM</button></div><span class="badge">${p.speaking?'SPEAKING':p.connected?'ON':'OFF'}</span></div>`}
function renderAction(){const r=App.room,a=r?.actionState;if(!a||!a.type){hide('actionBox');return}show('actionBox');$('actionTitle').textContent=a.type;$('actionText').textContent=a.submitted?'Submitted':'Choose target';const alive=r.players.filter(p=>p.alive&&p.userId!==App.user.userId);const eventName=a.type==='vote'?'game:vote':a.type==='nominate'?'game:nominate':'game:action';$('targets').innerHTML=alive.map(p=>`<button class="targetBtn" onclick="submitAction('${eventName}','${p.id}')">#${p.seat} · ${esc(p.nickname)}</button>`).join('')+(a.type==='vote'?`<button class="targetBtn" onclick="submitAction('game:vote','abstain')">Abstain</button>`:'')}
async function submitAction(eventName,targetId){const r=await emit(eventName,{roomId:App.room.id,targetId});toast(r.ok?'Submitted':r.error)}
async function saveSettings(){const r=await emit('room:settings',{roomId:App.room.id,settings:collectSettings()});toast(r.ok?'Saved':r.error);if(r.ok)hide('settingsModal')}
async function startGame(){const r=await emit('game:start',{roomId:App.room.id});toast(r.ok?'Started':r.error)}
async function nextPhase(){const r=await emit('game:next',{roomId:App.room.id});if(!r.ok)toast(r.error)}
async function sendChat(channel){const input=channel==='mafia' ? $('mafiaInput') : $('chatInput');const message=input.value.trim();if(!message||!App.room)return;input.disabled=true;const r=await emit('chat:send',{roomId:App.room.id,message,channel});input.disabled=false;if(r.ok)input.value='';else toast(r.error)}
function msgHtml(m){return`<div class="msg"><b>${m.seat?'#'+m.seat+' · ':''}${esc(m.nickname)}</b><br>${esc(m.message)}</div>`}
function addMsg(id,m){const box=$(id);if(!box)return;box.insertAdjacentHTML('beforeend',msgHtml(m));box.scrollTop=box.scrollHeight}

async function loadLeaderboard(){const r=await api('/api/leaderboard').catch(()=>({ok:false}));if(r.ok)$('leaderboard').innerHTML=r.users.map((u,i)=>`<div class="item" onclick="openPlayer(${u.userId})"><div class="pic">${esc(u.avatar||'◆')}</div><div class="grow"><b>#${i+1} ${esc(u.nickname)}</b><p>ID ${u.userId} · Level ${level(u)}</p></div><b>⭐ ${u.stats?.xp||0}</b></div>`).join('')}
async function loadClans(){const r=await api('/api/clans').catch(()=>({ok:false}));if(r.ok)$('clansList').innerHTML=r.clans.map((c,i)=>`<div class="item"><div class="pic">${esc(c.emblem||'◆')}</div><div class="grow"><b>#${i+1} ${esc(c.name)} ${esc(c.tag)}</b><p>Level ${c.level} · Members ${c.members.length} · Power ${c.power}</p></div><button onclick="joinClan('${c.clanId}')">JOIN</button></div>`).join('')||'<div class="card">No clans</div>'}
async function createClan(){const r=await api('/api/clans',{method:'POST',body:{name:$('clanName').value,tag:$('clanTag').value,user:App.user}});toast(r.ok?'Clan created':r.error);loadClans()}
async function joinClan(id){const r=await api(`/api/clans/${id}/join`,{method:'POST',body:{user:App.user}});toast(r.ok?'Joined':r.error)}
async function saveProfile(){const r=await api('/api/auth/me',{method:'PUT',body:{nickname:$('editNick').value,avatar:$('editAvatar').value}});if(r.ok){App.user=r.user;renderMe();toast('Saved')}else toast(r.error)}
async function logout(){await api('/api/auth/logout',{method:'POST'});location.reload()}
async function openPlayer(id){const r=await api('/api/users/'+id);if(!r.ok)return toast(r.error);const u=r.user,s=u.stats||{};$('playerProfile').innerHTML=`<div class="profile"><div class="avatar">${esc(u.avatar||'◆')}</div><h2>${esc(u.nickname)}</h2><p>ID ${u.userId} · Level ${level(u)} · ${esc(u.rank||'')}</p><div class="stats"><div><b>${s.games||0}</b><span>Games</span></div><div><b>${s.wins||0}</b><span>Wins</span></div><div><b>${s.mafiaGames||0}</b><span>As Mafia</span></div><div><b>${s.citizenGames||0}</b><span>As Citizen</span></div><div><b>${Number(s.rating||5).toFixed(1)}</b><span>Rating</span></div><div><b>${s.xp||0}</b><span>XP</span></div></div></div>`;show('playerModal')}

async function ensureMedia(){if(App.localStream)return App.localStream;try{App.localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});setupVoiceActivity()}catch(e){toast('კამერა/მიკროფონი ვერ ჩაირთო')}return App.localStream}
function toggleMic(){const t=App.localStream?.getAudioTracks?.()[0];if(!t)return ensureMedia();t.enabled=!t.enabled;App.socket.emit('media:state',{roomId:App.room?.id,micOn:t.enabled});toast(t.enabled?'Mic on':'Mic off')}
function toggleCam(){const t=App.localStream?.getVideoTracks?.()[0];if(!t)return ensureMedia();t.enabled=!t.enabled;App.socket.emit('media:state',{roomId:App.room?.id,cameraOn:t.enabled});toast(t.enabled?'Camera on':'Camera off')}
function setupVoiceActivity(){try{const AudioCtx=window.AudioContext||window.webkitAudioContext;const c=new AudioCtx(),src=c.createMediaStreamSource(App.localStream),an=c.createAnalyser();src.connect(an);const data=new Uint8Array(an.frequencyBinCount);let last=false;setInterval(()=>{if(!App.room)return;an.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b,0)/data.length;const speaking=avg>12;if(speaking!==last){last=speaking;App.socket?.emit('media:state',{roomId:App.room.id,speaking})}},350)}catch(e){}}
function renderVideos(){const r=App.room;$('videoGrid').innerHTML=r.players.map(p=>`<div class="tile ${p.speaking?'speaking':''}"><video id="vid_${p.socketId||p.id}" autoplay playsinline ${p.userId===App.user.userId?'muted':''}></video><div class="seat">#${p.seat}</div><div class="name">ID ${p.userId} · ${esc(p.nickname)}</div></div>`).join('');const me=r.players.find(p=>p.userId===App.user.userId);if(me&&App.localStream){const v=$('vid_'+(me.socketId||me.id));if(v){v.srcObject=App.localStream;v.muted=true;v.play?.().catch(()=>{})}}}
async function connectToPeers(){if(!App.room||!App.localStream)return;const me=App.room.players.find(p=>p.userId===App.user.userId);if(!me)return;for(const p of App.room.players){if(!p.socketId||p.socketId===me.socketId||App.peers[p.socketId])continue;try{const pc=createPeer(p.socketId);const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});await pc.setLocalDescription(offer);App.socket.emit('signal:offer',{to:p.socketId,signal:offer})}catch(e){console.warn('peer offer failed',e)}}}
function createPeer(id){const pc=new RTCPeerConnection({iceServers:App.iceServers});App.peers[id]=pc;App.localStream?.getTracks().forEach(t=>pc.addTrack(t,App.localStream));pc.onicecandidate=e=>{if(e.candidate)App.socket.emit('signal:ice',{to:id,candidate:e.candidate})};pc.ontrack=e=>{let v=$('vid_'+id);if(!v){renderVideos();v=$('vid_'+id)}if(v){v.srcObject=e.streams[0];v.play?.().catch(()=>{})}};pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)){delete App.peers[id]}};return pc}
async function onOffer({from,signal}){await ensureMedia();const pc=App.peers[from]||createPeer(from);await pc.setRemoteDescription(new RTCSessionDescription(signal));const ans=await pc.createAnswer();await pc.setLocalDescription(ans);App.socket.emit('signal:answer',{to:from,signal:ans})}
async function onAnswer({from,signal}){const pc=App.peers[from];if(pc)await pc.setRemoteDescription(new RTCSessionDescription(signal))}
async function onIce({from,candidate}){const pc=App.peers[from];if(pc&&candidate)try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){}}
function showRoomTab(){}
window.showPage=showPage;window.joinRoom=joinRoom;window.openPlayer=openPlayer;window.joinClan=joinClan;window.submitAction=submitAction;window.show=show;window.closeAll=closeAll;window.showRoomTab=showRoomTab;
