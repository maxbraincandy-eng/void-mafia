const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

const rooms = new Map();

const pretty = {
  lounge: "Void Lounge",
  mafia: "Mafia Lite",
  confession: "Confession Room",
  truth: "Truth or Dare",
  debate: "Debate Arena",
  mystery: "Mystery Room"
};

function roomKey(space, code) { return `${space}:${code}`; }
function getRoom(key) {
  if (!rooms.has(key)) rooms.set(key, { players: [], hostId: null, messages: [] });
  return rooms.get(key);
}
function publicPlayers(room) {
  return room.players.map(p => ({ id: p.id, username: p.username, isHost: p.id === room.hostId }));
}
function emitRoomState(key) {
  const room = getRoom(key);
  io.to(key).emit("room-state", { players: publicPlayers(room), hostId: room.hostId });
}
function leaveCurrentRoom(socket) {
  const data = socket.data.current;
  if (!data) return;
  const key = data.key;
  const room = getRoom(key);
  room.players = room.players.filter(p => p.id !== socket.id);
  if (room.hostId === socket.id) room.hostId = room.players[0]?.id || null;
  socket.leave(key);
  io.to(key).emit("system-message", `${data.username} left the room.`);
  emitRoomState(key);
  if (room.players.length === 0) rooms.delete(key);
  socket.data.current = null;
}

