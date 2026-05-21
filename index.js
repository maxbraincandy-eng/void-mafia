const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const spaces = {
  mafia: { label: "Mafia", icon: "♛", max: 8 },
  truth: { label: "Truth", icon: "◆", max: 8 },
  debate: { label: "Debate", icon: "◇", max: 8 },
  lounge: { label: "Lounge", icon: "◌", max: 8 },
  confession: { label: "Confession", icon: "✦", max: 8 },
  mystery: { label: "Mystery", icon: "✧", max: 8 }
};

function safeText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 40);
}

function keyFor(space, code) {
  return `${space}:${code}`;
}

function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    space: room.space,
    label: spaces[room.space]?.label || room.space,
    hostId: room.hostId,
    hostName: room.players.get(room.hostId)?.username || "Host",
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.username,
      isHost: p.id === room.hostId,
      mic: !!p.mic,
      cam: !!p.cam,
      speaking: !!p.speaking
    })),
    playerCount: room.players.size,
    max: spaces[room.space]?.max || 8,
    status: room.status || "Waiting"
  };
}

function broadcastRooms() {
  io.emit("rooms:update", Array.from(rooms.values()).map(publicRoom));
}

function removeFromCurrentRoom(socket, reason = "left") {
  const key = socket.data.roomKey;
  if (!key || !rooms.has(key)) return;

  const room = rooms.get(key);
  const wasHost = room.hostId === socket.id;

  socket.leave(key);
  room.players.delete(socket.id);

  socket.to(key).emit("peer:left", { id: socket.id });

  socket.data.roomKey = null;
  socket.data.space = null;
  socket.data.code = null;

  if (wasHost) {
    io.to(key).emit("room:closed", {
      reason: "Host left. Room was deleted."
    });

    for (const player of room.players.values()) {
      const s = io.sockets.sockets.get(player.id);
      if (s) {
        s.leave(key);
        s.data.roomKey = null;
        s.data.space = null;
        s.data.code = null;
      }
    }

    rooms.delete(key);
    broadcastRooms();
    return;
  }

  io.to(key).emit("room:update", publicRoom(room));
  broadcastRooms();
}

io.on("connection", (socket) => {
  socket.emit("rooms:update", Array.from(rooms.values()).map(publicRoom));

  socket.on("room:create", ({ username, space, code }) => {
    username = safeText(username, "Guest");
    space = spaces[space] ? space : "mafia";
    code = safeText(code || Math.floor(100000 + Math.random() * 900000), "VOID");

    removeFromCurrentRoom(socket);

    const key = keyFor(space, code);
    if (rooms.has(key)) {
      socket.emit("notice", { type: "error", text: "Room already exists. Join it instead." });
      return;
    }

    const room = {
      id: key,
      code,
      space,
      hostId: socket.id,
      status: "Waiting",
      players: new Map()
    };

    room.players.set(socket.id, {
      id: socket.id,
      username,
      mic: false,
      cam: false,
      speaking: false
    });

    rooms.set(key, room);

    socket.join(key);
    socket.data.roomKey = key;
    socket.data.space = space;
    socket.data.code = code;

    socket.emit("room:joined", {
      room: publicRoom(room),
      selfId: socket.id,
      existingPeers: []
    });

    io.to(key).emit("room:update", publicRoom(room));
    broadcastRooms();
  });

  socket.on("room:join", ({ username, space, code }) => {
    username = safeText(username, "Guest");
    space = spaces[space] ? space : "mafia";
    code = safeText(code, "");

    const key = keyFor(space, code);
    const room = rooms.get(key);

    if (!room) {
      socket.emit("notice", { type: "error", text: "Room not found." });
      return;
    }

    if (room.players.size >= (spaces[space]?.max || 8)) {
      socket.emit("notice", { type: "error", text: "Room is full." });
      return;
    }

    removeFromCurrentRoom(socket);

    const existingPeers = Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.username
    }));

    room.players.set(socket.id, {
      id: socket.id,
      username,
      mic: false,
      cam: false,
      speaking: false
    });

    socket.join(key);
    socket.data.roomKey = key;
    socket.data.space = space;
    socket.data.code = code;

    socket.emit("room:joined", {
      room: publicRoom(room),
      selfId: socket.id,
      existingPeers
    });

    socket.to(key).emit("peer:joined", {
      id: socket.id,
      username
    });

    io.to(key).emit("room:update", publicRoom(room));
    broadcastRooms();
  });

  socket.on("room:leave", () => removeFromCurrentRoom(socket));

  socket.on("room:start", () => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room || room.hostId !== socket.id) return;
    room.status = "In Room";
    io.to(key).emit("room:update", publicRoom(room));
    io.to(key).emit("notice", { type: "ok", text: `${spaces[room.space].label} room started.` });
    broadcastRooms();
  });

  socket.on("chat:message", (text) => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const message = safeText(text, "").slice(0, 220);
    if (!message) return;

    io.to(key).emit("chat:message", {
      id: Date.now() + Math.random(),
      userId: socket.id,
      username: player.username,
      text: message,
      time: new Date().toISOString()
    });
  });

  socket.on("media:state", (state) => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    player.mic = !!state.mic;
    player.cam = !!state.cam;
    player.speaking = !!state.speaking;

    io.to(key).emit("media:state", {
      id: socket.id,
      mic: player.mic,
      cam: player.cam,
      speaking: player.speaking
    });

    io.to(key).emit("room:update", publicRoom(room));
    broadcastRooms();
  });

  socket.on("webrtc:offer", ({ to, offer }) => {
    io.to(to).emit("webrtc:offer", { from: socket.id, offer });
  });

  socket.on("webrtc:answer", ({ to, answer }) => {
    io.to(to).emit("webrtc:answer", { from: socket.id, answer });
  });

  socket.on("webrtc:ice", ({ to, candidate }) => {
    io.to(to).emit("webrtc:ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    removeFromCurrentRoom(socket, "disconnect");
    broadcastRooms();
  });
});

