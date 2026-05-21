const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function roomKey(space, roomCode) {
  return `${space}:${roomCode}`;
}

function getRoom(key) {
  if (!rooms.has(key)) rooms.set(key, { players: new Map(), hostId: null, space: '', roomCode: '' });
  return rooms.get(key);
}

function publicPlayers(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    username: p.username,
    isHost: room.hostId === id,
    micOn: p.micOn !== false,
    camOn: p.camOn !== false,
    speaking: !!p.speaking
  }));
}

function leaveCurrentRoom(socket) {
  const key = socket.data.roomKey;
  if (!key || !rooms.has(key)) return;
  const room = rooms.get(key);
  const player = room.players.get(socket.id);
  room.players.delete(socket.id);

  if (room.hostId === socket.id) {
    const nextHost = room.players.keys().next().value;
    room.hostId = nextHost || null;
  }

  socket.to(key).emit('peer-left', { peerId: socket.id, username: player?.username || 'Unknown' });
  io.to(key).emit('players-update', publicPlayers(room));
  io.to(key).emit('system-message', `${player?.username || 'Player'} left the room.`);

  socket.leave(key);
  socket.data.roomKey = null;

  if (room.players.size === 0) rooms.delete(key);
}

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>VOID PORTAL</title>
  <style>
    :root{
      --bg:#050611;--panel:rgba(12,16,38,.78);--panel2:rgba(7,10,25,.88);--line:rgba(130,150,255,.2);
      --text:#f5f7ff;--soft:#aeb7d5;--dim:#757f9f;--cyan:#5ff6ff;--pink:#ff4fd8;--violet:#8b5cff;--green:#42ff9e;--red:#ff5f87;--yellow:#ffe66b;
      --shadow:0 16px 60px rgba(0,0,0,.45);--r:26px;--r2:18px;
    }
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:var(--text);background:#03040b;overflow-x:hidden}
    body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 15% 5%,rgba(255,79,216,.24),transparent 28%),radial-gradient(circle at 85% 15%,rgba(95,246,255,.20),transparent 30%),radial-gradient(circle at 50% 100%,rgba(139,92,255,.2),transparent 35%),linear-gradient(135deg,#03040b,#080b1b 55%,#050611);z-index:-3}
    body:after{content:"";position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:34px 34px;mask-image:radial-gradient(circle at center,black,transparent 82%);opacity:.45;z-index:-2;pointer-events:none}
    .scan{position:fixed;inset:0;background:linear-gradient(to bottom,transparent 0%,rgba(255,255,255,.035) 50%,transparent 100%);height:90px;animation:scan 5s linear infinite;z-index:-1;pointer-events:none;opacity:.55}
    @keyframes scan{0%{transform:translateY(-100px)}100%{transform:translateY(110vh)}}
    .boot{position:fixed;inset:0;background:#03040b;display:flex;align-items:center;justify-content:center;z-index:20;animation:bootOut .5s ease 1.8s forwards}.bootbox{text-align:center}.boot-title{font-weight:900;font-size:38px;letter-spacing:.12em;text-shadow:0 0 20px var(--cyan),0 0 35px var(--pink)}.boot-line{margin-top:12px;color:var(--soft);font-size:13px;letter-spacing:.18em}.loader{width:220px;height:4px;background:rgba(255,255,255,.08);border-radius:99px;margin:22px auto;overflow:hidden}.loader i{display:block;height:100%;width:45%;background:linear-gradient(90deg,var(--cyan),var(--pink));animation:load 1.4s ease infinite}@keyframes load{0%{transform:translateX(-120%)}100%{transform:translateX(240%)}}@keyframes bootOut{to{opacity:0;visibility:hidden}}
    .shell{max-width:1160px;margin:0 auto;padding:22px 14px 42px}.panel{background:linear-gradient(180deg,rgba(17,22,52,.84),rgba(7,10,25,.84));border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(16px);padding:18px;margin-bottom:16px;overflow:hidden}.hero{position:relative}.hero-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tag{font-size:11px;letter-spacing:.26em;color:var(--cyan);text-shadow:0 0 14px var(--cyan)}.powered{font-size:12px;color:#ffd5f6;border:1px solid rgba(255,79,216,.3);background:rgba(255,79,216,.08);box-shadow:0 0 20px rgba(255,79,216,.23);border-radius:999px;padding:8px 11px}.glitch{position:relative;display:inline-block;margin:15px 0 6px;font-size:clamp(42px,12vw,86px);line-height:.9;font-weight:950;letter-spacing:.03em;text-shadow:0 0 14px rgba(255,255,255,.22),0 0 30px rgba(95,246,255,.25)}.glitch:before,.glitch:after{content:attr(data-text);position:absolute;left:0;top:0;width:100%;overflow:hidden}.glitch:before{color:var(--cyan);clip-path:inset(0 0 48% 0);transform:translate(2px,-1px);animation:g1 2.1s infinite linear alternate-reverse}.glitch:after{color:var(--pink);clip-path:inset(52% 0 0 0);transform:translate(-2px,1px);animation:g2 2.4s infinite linear alternate-reverse}@keyframes g1{0%,100%{transform:translate(0)}30%{transform:translate(3px,-1px)}60%{transform:translate(-2px,1px)}}@keyframes g2{0%,100%{transform:translate(0)}35%{transform:translate(-3px,1px)}70%{transform:translate(2px,-1px)}}.subtitle{color:var(--soft);font-size:18px;margin:4px 0 0}.statusbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pill{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);border-radius:999px;padding:8px 10px;font-size:12px;color:var(--soft)}.pill.online{color:#d5ffe9;border-color:rgba(66,255,158,.3);box-shadow:0 0 16px rgba(66,255,158,.13)}
    label{display:block;margin:0 0 8px;color:#dfe7ff;font-size:13px;font-weight:800}.field{margin-bottom:15px}input,select{width:100%;border:1px solid rgba(130,150,255,.24);background:rgba(3,6,18,.78);color:white;border-radius:16px;padding:15px;font-size:16px;outline:none}input:focus,select:focus{border-color:rgba(95,246,255,.7);box-shadow:0 0 0 4px rgba(95,246,255,.08),0 0 22px rgba(95,246,255,.13)}.row{display:grid;grid-template-columns:1fr 130px;gap:10px}.space-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.space{border:1px solid rgba(140,160,255,.18);background:linear-gradient(180deg,rgba(15,19,45,.96),rgba(8,10,25,.94));color:white;border-radius:18px;padding:14px;text-align:left;cursor:pointer;transition:.18s}.space:hover{transform:translateY(-2px);border-color:rgba(95,246,255,.5);box-shadow:0 0 22px rgba(95,246,255,.12)}.space.active{border-color:rgba(255,79,216,.58);box-shadow:0 0 22px rgba(255,79,216,.16);background:linear-gradient(180deg,rgba(32,15,45,.98),rgba(8,10,25,.96))}.st{display:block;font-weight:900;font-size:16px;margin-bottom:5px}.sd{display:block;color:var(--soft);font-size:13px;line-height:1.35}.btn{border:0;cursor:pointer;border-radius:16px;padding:14px 15px;font-weight:900;letter-spacing:.02em;color:#06111d;background:linear-gradient(90deg,var(--cyan),#9cfaff 45%,#ffa5ee);box-shadow:0 10px 30px rgba(95,246,255,.16),0 0 28px rgba(255,79,216,.13);transition:.18s}.btn:hover{transform:translateY(-1px);filter:brightness(1.05)}.btn.full{width:100%}.btn.ghost{background:rgba(255,255,255,.05);color:#eef4ff;border:1px solid rgba(255,255,255,.1);box-shadow:none}.btn.danger{color:#ffdce5;border-color:rgba(255,95,135,.28)}.btn.small{padding:11px 12px;font-size:13px}.btn.on{background:linear-gradient(90deg,var(--green),#b8ffd9);color:#06130d}.btn.off{background:rgba(255,255,255,.05);color:#bfc7dd;border:1px solid rgba(255,255,255,.1);box-shadow:none}
    .room-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.mini{font-size:10px;letter-spacing:.2em;color:var(--dim);text-transform:uppercase}.value{font-size:17px;font-weight:900;margin-top:4px}.actions{display:flex;gap:8px;flex-wrap:wrap}.main-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.video-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.video-card{position:relative;border-radius:20px;overflow:hidden;background:#070a18;border:1px solid rgba(255,255,255,.08);min-height:210px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}video{width:100%;height:100%;display:block;object-fit:cover;background:#03040b;min-height:210px}.video-card.local video{transform:scaleX(-1)}.video-meta{position:absolute;left:10px;right:10px;bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px}.name{background:rgba(0,0,0,.48);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(10px);padding:8px 10px;border-radius:999px;font-size:13px;font-weight:800;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.icons{display:flex;gap:6px}.mic,.cam{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;font-size:16px;background:rgba(0,0,0,.48);border:1px solid rgba(255,255,255,.1)}.mic.speaking{color:#06130d;background:var(--green);box-shadow:0 0 0 0 rgba(66,255,158,.75),0 0 24px rgba(66,255,158,.65);animation:pulse 1s infinite}.mic.off,.cam.off{opacity:.55;filter:grayscale(1)}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(66,255,158,.75),0 0 20px rgba(66,255,158,.45)}70%{box-shadow:0 0 0 12px rgba(66,255,158,0),0 0 28px rgba(66,255,158,.65)}100%{box-shadow:0 0 0 0 rgba(66,255,158,0),0 0 20px rgba(66,255,158,.45)}}.empty-video{display:flex;align-items:center;justify-content:center;min-height:210px;color:var(--dim);text-align:center;padding:22px}.controls{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}.side{display:grid;gap:14px}.sub{background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:14px}.sub-title{font-size:12px;font-weight:950;letter-spacing:.16em;color:var(--cyan);text-transform:uppercase;margin-bottom:11px}.players{list-style:none;padding:0;margin:0}.players li{display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);padding:10px 11px;border-radius:14px;margin-bottom:8px;color:var(--soft)}.badges{display:flex;gap:5px}.badge{font-size:10px;border-radius:999px;padding:4px 7px;border:1px solid rgba(255,255,255,.1);color:var(--soft)}.badge.host{color:#ffe8a0;border-color:rgba(255,230,107,.35)}.badge.you{color:#d6ffff;border-color:rgba(95,246,255,.35)}.badge.talk{color:#cffff0;border-color:rgba(66,255,158,.4)}.chat{height:220px;overflow-y:auto;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.06);border-radius:15px;padding:10px;margin-bottom:10px}.msg{margin:0 0 9px;color:#dbe2ff;font-size:14px;line-height:1.35}.msg .who{font-weight:900;color:var(--cyan)}.msg.system{color:#ffcfef}.chatrow{display:grid;grid-template-columns:1fr 82px;gap:8px}.gamebox{color:var(--soft);line-height:1.45}.gamebox h3{color:white;margin:0 0 6px}.result{margin-top:10px;color:#fff;font-weight:900;text-shadow:0 0 12px rgba(255,79,216,.35)}
    @media(max-width:900px){.main-grid{grid-template-columns:1fr}.video-grid{grid-template-columns:1fr}.space-grid{grid-template-columns:1fr}.row{grid-template-columns:1fr}.shell{padding:14px 10px 34px}.panel{padding:15px;border-radius:22px}.video-card,video,.empty-video{min-height:260px}.glitch{font-size:48px}}
  </style>
</head>
<body>
  <div class="scan"></div>
  <div class="boot"><div class="bootbox"><div class="boot-title">VOID</div><div class="loader"><i></i></div><div class="boot-line">POWERED BY ბატონი მაქსი</div></div></div>
  <main class="shell">
    <section class="panel hero">
      <div class="hero-top"><span class="tag">PRIVATE SOCIAL GAME HUB</span><span class="powered">powered by ბატონი მაქსი</span></div>
      <h1 class="glitch" data-text="VOID PORTAL">VOID PORTAL</h1>
      <p class="subtitle">Enter the room. Choose the game. Turn camera on. Trust nobody.</p>
      <div class="statusbar"><span id="conn" class="pill">connecting...</span><span id="mediaStatus" class="pill">camera/mic: off</span><span class="pill">WebRTC v0.4</span></div>
    </section>

    <section class="panel" id="portalPanel">
      <div class="field"><label>Username</label><input id="username" placeholder="მაგ: Max" value="Max"></div>
      <div class="field"><label>Room Code</label><div class="row"><input id="roomCode" placeholder="მაგ: 7777"><button class="btn ghost" id="randomRoom">Random</button></div></div>
      <div class="field"><label>Choose Space</label><input type="hidden" id="space" value="lounge"><div class="space-grid">
        <button class="space active" data-space="lounge"><span class="st">Void Lounge</span><span class="sd">video, audio, chat, chill</span></button>
        <button class="space" data-space="mafia"><span class="st">Mafia Lite</span><span class="sd">roles lobby, future day/night</span></button>
        <button class="space" data-space="confession"><span class="st">Confession Room</span><span class="sd">anonymous secrets and reveal</span></button>
        <button class="space" data-space="truth"><span class="st">Truth or Dare</span><span class="sd">spin a player and play</span></button>
        <button class="space" data-space="debate"><span class="st">Debate Arena</span><span class="sd">topics, timer, audience vote</span></button>
        <button class="space" data-space="mystery"><span class="st">Mystery Room</span><span class="sd">detective, liar, clues</span></button>
      </div></div>
      <button class="btn full" id="joinBtn">Create / Join Room</button>
    </section>

    <section class="panel" id="roomPanel" style="display:none">
      <div class="room-head">
        <div><div class="mini">current space</div><div class="value" id="currentSpace">Void Lounge</div></div>
        <div><div class="mini">room</div><div class="value" id="currentRoom">----</div></div>
        <div class="actions"><button class="btn ghost small" id="startBtn">Start</button><button class="btn ghost danger small" id="leaveBtn">Leave</button></div>
      </div>
    </section>

    <section class="main-grid" id="mainGrid" style="display:none">
      <div class="panel">
        <div class="room-head" style="margin-bottom:12px"><div><div class="mini">live room</div><div class="value">Video / Audio</div></div><div class="pill" id="talkHint">mic glow turns green while speaking</div></div>
        <div class="video-grid" id="videoGrid"></div>
        <div class="controls">
          <button class="btn off" id="camBtn">📷 Camera Off</button>
          <button class="btn off" id="micBtn">🎙 Mic Off</button>
          <button class="btn ghost" id="switchCamBtn">Switch Camera</button>
        </div>
      </div>
      <div class="side">
        <div class="sub"><div class="sub-title">Players</div><ul class="players" id="playersList"><li>No players yet</li></ul></div>
        <div class="sub"><div class="sub-title">Chat</div><div class="chat" id="chat"></div><div class="chatrow"><input id="chatInput" placeholder="Type message..."><button class="btn small" id="sendBtn">Send</button></div></div>
        <div class="sub"><div class="sub-title">Game Panel</div><div class="gamebox" id="gameBox"></div></div>
      </div>
    </section>
  </main>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const $ = (id)=>document.getElementById(id);
    const pretty = { lounge:'Void Lounge', mafia:'Mafia Lite', confession:'Confession Room', truth:'Truth or Dare', debate:'Debate Arena', mystery:'Mystery Room' };
    let current = { username:'', roomCode:'', space:'lounge', host:false };
    let localStream = null, audioContext = null, analyser = null, speakingTimer = null, speaking = false, camFacing='user';
    const peers = new Map();
    const players = new Map();

    socket.on('connect',()=>{ $('conn').textContent='online'; $('conn').classList.add('online'); });
    socket.on('disconnect',()=>{ $('conn').textContent='offline'; $('conn').classList.remove('online'); });

    document.querySelectorAll('.space').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.space').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('space').value=b.dataset.space; });
    $('randomRoom').onclick=()=> $('roomCode').value = Math.floor(100000 + Math.random()*900000);
    if(!$('roomCode').value) $('roomCode').value = Math.floor(100000 + Math.random()*900000);

    $('joinBtn').onclick = async ()=>{
      current.username = $('username').value.trim() || 'Guest';
      current.roomCode = $('roomCode').value.trim() || 'VOID';
      current.space = $('space').value || 'lounge';
      socket.emit('join-space', current);
      $('portalPanel').style.display='none'; $('roomPanel').style.display='block'; $('mainGrid').style.display='grid';
      $('currentSpace').textContent=pretty[current.space]||current.space; $('currentRoom').textContent=current.roomCode;
      setGamePanel(current.space);
      addSystem('Joined room. Turn camera/mic on when ready.');
      renderLocalPlaceholder();
    };
    $('leaveBtn').onclick = ()=>{ socket.emit('leave-room'); cleanup(); location.reload(); };
    $('startBtn').onclick = ()=> socket.emit('start-game');
    $('sendBtn').onclick = sendChat; $('chatInput').addEventListener('keydown',e=>{ if(e.key==='Enter') sendChat(); });

    $('camBtn').onclick = async ()=>{ await ensureMedia(); const track = localStream?.getVideoTracks()[0]; if(!track) return; track.enabled=!track.enabled; updateControlButtons(); socket.emit('media-state',{camOn:track.enabled,micOn:getMicOn(),speaking}); };
    $('micBtn').onclick = async ()=>{ await ensureMedia(); const track = localStream?.getAudioTracks()[0]; if(!track) return; track.enabled=!track.enabled; updateControlButtons(); socket.emit('media-state',{camOn:getCamOn(),micOn:track.enabled,speaking:false}); if(track.enabled) startSpeakingDetection(); };
    $('switchCamBtn').onclick = async ()=>{ camFacing = camFacing === 'user' ? 'environment' : 'user'; await restartCamera(); };

    function getCamOn(){ return !!localStream?.getVideoTracks()[0]?.enabled; }
    function getMicOn(){ return !!localStream?.getAudioTracks()[0]?.enabled; }
    function updateControlButtons(){
      const camOn=getCamOn(), micOn=getMicOn();
      $('camBtn').textContent = camOn ? '📷 Camera On' : '📷 Camera Off'; $('camBtn').className = camOn ? 'btn on' : 'btn off';
      $('micBtn').textContent = micOn ? '🎙 Mic On' : '🎙 Mic Off'; $('micBtn').className = micOn ? 'btn on' : 'btn off';
      $('mediaStatus').textContent = 'camera: '+(camOn?'on':'off')+' / mic: '+(micOn?'on':'off');
      updateLocalCardState();
    }
    async function ensureMedia(){
      if(localStream) return localStream;
      try{
        localStream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:camFacing,width:{ideal:1280},height:{ideal:720}}, audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true} });
        renderLocalVideo(); updateControlButtons(); startSpeakingDetection();
        for(const [id, pc] of peers){ localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); await renegotiate(id, pc); }
        return localStream;
      }catch(err){ addSystem('Camera/mic permission blocked or unavailable. Enable permissions in browser.'); console.error(err); }
    }
    async function restartCamera(){
      if(!localStream) return ensureMedia();
      const old = localStream.getVideoTracks()[0]; if(old) old.stop();
      try{
        const ns = await navigator.mediaDevices.getUserMedia({video:{facingMode:camFacing,width:{ideal:1280},height:{ideal:720}}, audio:false});
        const newTrack = ns.getVideoTracks()[0];
        if(old) localStream.removeTrack(old); localStream.addTrack(newTrack);
        const lv=$('video-local'); if(lv) lv.srcObject=localStream;
        for(const [id, pc] of peers){ const sender=pc.getSenders().find(s=>s.track&&s.track.kind==='video'); if(sender) await sender.replaceTrack(newTrack); else pc.addTrack(newTrack,localStream); await renegotiate(id,pc); }
        updateControlButtons(); socket.emit('media-state',{camOn:getCamOn(),micOn:getMicOn(),speaking});
      }catch(e){ addSystem('Could not switch camera.'); }
    }
    function startSpeakingDetection(){
      try{
        if(!localStream || !getMicOn()) return;
        if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(localStream);
        analyser = audioContext.createAnalyser(); analyser.fftSize=512; analyser.smoothingTimeConstant=.72; source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        if(speakingTimer) cancelAnimationFrame(speakingTimer);
        const loop=()=>{ analyser.getByteFrequencyData(data); const avg=data.reduce((a,b)=>a+b,0)/data.length; const now=avg>18 && getMicOn(); if(now!==speaking){ speaking=now; socket.emit('speaking', { speaking }); updateLocalCardState(); } speakingTimer=requestAnimationFrame(loop); };
        loop();
      }catch(e){ console.warn(e); }
    }

    socket.on('joined-space', async ({ players: list, existingPeers })=>{
      list.forEach(p=>players.set(p.id,p)); renderPlayers();
      for(const p of existingPeers){ createPeer(p.id, true); }
    });
    socket.on('players-update', list=>{ players.clear(); list.forEach(p=>players.set(p.id,p)); renderPlayers(); updateAllCardStates(); });
    socket.on('peer-joined', ({peerId, username})=>{ addSystem(username+' joined.'); players.set(peerId,{id:peerId,username}); renderPlayers(); createPeer(peerId, false); });
    socket.on('peer-left', ({peerId, username})=>{ addSystem(username+' left.'); removePeer(peerId); players.delete(peerId); renderPlayers(); });
    socket.on('system-message', addSystem);
    socket.on('chat-message', ({username,message})=> addMsg(username,message));
    socket.on('game-started', msg=> addSystem(msg));
    socket.on('webrtc-offer', async ({from, offer})=>{ const pc=createPeer(from,false); await pc.setRemoteDescription(new RTCSessionDescription(offer)); const answer=await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit('webrtc-answer',{to:from,answer}); });
    socket.on('webrtc-answer', async ({from, answer})=>{ const pc=peers.get(from); if(pc) await pc.setRemoteDescription(new RTCSessionDescription(answer)); });
    socket.on('webrtc-ice', async ({from, candidate})=>{ const pc=peers.get(from); if(pc && candidate) { try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch(e){ console.warn(e); } } });
    socket.on('speaking-update', ({peerId, speaking})=>{ const p=players.get(peerId)||{}; p.speaking=speaking; players.set(peerId,p); updateCardState(peerId); renderPlayers(); });

    function createPeer(peerId, initiator){
      if(peers.has(peerId)) return peers.get(peerId);
      const pc = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}] });
      peers.set(peerId, pc);
      if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
      pc.onicecandidate = e=>{ if(e.candidate) socket.emit('webrtc-ice',{to:peerId,candidate:e.candidate}); };
      pc.ontrack = e=> renderRemoteVideo(peerId, e.streams[0]);
      pc.onconnectionstatechange = ()=>{ if(['failed','closed','disconnected'].includes(pc.connectionState)) console.log('peer state', peerId, pc.connectionState); };
      if(initiator) setTimeout(()=>renegotiate(peerId,pc),250);
      return pc;
    }
    async function renegotiate(peerId, pc){ try{ const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true}); await pc.setLocalDescription(offer); socket.emit('webrtc-offer',{to:peerId,offer}); }catch(e){ console.warn(e); } }
    function removePeer(peerId){ const pc=peers.get(peerId); if(pc) pc.close(); peers.delete(peerId); const el=$('card-'+peerId); if(el) el.remove(); }
    function cleanup(){ peers.forEach(pc=>pc.close()); peers.clear(); if(localStream) localStream.getTracks().forEach(t=>t.stop()); }

    function renderLocalPlaceholder(){ if($('card-local')) return; const div=document.createElement('div'); div.className='video-card local'; div.id='card-local'; div.innerHTML='<div class="empty-video">Camera is off<br>Tap Camera On</div><div class="video-meta"><span class="name">You</span><span class="icons"><span id="mic-local" class="mic off">🎙</span><span id="cam-local" class="cam off">📷</span></span></div>'; $('videoGrid').prepend(div); }
    function renderLocalVideo(){ let card=$('card-local'); if(!card){ renderLocalPlaceholder(); card=$('card-local'); } card.innerHTML='<video id="video-local" autoplay muted playsinline></video><div class="video-meta"><span class="name">You</span><span class="icons"><span id="mic-local" class="mic">🎙</span><span id="cam-local" class="cam">📷</span></span></div>'; $('video-local').srcObject=localStream; }
    function renderRemoteVideo(peerId, stream){ let card=$('card-'+peerId); const name=players.get(peerId)?.username || 'Guest'; if(!card){ card=document.createElement('div'); card.className='video-card'; card.id='card-'+peerId; card.innerHTML='<video id="video-'+peerId+'" autoplay playsinline></video><div class="video-meta"><span class="name" id="name-'+peerId+'"></span><span class="icons"><span id="mic-'+peerId+'" class="mic">🎙</span><span id="cam-'+peerId+'" class="cam">📷</span></span></div>'; $('videoGrid').appendChild(card); } $('name-'+peerId).textContent=name; $('video-'+peerId).srcObject=stream; updateCardState(peerId); }
    function updateLocalCardState(){ const mic=$('mic-local'), cam=$('cam-local'); if(mic){ mic.classList.toggle('off',!getMicOn()); mic.classList.toggle('speaking',speaking && getMicOn()); } if(cam){ cam.classList.toggle('off',!getCamOn()); } }
    function updateCardState(peerId){ const p=players.get(peerId)||{}; const mic=$('mic-'+peerId), cam=$('cam-'+peerId); if(mic){ mic.classList.toggle('off',p.micOn===false); mic.classList.toggle('speaking',!!p.speaking && p.micOn!==false); } if(cam){ cam.classList.toggle('off',p.camOn===false); } }
    function updateAllCardStates(){ updateLocalCardState(); players.forEach((_,id)=>updateCardState(id)); }

    function renderPlayers(){ const ul=$('playersList'); const arr=Array.from(players.values()); if(!arr.length){ul.innerHTML='<li>No players yet</li>';return} ul.innerHTML=arr.map(p=>'<li><span>'+esc(p.username||'Guest')+'</span><span class="badges">'+(p.id===socket.id?'<span class="badge you">YOU</span>':'')+(p.isHost?'<span class="badge host">HOST</span>':'')+(p.speaking?'<span class="badge talk">TALK</span>':'')+'</span></li>').join(''); }
    function sendChat(){ const input=$('chatInput'); const message=input.value.trim(); if(!message) return; socket.emit('chat-message', message); input.value=''; }
    function addMsg(who,msg){ const div=document.createElement('p'); div.className='msg'; div.innerHTML='<span class="who">'+esc(who)+':</span> '+esc(msg); $('chat').appendChild(div); $('chat').scrollTop=$('chat').scrollHeight; }
    function addSystem(msg){ const div=document.createElement('p'); div.className='msg system'; div.textContent='// '+msg; $('chat').appendChild(div); $('chat').scrollTop=$('chat').scrollHeight; }
    function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function setGamePanel(space){ const gb=$('gameBox'); if(space==='truth'){gb.innerHTML='<h3>Truth or Dare</h3><p>Spin a random player from the room.</p><button class="btn small" id="spinBtn">Spin Player</button><div class="result" id="spinResult"></div>'; setTimeout(()=>{$('spinBtn').onclick=()=>{ const arr=Array.from(players.values()); const p=arr[Math.floor(Math.random()*arr.length)]; $('spinResult').textContent=p?('Selected: '+p.username):'No players yet'; };},0);} else if(space==='mafia'){gb.innerHTML='<h3>Mafia Lite</h3><p>Lobby is ready. Next upgrade: role assignment, day/night timer, voting.</p>';} else if(space==='confession'){gb.innerHTML='<h3>Confession Room</h3><p>Next upgrade: anonymous confession submit and reveal round.</p>';} else if(space==='debate'){gb.innerHTML='<h3>Debate Arena</h3><p>Next upgrade: random topics, timer, audience vote.</p>';} else if(space==='mystery'){gb.innerHTML='<h3>Mystery Room</h3><p>Next upgrade: detective clues and liar game.</p>';} else {gb.innerHTML='<h3>Void Lounge</h3><p>Video, audio, chat and neon room are active.</p>';}}
  </script>