io.on("connection", socket => {
  socket.on("join-space", payload => {
    const username = String(payload?.username || "Player").trim().slice(0, 24) || "Player";
    const roomCode = String(payload?.roomCode || "VOID").trim().slice(0, 16) || "VOID";
    const space = String(payload?.space || "lounge").trim();
    const key = roomKey(space, roomCode);

    leaveCurrentRoom(socket);
    const room = getRoom(key);
    if (!room.hostId) room.hostId = socket.id;
    room.players.push({ id: socket.id, username });
    socket.join(key);
    socket.data.current = { key, username, roomCode, space };

    socket.emit("joined", { username, roomCode, space, spaceName: pretty[space] || space, isHost: room.hostId === socket.id });
    socket.emit("chat-history", room.messages.slice(-30));
    io.to(key).emit("system-message", `${username} joined ${pretty[space] || space}.`);
    emitRoomState(key);
  });

  socket.on("chat-message", text => {
    const data = socket.data.current;
    if (!data) return;
    const msg = { username: data.username, text: String(text || "").slice(0, 500), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
    if (!msg.text.trim()) return;
    const room = getRoom(data.key);
    room.messages.push(msg);
    room.messages = room.messages.slice(-50);
    io.to(data.key).emit("chat-message", msg);
  });

  socket.on("start-game", () => {
    const data = socket.data.current;
    if (!data) return;
    const room = getRoom(data.key);
    if (room.hostId !== socket.id) return socket.emit("system-message", "Only host can start.");
    io.to(data.key).emit("system-message", `HOST started ${pretty[data.space] || data.space}.`);
    if (data.space === "truth") {
      const players = room.players;
      const chosen = players[Math.floor(Math.random() * players.length)];
      if (chosen) io.to(data.key).emit("game-event", `Truth or Dare selected: ${chosen.username}`);
    } else if (data.space === "mafia") {
      io.to(data.key).emit("game-event", "Mafia Lite engine coming next: roles, day/night, voting.");
    } else if (data.space === "confession") {
      io.to(data.key).emit("game-event", "Confession Room opened. Anonymous submit will come next.");
    } else {
      io.to(data.key).emit("game-event", "Game space activated.");
    }
  });

  socket.on("leave-room", () => leaveCurrentRoom(socket));
  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>VOID PORTAL</title>
<style>
:root{--bg:#04050d;--panel:rgba(13,18,40,.78);--line:rgba(115,245,255,.22);--text:#f7f8ff;--muted:#aab2d6;--cyan:#5ff6ff;--pink:#ff4fd8;--violet:#8c63ff;--danger:#ff5f87}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 15% 5%,rgba(255,79,216,.28),transparent 30%),radial-gradient(circle at 90% 20%,rgba(95,246,255,.18),transparent 35%),linear-gradient(135deg,#03040b,#080b19 45%,#04050d);overflow-x:hidden}.grid{position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:34px 34px;opacity:.35;pointer-events:none}.wrap{position:relative;max-width:1050px;margin:auto;padding:18px 12px 38px}.panel{background:linear-gradient(180deg,rgba(17,22,49,.84),rgba(8,10,24,.82));border:1px solid rgba(122,145,255,.18);border-radius:26px;padding:18px;margin-bottom:16px;box-shadow:0 20px 60px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(16px)}.top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.eyebrow{font-size:11px;letter-spacing:.32em;color:var(--cyan);text-shadow:0 0 14px rgba(95,246,255,.8)}.powered{font-size:12px;color:#ffd6f6;border:1px solid rgba(255,79,216,.28);border-radius:999px;padding:7px 10px;background:rgba(255,79,216,.09);box-shadow:0 0 22px rgba(255,79,216,.22)}h1{font-size:clamp(42px,12vw,92px);line-height:.9;margin:12px 0 10px;font-weight:950;letter-spacing:-.06em;text-shadow:0 0 12px rgba(255,255,255,.25),0 0 30px rgba(95,246,255,.22)}.glitch{position:relative;display:inline-block}.glitch:before,.glitch:after{content:attr(data-text);position:absolute;inset:0;pointer-events:none}.glitch:before{color:var(--cyan);transform:translate(2px,-1px);clip-path:inset(0 0 52% 0);opacity:.75}.glitch:after{color:var(--pink);transform:translate(-2px,1px);clip-path:inset(48% 0 0 0);opacity:.75}.sub{margin:0;color:var(--muted);font-size:clamp(16px,4vw,24px)}label{display:block;margin:0 0 8px;color:#dfe6ff;font-weight:800;font-size:14px}.field{margin-bottom:16px}input{width:100%;border:1px solid rgba(111,131,255,.22);background:rgba(5,8,20,.85);color:white;border-radius:18px;padding:16px;font-size:16px;outline:none}input:focus{border-color:rgba(95,246,255,.7);box-shadow:0 0 0 4px rgba(95,246,255,.08),0 0 24px rgba(95,246,255,.18)}.row{display:flex;gap:10px}.row input{flex:1}.smallBtn{width:auto!important;white-space:nowrap;padding:14px 15px!important}.spaces{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{border:1px solid rgba(133,150,255,.18);background:linear-gradient(180deg,rgba(14,18,39,.97),rgba(8,10,24,.94));border-radius:18px;padding:15px;text-align:left;color:white;cursor:pointer;transition:.18s}.card.active{border-color:rgba(255,79,216,.62);box-shadow:0 0 0 1px rgba(255,79,216,.22),0 0 26px rgba(255,79,216,.18)}.card:hover{transform:translateY(-2px);border-color:rgba(95,246,255,.52)}.title{display:block;font-size:17px;font-weight:950;margin-bottom:5px}.desc{display:block;color:var(--muted);font-size:13px;line-height:1.35}.btn{width:100%;border:0;border-radius:18px;padding:16px 18px;font-size:16px;font-weight:950;cursor:pointer;color:#04101b;background:linear-gradient(90deg,var(--cyan),#9cf9ff 45%,#ff9dee);box-shadow:0 10px 30px rgba(95,246,255,.18),0 0 25px rgba(255,79,216,.16)}.ghost{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:white;border-radius:14px;padding:12px 14px;font-weight:850}.ghost.danger{color:#ffd0dc;border-color:rgba(255,95,135,.28)}.status{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}.dot{width:9px;height:9px;border-radius:50%;background:#777}.dot.on{background:var(--cyan);box-shadow:0 0 14px var(--cyan)}.bar{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.mini{font-size:10px;letter-spacing:.18em;color:#7f89aa;text-transform:uppercase}.value{font-size:18px;font-weight:950}.actions{display:flex;gap:9px;flex-wrap:wrap}.roomgrid{display:grid;grid-template-columns:280px 1fr;gap:14px}.subpanel{background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:14px}.subttl{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:var(--cyan);font-weight:950;margin-bottom:12px}ul{list-style:none;margin:0;padding:0}li{padding:11px 12px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.05);margin-bottom:8px;color:#dfe6ff}.badge{font-size:10px;margin-left:6px;color:#06101d;background:var(--cyan);border-radius:999px;padding:3px 6px;font-weight:950}.badge.host{background:var(--pink)}.chat{height:260px;overflow:auto;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.05);border-radius:16px;padding:12px;margin-bottom:12px}.msg{margin-bottom:10px;color:#dfe6ff}.msg b{color:var(--cyan)}.sys{color:#ffd6f6;font-style:italic}.game{color:#fff;background:rgba(255,79,216,.09);border:1px solid rgba(255,79,216,.18);border-radius:12px;padding:10px;margin:8px 0}@media(max-width:820px){.spaces{grid-template-columns:1fr}.roomgrid{grid-template-columns:1fr}.panel{border-radius:22px;padding:15px}.wrap{padding:12px 8px 32px}.row{flex-direction:column}.smallBtn{width:100%!important}.actions .ghost{flex:1}}
</style>
</head>
<body>
<div class="grid"></div>
<main class="wrap">
  <section class="panel">
    <div class="top"><span class="eyebrow">PRIVATE SOCIAL GAME HUB</span><span class="powered">powered by ბატონი მაქსი</span></div>
    <h1 class="glitch" data-text="VOID PORTAL">VOID PORTAL</h1>
    <p class="sub">Enter the room. Choose the game. Trust nobody.</p>
    <div class="status" style="margin-top:14px"><span id="dot" class="dot"></span><span id="status">Connecting...</span></div>
  </section>

  <section class="panel">
    <div class="field"><label>Username</label><input id="username" value="max" maxlength="24"></div>
    <div class="field"><label>Room Code</label><div class="row"><input id="roomCode" value="373828" maxlength="16"><button class="ghost smallBtn" id="randomBtn">Random</button></div></div>
    <div class="field"><label>Choose Space</label><input id="space" type="hidden" value="lounge"><div class="spaces" id="spaces">
      <button class="card active" data-space="lounge"><span class="title">Void Lounge</span><span class="desc">Chat, chill, gather players</span></button>
      <button class="card" data-space="mafia"><span class="title">Mafia Lite</span><span class="desc">Roles, lobby, future day/night</span></button>
      <button class="card" data-space="confession"><span class="title">Confession Room</span><span class="desc">Anonymous secrets and reveal</span></button>
      <button class="card" data-space="truth"><span class="title">Truth or Dare</span><span class="desc">Spin a player and play</span></button>
      <button class="card" data-space="debate"><span class="title">Debate Arena</span><span class="desc">Topics, timer, audience votes</span></button>
      <button class="card" data-space="mystery"><span class="title">Mystery Room</span><span class="desc">Detective, liar, clues</span></button>
    </div></div>
    <button class="btn" id="joinBtn">Create / Join Room</button>
  </section>

  <section class="panel">
    <div class="bar">
      <div><div class="mini">CURRENT SPACE</div><div class="value" id="currentSpace">Void Lounge</div></div>
      <div><div class="mini">ROOM</div><div class="value" id="currentRoom">VOID</div></div>
      <div class="actions"><button class="ghost" id="startBtn">Start</button><button class="ghost danger" id="leaveBtn">Leave</button></div>
    </div>
    <div class="roomgrid" style="margin-top:14px">
      <div class="subpanel"><div class="subttl">Players <span id="playerCount">0</span></div><ul id="players"><li>No players yet</li></ul></div>
      <div class="subpanel"><div class="subttl">Portal Chat</div><div id="chat" class="chat"></div><div class="row"><input id="chatInput" placeholder="Type a message..."><button id="sendBtn" class="btn smallBtn">Send</button></div></div>
    </div>
  </section>
</main>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const pretty = {lounge:"Void Lounge",mafia:"Mafia Lite",confession:"Confession Room",truth:"Truth or Dare",debate:"Debate Arena",mystery:"Mystery Room"};
let myId = null;
const $ = id => document.getElementById(id);
function addLine(html, cls="msg"){ const d=document.createElement('div'); d.className=cls; d.innerHTML=html; $('chat').appendChild(d); $('chat').scrollTop=$('chat').scrollHeight; }
socket.on('connect',()=>{myId=socket.id; $('dot').className='dot on'; $('status').textContent='Connected';});
socket.on('disconnect',()=>{ $('dot').className='dot'; $('status').textContent='Disconnected';});
document.querySelectorAll('.card').forEach(card=>card.onclick=()=>{document.querySelectorAll('.card').forEach(c=>c.classList.remove('active'));card.classList.add('active');$('space').value=card.dataset.space;$('currentSpace').textContent=pretty[card.dataset.space]||card.dataset.space;});
$('randomBtn').onclick=()=>{$('roomCode').value=String(Math.floor(100000+Math.random()*900000));};
$('joinBtn').onclick=()=>{socket.emit('join-space',{username:$('username').value,roomCode:$('roomCode').value,space:$('space').value});};
$('sendBtn').onclick=()=>{socket.emit('chat-message',$('chatInput').value);$('chatInput').value='';};
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('sendBtn').click();});
$('startBtn').onclick=()=>socket.emit('start-game');
$('leaveBtn').onclick=()=>socket.emit('leave-room');
socket.on('joined',data=>{$('currentSpace').textContent=data.spaceName;$('currentRoom').textContent=data.roomCode; addLine('Entered <b>'+data.spaceName+'</b> room <b>'+data.roomCode+'</b>','sys');});
socket.on('chat-history',msgs=>{msgs.forEach(m=>addLine('<b>'+escapeHtml(m.username)+'</b> <small>'+m.time+'</small>: '+escapeHtml(m.text)));});
socket.on('system-message',t=>addLine(escapeHtml(t),'sys'));
socket.on('game-event',t=>addLine(escapeHtml(t),'game'));
socket.on('chat-message',m=>addLine('<b>'+escapeHtml(m.username)+'</b> <small>'+m.time+'</small>: '+escapeHtml(m.text)));
socket.on('room-state',s=>{ $('playerCount').textContent=s.players.length; $('players').innerHTML=''; if(!s.players.length){$('players').innerHTML='<li>No players yet</li>';return;} s.players.forEach(p=>{ const li=document.createElement('li'); li.innerHTML=escapeHtml(p.username)+(p.id===myId?' <span class="badge">YOU</span>':'')+(p.isHost?' <span class="badge host">HOST</span>':''); $('players').appendChild(li); }); });
function escapeHtml(str){return String(str).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
</script>
</body>
</html>`;

app.get("/", (_req, res) => res.type("html").send(html));
app.get("/health", (_req, res) => res.json({ ok: true }));

server.listen(PORT, () => console.log(`VOID PORTAL running on port ${PORT}`));