const html = `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>VOID PORTAL</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#060713;
  --panel:rgba(10,14,33,.72);
  --panel2:rgba(16,20,45,.86);
  --line:rgba(135,158,255,.18);
  --text:#f6f7ff;
  --muted:#aeb6d7;
  --dim:#747d9e;
  --cyan:#5df7ff;
  --pink:#ff62dd;
  --violet:#8d6cff;
  --green:#39ff9d;
  --red:#ff5c8a;
  --yellow:#ffe66e;
  --safe-bottom: env(safe-area-inset-bottom);
  --nav-h: 78px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
body{
  min-height:100dvh;
  overflow-x:hidden;
  background:
    radial-gradient(circle at 10% -10%, rgba(255,98,221,.22), transparent 34%),
    radial-gradient(circle at 90% 10%, rgba(93,247,255,.18), transparent 38%),
    radial-gradient(circle at 50% 120%, rgba(141,108,255,.22), transparent 42%),
    #060713;
}
body:before{
  content:"";
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    repeating-linear-gradient(115deg, rgba(93,247,255,.06) 0 1px, transparent 1px 38px),
    repeating-linear-gradient(65deg, rgba(255,98,221,.05) 0 1px, transparent 1px 44px),
    linear-gradient(180deg, transparent 0, rgba(255,255,255,.025) 50%, transparent 100%);
  opacity:.65;
  mask-image:radial-gradient(circle at 50% 42%, black 0 62%, transparent 100%);
}
body:after{
  content:"";
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.026) 1px, transparent 1px);
  background-size:34px 34px;
  opacity:.22;
}
button,input{font:inherit}
button{border:none}
.hide{display:none!important}
.app{position:relative;z-index:1;min-height:100dvh;padding:12px 12px calc(var(--nav-h) + 24px + var(--safe-bottom))}
.home-view{max-width:760px;margin:0 auto}
.hero{
  position:relative;overflow:hidden;border:1px solid var(--line);border-radius:28px;
  background:linear-gradient(180deg,rgba(19,23,51,.72),rgba(6,8,22,.78));
  padding:18px;margin:0 0 12px;
  box-shadow:0 20px 60px rgba(0,0,0,.38), inset 0 1px rgba(255,255,255,.06);
}
.hero:before{
  content:"";position:absolute;inset:-80px;background:
    radial-gradient(circle at 20% 20%, rgba(93,247,255,.24), transparent 28%),
    radial-gradient(circle at 70% 0%, rgba(255,98,221,.18), transparent 32%);
  filter:blur(18px);opacity:.95;
}
.hero>*{position:relative}
.hero-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.eyebrow{font-size:10px;letter-spacing:.34em;color:var(--cyan);text-shadow:0 0 18px rgba(93,247,255,.65);font-weight:800}
.powered{font-size:11px;color:#ffd8f8;border:1px solid rgba(255,98,221,.32);background:rgba(255,98,221,.09);border-radius:999px;padding:7px 10px;box-shadow:0 0 18px rgba(255,98,221,.2)}
h1{
  margin:10px 0 6px;font-family:Orbitron,sans-serif;font-size:clamp(38px,12vw,72px);
  line-height:.92;letter-spacing:-.05em;text-shadow:0 0 20px rgba(255,255,255,.22);
}
.glitch{position:relative;display:inline-block}
.glitch:before,.glitch:after{content:attr(data-text);position:absolute;left:0;top:0;opacity:.65;pointer-events:none}
.glitch:before{color:var(--cyan);transform:translate(2px,-1px);clip-path:inset(0 0 50% 0);animation:gt 2.4s infinite linear alternate-reverse}
.glitch:after{color:var(--pink);transform:translate(-2px,1px);clip-path:inset(50% 0 0 0);animation:gb 2.1s infinite linear alternate-reverse}
@keyframes gt{0%,100%{transform:translate(1px,0)}40%{transform:translate(4px,-1px)}70%{transform:translate(-2px,1px)}}
@keyframes gb{0%,100%{transform:translate(-1px,0)}30%{transform:translate(-4px,1px)}70%{transform:translate(2px,-1px)}}
.subtitle{margin:0;color:var(--muted);font-size:15px;line-height:1.4}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.stat{border:1px solid var(--line);background:rgba(10,14,33,.62);border-radius:18px;padding:10px 8px;text-align:center;box-shadow:inset 0 1px rgba(255,255,255,.04)}
.stat strong{display:block;font-size:19px}
.stat span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:900}
.panel{
  border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,18,40,.78),rgba(6,8,22,.82));
  border-radius:26px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.05);
}
.profile-row{display:grid;grid-template-columns:1fr 128px;gap:10px;margin-bottom:12px}
.input{width:100%;border:1px solid rgba(135,158,255,.18);background:rgba(4,7,18,.78);color:white;border-radius:18px;padding:15px;outline:none;min-width:0}
.input:focus{border-color:rgba(93,247,255,.65);box-shadow:0 0 0 4px rgba(93,247,255,.08)}
.create-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.btn{
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:var(--text);
  border-radius:18px;padding:15px 14px;font-weight:900;cursor:pointer;
}
.btn.primary{color:#03101d;background:linear-gradient(90deg,var(--cyan),#d4ffff 46%,var(--pink));box-shadow:0 10px 30px rgba(93,247,255,.14),0 0 24px rgba(255,98,221,.14)}
.btn.danger{border-color:rgba(255,92,138,.35);color:#ffd3df}
.btn.tiny{padding:9px 12px;border-radius:13px;font-size:12px}
.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 2px 10px}
.section-title h2{margin:0;font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:#d9defe}
.section-title small{color:var(--dim);font-weight:800}
.rooms{display:flex;flex-direction:column;gap:10px}
.room-card{
  display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;
  border:1px solid rgba(135,158,255,.16);background:rgba(8,11,27,.72);border-radius:22px;padding:13px;
}
.room-main{min-width:0}
.room-name{display:flex;align-items:center;gap:8px;font-weight:900;font-size:17px}
.room-meta{margin-top:5px;color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:900;color:#cfd6ff;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);border-radius:999px;padding:5px 8px}
.badge.live{color:#b8ffd9;border-color:rgba(57,255,157,.25);background:rgba(57,255,157,.08)}
.empty{border:1px dashed rgba(135,158,255,.18);border-radius:22px;padding:26px 16px;text-align:center;color:var(--muted);background:rgba(6,8,22,.45)}
.bottom-nav{
  position:fixed;z-index:25;left:12px;right:12px;bottom:calc(10px + var(--safe-bottom));
  height:var(--nav-h);display:grid;grid-template-columns:repeat(5,1fr);gap:6px;
  padding:9px;border:1px solid rgba(135,158,255,.2);border-radius:26px;background:rgba(6,8,22,.86);
  backdrop-filter:blur(18px);box-shadow:0 -10px 40px rgba(0,0,0,.35), inset 0 1px rgba(255,255,255,.05);
}
.bottom-nav.room-mode{display:none!important}
.nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:20px;background:transparent;color:#aeb6d7;font-size:11px;font-weight:900}
.nav-item i{font-style:normal;font-size:22px;line-height:1}
.nav-item.active{color:white;border:1px solid rgba(93,247,255,.28);background:rgba(93,247,255,.08);box-shadow:0 0 24px rgba(93,247,255,.12)}
.more-pop{
  position:fixed;right:16px;bottom:calc(var(--nav-h) + 18px + var(--safe-bottom));z-index:30;
  min-width:190px;border:1px solid var(--line);border-radius:22px;background:rgba(8,10,24,.96);backdrop-filter:blur(16px);
  padding:8px;box-shadow:0 20px 60px rgba(0,0,0,.4)
}
.more-pop .nav-item{height:52px;flex-direction:row;justify-content:flex-start;padding:0 12px;font-size:13px}
.room-view{
  position:relative;z-index:1;max-width:760px;margin:0 auto;
  min-height:calc(100dvh - 26px - var(--safe-bottom));
  display:flex;flex-direction:column;gap:10px;
  padding-bottom:calc(86px + var(--safe-bottom));
}
.room-head{
  border:1px solid var(--line);border-radius:24px;background:rgba(8,11,27,.72);backdrop-filter:blur(14px);
  padding:11px 12px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;
}
.room-title{min-width:0}
.room-title .top{display:flex;align-items:center;gap:7px;font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:var(--cyan);font-weight:900}
.room-title h2{margin:3px 0 0;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.head-actions{display:flex;gap:7px}
.video-wrap{
  flex:1;min-height:0;border:1px solid rgba(135,158,255,.15);border-radius:24px;
  background:rgba(6,8,22,.48);padding:8px;overflow:hidden;
}
.video-grid{
  height:calc(100dvh - 188px - 86px - var(--safe-bottom));
  min-height:420px;max-height:760px;
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));
  gap:8px;overflow:hidden;
}
.tile{
  position:relative;overflow:hidden;border-radius:18px;background:
    radial-gradient(circle at 50% 42%, rgba(93,247,255,.09), transparent 28%),
    rgba(3,6,16,.92);
  border:1px solid rgba(135,158,255,.14);
  min-width:0;min-height:0;
}
.tile video{width:100%;height:100%;object-fit:cover;display:block;background:#030610}
.tile.self video{transform:scaleX(-1)}
.placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#aeb6d7;font-size:12px;padding:12px}
.tile-bar{
  position:absolute;left:7px;right:7px;bottom:7px;height:38px;border-radius:15px;padding:0 7px 0 10px;
  display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(0,0,0,.62);backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.08)
}
.tile-name{font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.tile-icons{display:flex;gap:5px;align-items:center}
.ico{
  width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.08);font-size:13px;flex:0 0 auto;
}
.ico.on{background:rgba(93,247,255,.12);border-color:rgba(93,247,255,.28)}
.ico.off{opacity:.58}
.ico.speaking{background:rgba(57,255,157,.18);border-color:rgba(57,255,157,.52);box-shadow:0 0 18px rgba(57,255,157,.45);animation:pulse 1.05s infinite ease-in-out}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
.more-cams{
  display:none;position:absolute;right:10px;top:10px;border-radius:999px;padding:7px 10px;background:rgba(0,0,0,.58);
  border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:900;color:white;backdrop-filter:blur(10px)
}
.control-dock{
  position:fixed;left:12px;right:12px;bottom:calc(10px + var(--safe-bottom));z-index:22;
  max-width:740px;margin:0 auto;display:grid;grid-template-columns:repeat(5,1fr);gap:7px;
  padding:8px;border:1px solid rgba(135,158,255,.18);border-radius:24px;background:rgba(6,8,22,.82);backdrop-filter:blur(18px);
  box-shadow:0 -12px 34px rgba(0,0,0,.32)
}
.ctrl{min-height:54px;border-radius:18px;background:rgba(255,255,255,.055);color:#e8ecff;font-weight:900;font-size:10px;display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center}
.ctrl b{font-size:18px;line-height:1}
.ctrl.on{border:1px solid rgba(57,255,157,.32);background:rgba(57,255,157,.09);box-shadow:0 0 22px rgba(57,255,157,.12)}
.ctrl.leave{border:1px solid rgba(255,92,138,.28);color:#ffd3df}
.chat-unread{position:absolute;right:6px;top:5px;min-width:18px;height:18px;border-radius:999px;background:var(--pink);color:white;font-size:10px;display:grid;place-items:center;font-weight:900;box-shadow:0 0 12px rgba(255,98,221,.65)}
.sheet-backdrop{position:fixed;inset:0;z-index:35;background:rgba(0,0,0,.46);backdrop-filter:blur(6px)}
.sheet{
  position:fixed;z-index:36;left:10px;right:10px;bottom:calc(8px + var(--safe-bottom));
  max-width:740px;margin:0 auto;border:1px solid rgba(93,247,255,.2);border-radius:28px;background:linear-gradient(180deg,rgba(10,14,34,.98),rgba(4,6,18,.98));
  padding:14px;box-shadow:0 -20px 70px rgba(0,0,0,.52),0 0 40px rgba(93,247,255,.07);max-height:72dvh;display:flex;flex-direction:column
}
.sheet-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.sheet-head h3{margin:0;font-size:14px;letter-spacing:.16em;text-transform:uppercase;display:flex;align-items:center;gap:8px}
.sheet-head h3:before{content:"✉";color:var(--cyan);text-shadow:0 0 12px rgba(93,247,255,.55)}
.close{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.06);color:white}
.chat-log{height:330px;overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:10px;background:radial-gradient(circle at 80% 15%,rgba(93,247,255,.05),transparent 32%),rgba(0,0,0,.22);display:flex;flex-direction:column;gap:8px}
.msg{align-self:flex-start;max-width:86%;padding:10px 12px;border-radius:17px 17px 17px 6px;background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.06);box-shadow:0 8px 22px rgba(0,0,0,.18)}
.msg.me{align-self:flex-end;background:linear-gradient(135deg,rgba(93,247,255,.16),rgba(255,98,221,.12));border-color:rgba(93,247,255,.18);border-radius:17px 17px 6px 17px}
.msg strong{display:block;font-size:11px;color:var(--cyan);margin-bottom:4px}
.msg span{font-size:14px;line-height:1.35}
.chat-send{display:grid;grid-template-columns:1fr 92px;gap:8px;margin-top:10px}
.players-list{display:flex;flex-direction:column;gap:8px;overflow:auto;max-height:55dvh}
.player-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.04);border-radius:17px;padding:12px}
.notice{position:fixed;z-index:60;left:18px;right:18px;top:calc(10px + env(safe-area-inset-top));max-width:720px;margin:0 auto;border-radius:18px;padding:12px 14px;background:rgba(8,10,24,.96);border:1px solid rgba(93,247,255,.28);box-shadow:0 12px 40px rgba(0,0,0,.35);font-weight:800}
@media(max-width:420px){
  .app{padding-left:8px;padding-right:8px}
  .hero{padding:15px}
  .profile-row{grid-template-columns:1fr}
  .create-row{grid-template-columns:1fr}
  .video-wrap{padding:6px;border-radius:20px}
  .video-grid{gap:6px;height:calc(100dvh - 176px - 84px - var(--safe-bottom));min-height:390px}
  .tile{border-radius:15px}
  .tile-bar{height:34px;left:5px;right:5px;bottom:5px;border-radius:13px}
  .tile-name{font-size:12px}
  .ico{width:25px;height:25px;font-size:12px}
  .bottom-nav{left:8px;right:8px}
  .control-dock{left:8px;right:8px;gap:5px}
  .ctrl{min-height:50px;font-size:9px}
}
@media(max-height:760px){
  .video-grid{height:calc(100dvh - 162px - 80px - var(--safe-bottom));min-height:340px}
  .room-head{padding:9px 10px}
  .control-dock{padding:6px}
  .ctrl{min-height:48px}
}
</style>
</head>
<body>
<div id="notice" class="notice hide"></div>

<div class="app">
  <main id="homeView" class="home-view">
    <section class="hero">
      <div class="hero-row">
        <span class="eyebrow">PRIVATE SOCIAL GAME HUB</span>
        <span class="powered">powered by ბატონი მაქსი</span>
      </div>
      <h1><span class="glitch" data-text="VOID PORTAL">VOID PORTAL</span></h1>
      <p class="subtitle">აირჩიე სივრცე, ნახე აქტიური ოთახები და შედი ცალკე მაგიდაზე.</p>
    </section>

    <section class="stats">
      <div class="stat"><strong id="activeRooms">0</strong><span>Rooms</span></div>
      <div class="stat"><strong id="onlinePlayers">0</strong><span>Players</span></div>
      <div class="stat"><strong id="currentModeShort">Mafia</strong><span>Mode</span></div>
    </section>

    <section class="panel">
      <div class="profile-row">
        <input id="username" class="input" placeholder="Username" maxlength="24" value="max" />
        <input id="roomCode" class="input" placeholder="Room code" maxlength="12" />
      </div>
      <div class="create-row">
        <button id="randomCodeBtn" class="btn">Random Code</button>
        <button id="createBtn" class="btn primary">Create Mafia Room</button>
      </div>
      <div class="section-title">
        <h2 id="roomsTitle">Mafia Rooms</h2>
        <small id="roomsCount">0 active</small>
      </div>
      <div id="roomsList" class="rooms"></div>
    </section>
  </main>

  <main id="roomView" class="room-view hide">
    <section class="room-head">
      <div class="room-title">
        <div class="top"><span id="roomModeIcon">♛</span><span id="roomMode">Mafia</span><span>•</span><span id="roomPlayersCount">1/8</span></div>
        <h2 id="roomName">Room #VOID</h2>
      </div>
      <div class="head-actions">
        <button id="startBtn" class="btn tiny primary">Start</button>
        <button id="topLeaveBtn" class="btn tiny danger">Leave</button>
      </div>
    </section>

    <section class="video-wrap">
      <div id="moreCams" class="more-cams">+0 more</div>
      <div id="videoGrid" class="video-grid"></div>
    </section>
  </main>
</div>

<nav class="bottom-nav" id="bottomNav">
  <button class="nav-item active" data-space="mafia"><i>♛</i><span>Mafia</span></button>
  <button class="nav-item" data-space="truth"><i>◆</i><span>Truth</span></button>
  <button class="nav-item" data-space="debate"><i>◇</i><span>Debate</span></button>
  <button class="nav-item" data-space="lounge"><i>◌</i><span>Lounge</span></button>
  <button class="nav-item" id="moreBtn"><i>＋</i><span>More</span></button>
</nav>

<div id="morePop" class="more-pop hide">
  <button class="nav-item" data-space="confession"><i>✦</i><span>Confession</span></button>
  <button class="nav-item" data-space="mystery"><i>✧</i><span>Mystery</span></button>
</div>

<div id="controlDock" class="control-dock hide">
  <button id="micBtn" class="ctrl"><b>🎙</b><span>Mic</span></button>
  <button id="camBtn" class="ctrl"><b>▣</b><span>Cam</span></button>
  <button id="switchBtn" class="ctrl"><b>⇄</b><span>Switch</span></button>
  <button id="chatBtn" class="ctrl"><b>✉</b><span>Chat</span><em id="chatUnread" class="chat-unread hide">0</em></button>
  <button id="playersBtn" class="ctrl"><b>☷</b><span>Players</span></button>
</div>

<div id="sheetBackdrop" class="sheet-backdrop hide"></div>

<section id="chatSheet" class="sheet hide">
  <div class="sheet-head"><h3>Chat</h3><button class="close" data-close-sheet>×</button></div>
  <div id="chatLog" class="chat-log"></div>
  <div class="chat-send">
    <input id="chatInput" class="input" placeholder="Message..." maxlength="220" />
    <button id="sendBtn" class="btn primary">Send</button>
  </div>
</section>

<section id="playersSheet" class="sheet hide">
  <div class="sheet-head"><h3>Players</h3><button class="close" data-close-sheet>×</button></div>
  <div id="playersList" class="players-list"></div>
</section>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();

const spaces = {
  mafia: { label: "Mafia", icon: "♛", create: "Create Mafia Room" },
  truth: { label: "Truth or Dare", icon: "◆", create: "Create Truth Room" },
  debate: { label: "Debate Arena", icon: "◇", create: "Create Debate Room" },
  lounge: { label: "Void Lounge", icon: "◌", create: "Create Lounge Room" },
  confession: { label: "Confession", icon: "✦", create: "Create Confession Room" },
  mystery: { label: "Mystery Room", icon: "✧", create: "Create Mystery Room" }
};

let selectedSpace = "mafia";
let allRooms = [];
let currentRoom = null;
let selfId = null;
let localStream = null;
let audioCtx = null;
let analyser = null;
let speakingTimer = null;
let currentFacingMode = "user";
let mediaState = { mic:false, cam:false, speaking:false };
let peers = new Map();
let remoteStreams = new Map();
let knownPlayers = new Map();
let unreadChat = 0;

const $ = (id) => document.getElementById(id);

const els = {
  homeView: $("homeView"),
  roomView: $("roomView"),
  bottomNav: $("bottomNav"),
  username: $("username"),
  roomCode: $("roomCode"),
  createBtn: $("createBtn"),
  randomCodeBtn: $("randomCodeBtn"),
  roomsList: $("roomsList"),
  roomsTitle: $("roomsTitle"),
  roomsCount: $("roomsCount"),
  activeRooms: $("activeRooms"),
  onlinePlayers: $("onlinePlayers"),
  currentModeShort: $("currentModeShort"),
  moreBtn: $("moreBtn"),
  morePop: $("morePop"),
  notice: $("notice"),
  roomModeIcon: $("roomModeIcon"),
  roomMode: $("roomMode"),
  roomPlayersCount: $("roomPlayersCount"),
  roomName: $("roomName"),
  videoGrid: $("videoGrid"),
  moreCams: $("moreCams"),
  controlDock: $("controlDock"),
  micBtn: $("micBtn"),
  camBtn: $("camBtn"),
  switchBtn: $("switchBtn"),
  chatBtn: $("chatBtn"),
  chatUnread: $("chatUnread"),
  playersBtn: $("playersBtn"),
  startBtn: $("startBtn"),
  topLeaveBtn: $("topLeaveBtn"),
  chatSheet: $("chatSheet"),
  playersSheet: $("playersSheet"),
  sheetBackdrop: $("sheetBackdrop"),
  chatLog: $("chatLog"),
  chatInput: $("chatInput"),
  sendBtn: $("sendBtn"),
  playersList: $("playersList")
};

function playMessageSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(740, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    setTimeout(()=>ctx.close().catch(()=>{}), 260);
  }catch(e){}
}

function setUnread(count){
  unreadChat = count;
  if(!els.chatUnread) return;
  if(count > 0){
    els.chatUnread.textContent = count > 9 ? "9+" : String(count);
    els.chatUnread.classList.remove("hide");
  } else {
    els.chatUnread.classList.add("hide");
  }
}

function showNotice(text, ms=2400){
  els.notice.textContent = text;
  els.notice.classList.remove("hide");
  clearTimeout(showNotice.t);
  showNotice.t = setTimeout(()=>els.notice.classList.add("hide"), ms);
}

function randomCode(){
  return String(Math.floor(100000 + Math.random()*900000));
}

function setSpace(space){
  selectedSpace = space;
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.space === space);
  });
  els.morePop.classList.add("hide");
  const s = spaces[space];
  els.currentModeShort.textContent = s.label.split(" ")[0];
  els.createBtn.textContent = s.create;
  els.roomsTitle.textContent = s.label + " Rooms";
  renderRooms();
}

function getUsername(){
  return (els.username.value || "Guest").trim().slice(0,24);
}

function getCode(){
  let c = (els.roomCode.value || "").trim();
  if(!c){ c = randomCode(); els.roomCode.value = c; }
  return c;
}

function renderRooms(){
  const filtered = allRooms.filter(r => r.space === selectedSpace);
  const totalPlayers = allRooms.reduce((n,r)=>n+(r.playerCount||0),0);
  els.activeRooms.textContent = allRooms.length;
  els.onlinePlayers.textContent = totalPlayers;
  els.roomsCount.textContent = filtered.length + " active";
  els.roomsList.innerHTML = "";

  if(!filtered.length){
    els.roomsList.innerHTML = '<div class="empty">ამ სივრცეში ჯერ ოთახი არ არის.<br>შექმენი პირველი მაგიდა.</div>';
    return;
  }

  filtered.forEach(room => {
    const div = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = \`
      <div class="room-main">
        <div class="room-name"><span>\${spaces[room.space]?.icon || "◌"}</span><span>#\${room.code}</span></div>
        <div class="room-meta">Host: \${room.hostName || "Host"} • \${room.playerCount}/\${room.max} players</div>
        <div class="badges">
          <span class="badge live">\${room.status || "Waiting"}</span>
          <span class="badge">\${room.label}</span>
        </div>
      </div>
      <button class="btn tiny primary">Join</button>
    \`;
    div.querySelector("button").onclick = () => {
      els.roomCode.value = room.code;
      socket.emit("room:join", { username:getUsername(), space:room.space, code:room.code });
    };
    els.roomsList.appendChild(div);
  });
}

function goRoom(room){
  currentRoom = room;
  knownPlayers = new Map(room.players.map(p => [p.id, p]));
  setUnread(0);

  els.homeView.classList.add("hide");
  els.roomView.classList.remove("hide");
  els.controlDock.classList.remove("hide");

  if (els.bottomNav) {
    els.bottomNav.classList.add("room-mode");
  }

  updateRoomUI(room);
  renderVideos();
  renderPlayersSheet();
}

function goHome(){
  currentRoom = null;
  selfId = null;

  stopLocalMedia();
  closeAllPeers();
  remoteStreams.clear();
  knownPlayers.clear();
  setUnread(0);

  els.roomView.classList.add("hide");
  els.controlDock.classList.add("hide");
  els.homeView.classList.remove("hide");

  if (els.bottomNav) {
    els.bottomNav.classList.remove("room-mode");
  }

  closeSheets();
  renderRooms();
}

function updateRoomUI(room){
  currentRoom = room;
  knownPlayers = new Map(room.players.map(p => [p.id, p]));
  const s = spaces[room.space] || spaces.mafia;
  els.roomModeIcon.textContent = s.icon;
  els.roomMode.textContent = s.label;
  els.roomName.textContent = "Room #" + room.code;
  els.roomPlayersCount.textContent = room.playerCount + "/" + room.max;
  els.startBtn.style.display = room.hostId === selfId ? "" : "none";
  renderVideos();
  renderPlayersSheet();
}

function renderVideos(){
  if(!currentRoom) return;
  const players = currentRoom.players || [];
  const visible = players.slice(0,8);
  els.videoGrid.innerHTML = "";
  els.moreCams.style.display = players.length > 8 ? "block" : "none";
  els.moreCams.textContent = "+" + (players.length - 8) + " more";

  visible.forEach(p => {
    const tile = document.createElement("div");
    tile.className = "tile" + (p.id === selfId ? " self" : "");
    tile.id = "tile-" + p.id;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = p.id === selfId;

    if(p.id === selfId && localStream) video.srcObject = localStream;
    if(p.id !== selfId && remoteStreams.has(p.id)) video.srcObject = remoteStreams.get(p.id);

    const hasStream =
      (p.id === selfId && localStream && localStream.getVideoTracks().length > 0 && mediaState.cam) ||
      (p.id !== selfId && remoteStreams.has(p.id));

    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = p.cam ? "Waiting for video" : "Camera off";
    placeholder.style.display = hasStream ? "none" : "flex";

    const bar = document.createElement("div");
    bar.className = "tile-bar";
    bar.innerHTML = \`
      <div class="tile-name">\${p.username}\${p.id === selfId ? " (you)" : ""}</div>
      <div class="tile-icons">
        <span class="ico \${p.mic ? "on" : "off"} \${p.speaking ? "speaking" : ""}">🎙</span>
        <span class="ico \${p.cam ? "on" : "off"}">\${p.cam ? "▣" : "×"}</span>
      </div>
    \`;

    tile.appendChild(video);
    tile.appendChild(placeholder);
    tile.appendChild(bar);
    els.videoGrid.appendChild(tile);
  });

  for(let i=visible.length;i<8;i++){
    const tile = document.createElement("div");
    tile.className = "tile empty-tile";
    tile.innerHTML = '<div class="placeholder">Empty slot</div>';
    els.videoGrid.appendChild(tile);
  }

  updateControlButtons();
}

function renderPlayersSheet(){
  if(!currentRoom) return;
  els.playersList.innerHTML = "";
  currentRoom.players.forEach(p => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = \`
      <strong>\${p.username}\${p.id === selfId ? " (you)" : ""}</strong>
      <div class="badges">
        \${p.isHost ? '<span class="badge">HOST</span>' : ''}
        <span class="badge">\${p.mic ? "MIC" : "MUTED"}</span>
        <span class="badge">\${p.cam ? "CAM" : "NO CAM"}</span>
      </div>
    \`;
    els.playersList.appendChild(row);
  });
}

function updateControlButtons(){
  els.micBtn.classList.toggle("on", mediaState.mic);
  els.camBtn.classList.toggle("on", mediaState.cam);
  els.micBtn.querySelector("span").textContent = mediaState.mic ? "Mic On" : "Mic Off";
  els.camBtn.querySelector("span").textContent = mediaState.cam ? "Cam On" : "Cam Off";
}

function mediaConstraints(wantAudio=true,wantVideo=true){
  return {
    audio: wantAudio ? { echoCancellation:true, noiseSuppression:true, autoGainControl:true } : false,
    video: wantVideo ? {
      facingMode: currentFacingMode,
      width: { ideal: 360, max: 640 },
      height: { ideal: 480, max: 640 },
      frameRate: { ideal: 15, max: 20 }
    } : false
  };
}

async function ensureLocalStream(wantAudio=true,wantVideo=true){
  if(!localStream){
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(wantAudio, wantVideo));
    attachLocalToPeers();
    return localStream;
  }

  if(wantAudio && localStream.getAudioTracks().length === 0){
    const audioStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(true, false));
    const audioTrack = audioStream.getAudioTracks()[0];
    if(audioTrack) localStream.addTrack(audioTrack);
  }

  if(wantVideo && localStream.getVideoTracks().length === 0){
    const videoStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(false, true));
    const videoTrack = videoStream.getVideoTracks()[0];
    if(videoTrack) localStream.addTrack(videoTrack);
  }

  attachLocalToPeers();
  return localStream;
}

function stopLocalMedia(){
  if(localStream){
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if(audioCtx){ audioCtx.close().catch(()=>{}); audioCtx = null; analyser = null; }
  clearInterval(speakingTimer);
  mediaState = { mic:false, cam:false, speaking:false };
  try{ socket.emit("media:state", mediaState); }catch(e){}
}

function attachLocalToPeers(){
  if(!localStream) return;
  peers.forEach(pc => {
    localStream.getTracks().forEach(track => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
      if(!sender) pc.addTrack(track, localStream);
    });
  });
}

async function setMic(on){
  try{
    if(on){
      await ensureLocalStream(true, mediaState.cam);
      localStream.getAudioTracks().forEach(t => t.enabled = true);
      startSpeakingDetection();
    } else {
      if(localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
      mediaState.speaking = false;
      clearInterval(speakingTimer);
    }

    mediaState.mic = on;
    socket.emit("media:state", mediaState);
    renderVideos();
    if(on) await renegotiateAll();
  }catch(e){
    console.error(e);
    showNotice("Mic permission needed or mic failed.");
  }
}

async function setCam(on){
  try {
    if (on) {
      if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(mediaState.mic, true));
      }

      const hasVideoTrack = localStream.getVideoTracks().length > 0;

      if (!hasVideoTrack) {
        const camStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(false, true));
        const videoTrack = camStream.getVideoTracks()[0];

        if (videoTrack) {
          localStream.addTrack(videoTrack);

          for (const pc of peers.values()) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) {
              await sender.replaceTrack(videoTrack);
            } else {
              pc.addTrack(videoTrack, localStream);
            }
          }
        }
      }

      localStream.getVideoTracks().forEach(t => { t.enabled = true; });
      attachLocalToPeers();
    } else {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.enabled = false; });
      }
    }

    mediaState.cam = on;
    socket.emit("media:state", mediaState);
    renderVideos();

    if (on) await renegotiateAll();
  } catch(e) {
    console.error(e);
    showNotice("Camera permission needed or camera failed.");
  }
}

function startSpeakingDetection(){
  if(!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if(!audioTrack) return;

  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    clearInterval(speakingTimer);
    speakingTimer = setInterval(() => {
      if(!analyser || !mediaState.mic) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a,b)=>a+b,0) / data.length;
      const speaking = avg > 18;
      if(speaking !== mediaState.speaking){
        mediaState.speaking = speaking;
        socket.emit("media:state", mediaState);
      }
    }, 220);
  }catch(e){}
}

async function switchCamera(){
  if(!localStream || !mediaState.cam){
    showNotice("Turn camera on first.");
    return;
  }
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  const oldVideo = localStream.getVideoTracks()[0];
  if(oldVideo) oldVideo.stop();

  try{
    const newStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(false, true));
    const newTrack = newStream.getVideoTracks()[0];
    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(newTrack);

    for(const pc of peers.values()){
      const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
      if(sender) await sender.replaceTrack(newTrack);
      else pc.addTrack(newTrack, localStream);
    }
    renderVideos();
    await renegotiateAll();
  }catch(e){
    console.error(e);
    showNotice("Camera switch failed.");
  }
}

function createPeer(peerId, initiator){
  if(peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls:"stun:stun.l.google.com:19302" },
      { urls:"stun:global.stun.twilio.com:3478" }
    ]
  });

  peers.set(peerId, pc);

  pc.onicecandidate = (e) => {
    if(e.candidate) socket.emit("webrtc:ice", { to:peerId, candidate:e.candidate });
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    remoteStreams.set(peerId, stream);
    renderVideos();
  };

  pc.onconnectionstatechange = () => {
    if(["failed","closed","disconnected"].includes(pc.connectionState)){
      // keep tile; it may reconnect after renegotiation
    }
  };

  if(localStream){
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  if(initiator){
    pc.onnegotiationneeded = async () => {
      try{
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to:peerId, offer });
      }catch(e){}
    };
  }

  return pc;
}

async function renegotiateAll(){
  for(const [peerId, pc] of peers.entries()){
    try{
      if(pc.signalingState !== "stable") continue;
      const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true });
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { to:peerId, offer });
    }catch(e){}
  }
}

function closeAllPeers(){
  peers.forEach(pc => pc.close());
  peers.clear();
}

function openSheet(type){
  els.sheetBackdrop.classList.remove("hide");
  if(type === "chat"){
    els.chatSheet.classList.remove("hide");
    setUnread(0);
  }
  if(type === "players") els.playersSheet.classList.remove("hide");
}
function closeSheets(){
  els.sheetBackdrop.classList.add("hide");
  els.chatSheet.classList.add("hide");
  els.playersSheet.classList.add("hide");
}
function isChatOpen(){
  return !els.chatSheet.classList.contains("hide");
}

document.querySelectorAll("[data-space]").forEach(btn => {
  btn.addEventListener("click", () => setSpace(btn.dataset.space));
});
els.moreBtn.onclick = () => els.morePop.classList.toggle("hide");
els.randomCodeBtn.onclick = () => { els.roomCode.value = randomCode(); };
els.createBtn.onclick = () => {
  const code = getCode();
  socket.emit("room:create", { username:getUsername(), space:selectedSpace, code });
};
els.startBtn.onclick = () => socket.emit("room:start");
els.topLeaveBtn.onclick = () => socket.emit("room:leave");
els.micBtn.onclick = () => setMic(!mediaState.mic);
els.camBtn.onclick = () => setCam(!mediaState.cam);
els.switchBtn.onclick = switchCamera;
els.chatBtn.onclick = () => openSheet("chat");
els.playersBtn.onclick = () => openSheet("players");
els.sheetBackdrop.onclick = closeSheets;
document.querySelectorAll("[data-close-sheet]").forEach(b=>b.onclick=closeSheets);

function sendMessage(){
  const text = els.chatInput.value.trim();
  if(!text) return;
  socket.emit("chat:message", text);
  els.chatInput.value = "";
}
els.sendBtn.onclick = sendMessage;
els.chatInput.addEventListener("keydown", e => {
  if(e.key === "Enter") sendMessage();
});

socket.on("rooms:update", rooms => {
  allRooms = rooms || [];
  renderRooms();
});

socket.on("notice", n => showNotice(n.text || "Notice"));

socket.on("room:joined", async ({ room, selfId: id, existingPeers }) => {
  selfId = id;
  goRoom(room);
  showNotice("Joined room #" + room.code);

  (existingPeers || []).forEach(p => createPeer(p.id, true));
});

socket.on("room:update", room => {
  if(currentRoom && room.id === currentRoom.id) updateRoomUI(room);
  allRooms = allRooms.map(r => r.id === room.id ? room : r);
  renderRooms();
});

socket.on("room:closed", ({ reason }) => {
  showNotice(reason || "Room closed.");
  goHome();
});

socket.on("peer:joined", ({ id, username }) => {
  if(!currentRoom) return;
  knownPlayers.set(id, { id, username, mic:false, cam:false });
  createPeer(id, false);
  renderVideos();
});

socket.on("peer:left", ({ id }) => {
  if(peers.has(id)){ peers.get(id).close(); peers.delete(id); }
  remoteStreams.delete(id);
  renderVideos();
});

socket.on("media:state", ({ id, mic, cam, speaking }) => {
  if(!currentRoom) return;
  currentRoom.players = currentRoom.players.map(p => p.id === id ? { ...p, mic, cam, speaking } : p);
  renderVideos();
  renderPlayersSheet();
});

socket.on("chat:message", msg => {
  const div = document.createElement("div");
  div.className = "msg" + (msg.userId === selfId ? " me" : "");
  div.innerHTML = \`<strong>\${msg.username}</strong><span>\${msg.text}</span>\`;
  els.chatLog.appendChild(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;

  if(msg.userId !== selfId){
    playMessageSound();
    if(!isChatOpen()) setUnread(unreadChat + 1);
  }
});

socket.on("webrtc:offer", async ({ from, offer }) => {
  const pc = createPeer(from, false);
  try{
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    if(localStream) attachLocalToPeers();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc:answer", { to:from, answer });
  }catch(e){ console.error(e); }
});

socket.on("webrtc:answer", async ({ from, answer }) => {
  const pc = peers.get(from);
  if(!pc) return;
  try{ await pc.setRemoteDescription(new RTCSessionDescription(answer)); }catch(e){ console.error(e); }
});

socket.on("webrtc:ice", async ({ from, candidate }) => {
  const pc = peers.get(from);
  if(!pc || !candidate) return;
  try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch(e){}
});

window.addEventListener("beforeunload", () => {
  try{ socket.emit("room:leave"); }catch(e){}
});

els.roomCode.value = randomCode();
setSpace("mafia");
renderRooms();
</script>
</body>
</html>`;

app.get("*", (req, res) => res.send(html));

server.listen(PORT, () => {
  console.log(`VOID PORTAL v0.9 running on port ${PORT}`);
});