</body>
</html>`);
});

io.on('connection', socket => {
  socket.on('join-space', ({ username = 'Guest', roomCode = 'VOID', space = 'lounge' }) => {
    leaveCurrentRoom(socket);
    const key = roomKey(space, roomCode);
    const room = getRoom(key);
    room.space = space;
    room.roomCode = roomCode;
    if (!room.hostId) room.hostId = socket.id;
    room.players.set(socket.id, { username, micOn: false, camOn: false, speaking: false });
    socket.data.roomKey = key;
    socket.join(key);

    const existingPeers = Array.from(room.players.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, p]) => ({ id, username: p.username }));

    socket.emit('joined-space', { players: publicPlayers(room), existingPeers, hostId: room.hostId });
    socket.to(key).emit('peer-joined', { peerId: socket.id, username });
    io.to(key).emit('players-update', publicPlayers(room));
  });

  socket.on('leave-room', () => leaveCurrentRoom(socket));

  socket.on('chat-message', message => {
    const key = socket.data.roomKey;
    if (!key || !rooms.has(key)) return;
    const room = rooms.get(key);
    const player = room.players.get(socket.id);
    if (!player) return;
    io.to(key).emit('chat-message', { username: player.username, message: String(message).slice(0, 500) });
  });

  socket.on('start-game', () => {
    const key = socket.data.roomKey;
    if (!key || !rooms.has(key)) return;
    const room = rooms.get(key);
    if (room.hostId !== socket.id) return socket.emit('system-message', 'Only host can start.');
    io.to(key).emit('game-started', `${room.space} started by host.`);
  });

  socket.on('media-state', state => {
    const key = socket.data.roomKey;
    if (!key || !rooms.has(key)) return;
    const room = rooms.get(key);
    const p = room.players.get(socket.id);
    if (!p) return;
    p.camOn = !!state.camOn;
    p.micOn = !!state.micOn;
    p.speaking = !!state.speaking;
    io.to(key).emit('players-update', publicPlayers(room));
  });

  socket.on('speaking', ({ speaking }) => {
    const key = socket.data.roomKey;
    if (!key || !rooms.has(key)) return;
    const room = rooms.get(key);
    const p = room.players.get(socket.id);
    if (!p) return;
    p.speaking = !!speaking;
    socket.to(key).emit('speaking-update', { peerId: socket.id, speaking: !!speaking });
  });

  socket.on('webrtc-offer', ({ to, offer }) => socket.to(to).emit('webrtc-offer', { from: socket.id, offer }));
  socket.on('webrtc-answer', ({ to, answer }) => socket.to(to).emit('webrtc-answer', { from: socket.id, answer }));
  socket.on('webrtc-ice', ({ to, candidate }) => socket.to(to).emit('webrtc-ice', { from: socket.id, candidate }));

  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

server.listen(PORT, () => console.log(`VOID PORTAL running on port ${PORT}`));
