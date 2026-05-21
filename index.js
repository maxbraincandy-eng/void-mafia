const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

const SPACES = {
  mafia: { name: "Mafia", icon: "☠", desc: "Roles, day/night, voting" },
  truth: { name: "Truth or Dare", icon: "◆", desc: "Spin, truth, dare" },
  debate: { name: "Debate", icon: "◈", desc: "Topics, timer, audience" },
  lounge: { name: "Lounge", icon: "◌", desc: "Video chat and chill" },
  confession: { name: "Confession", icon: "◇", desc: "Anonymous secrets" },
  mystery: { name: "Mystery", icon: "◎", desc: "Detective, liar, clues" }
};

const rooms = new Map();

function roomKey(space, code) {
  return space + ":" + code;
}

function publicRooms(spaceFilter) {
  const list = [];
  for (const [key, room] of rooms.entries()) {
    if (spaceFilter && room.space !== spaceFilter) continue;
    list.push({
      key,
      space: room.space,
      spaceName: SPACES[room.space]?.name || room.space,
      roomCode: room.roomCode,
      hostId: room.hostId,
      hostName: room.players.get(room.hostId)?.username || "Host",
      playerCount: room.players.size,
      createdAt: room.createdAt
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function roomSnapshot(room) {
  return {
    key: room.key,
    space: room.space,
    spaceName: SPACES[room.space]?.name || room.space,
    roomCode: room.roomCode,
    hostId: room.hostId,
    players: Array.from(room.players.values())
  };
}

function broadcastRoomList() {
  io.emit("rooms-list", {
    total: rooms.size,
    bySpace: Object.keys(SPACES).reduce((acc, s) => {
      acc[s] = publicRooms(s);
      return acc;
    }, {}),
    all: publicRooms()
  });
}

function deleteRoom(key, reason) {
  const room = rooms.get(key);
  if (!room) return;

  io.to(key).emit("room-deleted", {
    reason: reason || "Host left. Room closed."
  });

  for (const player of room.players.values()) {
    const s = io.sockets.sockets.get(player.id);
    if (s) {
      s.leave(key);
      s.data.roomKey = null;
      s.data.space = null;
      s.data.roomCode = null;
    }
  }

  rooms.delete(key);
  broadcastRoomList();
}

const page = `<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>VOID PORTAL</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=Orbitron:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#050713; --panel:rgba(10,14,32,.78); --panel2:rgba(8,10,24,.92);
      --line:rgba(130,151,255,.18); --text:#f4f7ff; --soft:#a8b1cf; --dim:#78819e;
      --cyan:#62f7ff; --pink:#ff4fd8; --violet:#8d63ff; --green:#49ff9a; --red:#ff5f86;
      --yellow:#ffe66d; --shadow:0 18px 60px rgba(0,0,0,.42);
    }
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif;color:var(--text);
      background:
      radial-gradient(circle at 12% 5%,rgba(255,79,216,.20),transparent 32%),
      radial-gradient(circle at 88% 20%,rgba(98,247,255,.16),transparent 30%),
      radial-gradient(circle at 50% 115%,rgba(141,99,255,.20),transparent 42%),
      linear-gradient(135deg,#03040b,#080b1d 52%,#050713);
      overflow-x:hidden;
    }
    body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.30;
      background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
      background-size:34px 34px;mask-image:radial-gradient(circle at center,#000 38%,transparent 100%);
    }
    body:after{content:"";position:fixed;inset:0;pointer-events:none;opacity:.08;
      background:repeating-linear-gradient(0deg,transparent 0 7px,rgba(255,255,255,.35) 8px);
      mix-blend-mode:overlay;
    }
    .app{position:relative;z-index:2;max-width:1120px;margin:0 auto;padding:18px 14px 104px}
    .top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
    .brand{min-width:0}
    .powered{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,79,216,.35);
      border-radius:999px;background:rgba(255,79,216,.09);box-shadow:0 0 24px rgba(255,79,216,.20);color:#ffd7f6;
      font-size:12px;font-weight:800;margin-bottom:10px
    }
    .title{font-family:Orbitron,sans-serif;font-size:clamp(34px,9vw,84px);line-height:.9;margin:0;letter-spacing:.02em;position:relative;
      text-shadow:0 0 18px rgba(98,247,255,.26),0 0 32px rgba(255,79,216,.18)
    }
    .title:before,.title:after{content:attr(data-text);position:absolute;inset:0;pointer-events:none;opacity:.62;overflow:hidden}
    .title:before{color:var(--cyan);transform:translate(2px,-1px);clip-path:inset(0 0 50% 0);animation:g1 2.1s infinite linear alternate}
    .title:after{color:var(--pink);transform:translate(-2px,1px);clip-path:inset(52% 0 0 0);animation:g2 2.6s infinite linear alternate}
    @keyframes g1{0%,100%{transform:translate(1px,0)}30%{transform:translate(3px,-1px)}60%{transform:translate(-2px,1px)}}
    @keyframes g2{0%,100%{transform:translate(-1px,0)}40%{transform:translate(-3px,1px)}70%{transform:translate(2px,-1px)}}
    .subtitle{margin:10px 0 0;color:var(--soft);font-size:15px}
    .status{flex:0 0 auto;border:1px solid var(--line);background:rgba(255,255,255,.04);padding:10px 12px;border-radius:18px;color:var(--soft);font-size:12px;font-weight:800}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-right:6px;box-shadow:0 0 12px var(--red)}
    .dot.on{background:var(--green);box-shadow:0 0 12px var(--green)}
    .panel{background:linear-gradient(180deg,rgba(17,22,50,.82),rgba(7,10,24,.84));border:1px solid var(--line);
      border-radius:28px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.05);backdrop-filter:blur(15px);padding:18px;margin-bottom:16px
    }
    .dash{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}
    .space-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .space-name{font-size:22px;font-weight:900}
    .pill{padding:8px 11px;border-radius:999px;border:1px solid rgba(98,247,255,.28);background:rgba(98,247,255,.08);color:#cfffff;font-size:12px;font-weight:900}
    .field{margin-bottom:12px}
    label{display:block;margin-bottom:8px;color:#e3eaff;font-size:13px;font-weight:900;letter-spacing:.03em}
    input{width:100%;border:1px solid rgba(130,151,255,.24);background:rgba(2,5,16,.72);color:var(--text);
      border-radius:17px;padding:15px 15px;outline:none;font-size:16px}
    input:focus{border-color:rgba(98,247,255,.65);box-shadow:0 0 0 4px rgba(98,247,255,.08),0 0 20px rgba(98,247,255,.16)}
    .row{display:flex;gap:10px}
    .row>*{flex:1}
    button{font-family:inherit;border:0;cursor:pointer;color:inherit;font-weight:900}
    .btn{border-radius:17px;padding:14px 16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);transition:.18s}
    .btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.075)}
    .primary{background:linear-gradient(90deg,var(--cyan),#9cfbff 45%,#ff9eea);color:#05101d;box-shadow:0 14px 35px rgba(98,247,255,.13),0 0 30px rgba(255,79,216,.12)}
    .danger{border-color:rgba(255,95,134,.28);color:#ffd7df}
    .small{padding:10px 12px;border-radius:14px;font-size:13px}
    .room-list{display:grid;gap:10px;max-height:430px;overflow:auto;padding-right:2px}
    .empty{padding:18px;border:1px dashed rgba(255,255,255,.14);border-radius:20px;color:var(--soft);text-align:center}
    .room-card{border:1px solid rgba(130,151,255,.18);background:rgba(5,8,21,.62);border-radius:21px;padding:14px;display:grid;gap:10px}
    .room-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .room-title{font-weight:900;font-size:18px}
    .room-meta{color:var(--soft);font-size:13px;margin-top:4px;line-height:1.45}
    .badge{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:12px;font-weight:900;color:#dfe8ff}
    .room-screen{display:none}
    .room-screen.active,.home.active{display:block}
    .home.hidden{display:none}
    .room-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
    .backline{display:flex;align-items:center;gap:10px;min-width:0}
    .room-label{color:var(--soft);font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .room-big{font-size:24px;font-weight:900;margin-top:2px}
    .room-layout{display:grid;grid-template-columns:1.3fr .7fr;gap:16px}
    .video-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .video-card{position:relative;min-height:190px;border:1px solid rgba(130,151,255,.18);background:#050816;border-radius:22px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}
    video{width:100%;height:100%;min-height:190px;object-fit:cover;background:#02040d;display:block}
    .video-off{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--soft);padding:20px;background:radial-gradient(circle,rgba(98,247,255,.07),rgba(2,4,13,.92))}
    .vbar{position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:16px;background:rgba(0,0,0,.48);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.09)}
    .vname{font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .icons{display:flex;gap:7px;align-items:center}
    .mic-icon{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);font-size:13px}
    .mic-icon.speaking{background:rgba(73,255,154,.18);border-color:rgba(73,255,154,.55);box-shadow:0 0 0 0 rgba(73,255,154,.55);animation:pulse 1s infinite}
    @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(73,255,154,.55)}70%{box-shadow:0 0 0 12px rgba(73,255,154,0)}100%{box-shadow:0 0 0 0 rgba(73,255,154,0)}}
    .side{display:grid;gap:12px}
    .players{list-style:none;padding:0;margin:0;display:grid;gap:8px}
    .players li{padding:10px 11px;border-radius:15px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;gap:8px;color:#dce5ff}
    .chat{height:220px;overflow:auto;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.22);border-radius:18px;padding:11px;display:grid;align-content:start;gap:8px}
    .msg{font-size:13px;line-height:1.35;color:#dfe6ff}
    .msg b{color:#fff}
    .controls{position:sticky;bottom:90px;z-index:5;display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
    .controls .btn{flex:1;min-width:130px}
    .bottom-nav{position:fixed;z-index:20;left:50%;bottom:14px;transform:translateX(-50%);width:min(760px,calc(100% - 20px));
      display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:9px;border:1px solid rgba(130,151,255,.22);border-radius:26px;background:rgba(7,10,24,.88);backdrop-filter:blur(18px);box-shadow:0 16px 50px rgba(0,0,0,.48)}
    .nav-item{padding:10px 6px;border-radius:19px;background:transparent;border:1px solid transparent;text-align:center;color:var(--soft)}
    .nav-item.active{background:linear-gradient(180deg,rgba(98,247,255,.13),rgba(255,79,216,.08));border-color:rgba(98,247,255,.28);color:#fff;box-shadow:0 0 24px rgba(98,247,255,.12)}
    .nav-icon{display:block;font-size:17px;line-height:1}
    .nav-text{display:block;font-size:11px;font-weight:900;margin-top:5px;white-space:nowrap}
    .more-panel{display:none;position:fixed;z-index:19;left:50%;bottom:92px;transform:translateX(-50%);width:min(540px,calc(100% - 28px));
      padding:12px;border-radius:24px;border:1px solid rgba(130,151,255,.2);background:rgba(7,10,24,.92);backdrop-filter:blur(18px);box-shadow:0 16px 50px rgba(0,0,0,.52)}
    .more-panel.show{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .toast{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:50;background:rgba(7,10,24,.95);border:1px solid rgba(98,247,255,.26);padding:12px 14px;border-radius:18px;box-shadow:var(--shadow);display:none;color:#eafcff;font-weight:800}
    .toast.show{display:block}
    @media(max-width:860px){.dash,.room-layout{grid-template-columns:1fr}.video-grid{grid-template-columns:1fr}.top{display:block}.status{display:inline-block;margin-top:12px}.panel{border-radius:24px;padding:15px}.controls{bottom:86px}.app{padding-left:10px;padding-right:10px}.nav-text{font-size:10px}}
  </style>
</head>
<body>
  <div class="toast" id="toast"></div>

  <main class="app">
    <header class="top">
      <div class="brand">
        <div class="powered">powered by ბატონი მაქსი</div>
        <h1 class="title" data-text="VOID PORTAL">VOID PORTAL</h1>
        <p class="subtitle">აირჩიე სივრცე, ნახე აქტიური მაგიდები და შედი ცალკე ოთახში.</p>
      </div>
      <div class="status"><span class="dot" id="connDot"></span><span id="connText">Connecting</span></div>
    </header>

    <section class="home active" id="home">
      <div class="dash">
        <div class="panel">
          <div class="space-head">
            <div>
              <div class="room-label">Selected space</div>
              <div class="space-name" id="selectedSpaceName">Mafia</div>
            </div>
            <div class="pill"><span id="activeCount">0</span> active rooms</div>
          </div>

          <div class="field">
            <label>Username</label>
            <input id="username" value="max" maxlength="22" />
          </div>

          <div class="row">
            <div class="field">
              <label>Room code</label>
              <input id="roomCode" value="" maxlength="8" placeholder="7777" />
            </div>
            <div class="field" style="flex:.65">
              <label>&nbsp;</label>
              <button class="btn" id="randomBtn" type="button">Random</button>
            </div>
          </div>

          <button class="btn primary" id="createBtn" type="button">Create new table</button>
          <p class="subtitle" style="font-size:13px;margin-top:12px">ჰოსტი რომ გავა, ოთახი ავტომატურად დაიხურება და მოთამაშეები დაბრუნდებიან მთავარ მენიუში.</p>
        </div>

        <div class="panel">
          <div class="space-head">
            <div>
              <div class="room-label">Public tables</div>
              <div class="space-name" id="listTitle">Mafia rooms</div>
            </div>
            <div class="badge"><span id="totalRooms">0</span> total</div>
          </div>
          <div class="room-list" id="roomList">
            <div class="empty">აქტიური ოთახები ჯერ არ არის.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="room-screen" id="roomScreen">
      <div class="panel">
        <div class="room-topbar">
          <div class="backline">
            <button class="btn small" id="backBtn" type="button">← Menu</button>
            <div>
              <div class="room-label" id="roomSpaceLabel">Mafia</div>
              <div class="room-big">Room <span id="roomCodeLabel">----</span></div>
            </div>
          </div>
          <div class="row" style="flex:0 1 360px">
            <button class="btn small primary" id="startBtn" type="button">Start</button>
            <button class="btn small danger" id="leaveBtn" type="button">Leave</button>
          </div>
        </div>

        <div class="room-layout">
          <div>
            <div class="video-grid" id="videoGrid"></div>
            <div class="controls">
              <button class="btn" id="micBtn" type="button">Mic: On</button>
              <button class="btn" id="camBtn" type="button">Camera: On</button>
              <button class="btn" id="switchBtn" type="button">Switch Camera</button>
            </div>
          </div>

          <div class="side">
            <div class="sub panel" style="margin:0">
              <div class="room-label">Players</div>
              <ul class="players" id="playersList"></ul>
            </div>
            <div class="sub panel" style="margin:0">
              <div class="room-label">Chat</div>
              <div class="chat" id="chat"></div>
              <div class="row" style="margin-top:10px">
                <input id="chatInput" placeholder="Message..." />
                <button class="btn primary" id="sendBtn" type="button" style="flex:.35">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <div class="more-panel" id="morePanel">
    <button class="btn" data-more-space="confession">◇ Confession</button>
    <button class="btn" data-more-space="mystery">◎ Mystery</button>
    <button class="btn" data-more-space="lounge">◌ Lounge</button>
    <button class="btn" data-more-space="debate">◈ Debate</button>
  </div>

  <nav class="bottom-nav">
    <button class="nav-item active" data-space="mafia"><span class="nav-icon">☠</span><span class="nav-text">Mafia</span></button>
    <button class="nav-item" data-space="truth"><span class="nav-icon">◆</span><span class="nav-text">Truth</span></button>
    <button class="nav-item" data-space="debate"><span class="nav-icon">◈</span><span class="nav-text">Debate</span></button>
    <button class="nav-item" data-space="lounge"><span class="nav-icon">◌</span><span class="nav-text">Lounge</span></button>
    <button class="nav-item" id="moreBtn"><span class="nav-icon">＋</span><span class="nav-text">More</span></button>
  </nav>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();

    const SPACES = {
      mafia: { name: "Mafia", desc: "Roles, day/night, voting" },
      truth: { name: "Truth or Dare", desc: "Spin, truth, dare" },
      debate: { name: "Debate", desc: "Topics, timer, audience" },
      lounge: { name: "Lounge", desc: "Video chat and chill" },
      confession: { name: "Confession", desc: "Anonymous secrets" },
      mystery: { name: "Mystery", desc: "Detective, liar, clues" }
    };

    let selectedSpace = "mafia";
    let currentRoom = null;
    let roomsPayload = { total: 0, bySpace: {}, all: [] };
    let localStream = null;
    let peers = {};
    let users = {};
    let micOn = true;
    let camOn = true;
    let facingMode = "user";
    let audioCtx = null;
    let analyser = null;
    let speakingState = false;

    const el = (id) => document.getElementById(id);

    function toast(text) {
      const t = el("toast");
      t.textContent = text;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }

    function randomCode() {
      return Math.floor(1000 + Math.random() * 900000).toString();
    }

    function selectSpace(space) {
      selectedSpace = space;
      el("selectedSpaceName").textContent = SPACES[space].name;
      el("listTitle").textContent = SPACES[space].name + " rooms";
      document.querySelectorAll(".nav-item[data-space]").forEach(b => {
        b.classList.toggle("active", b.dataset.space === space);
      });
      el("morePanel").classList.remove("show");
      renderRooms();
    }

    function renderRooms() {
      const list = (roomsPayload.bySpace && roomsPayload.bySpace[selectedSpace]) || [];
      el("activeCount").textContent = list.length;
      el("totalRooms").textContent = roomsPayload.total || 0;

      const box = el("roomList");
      if (!list.length) {
        box.innerHTML = '<div class="empty">ამ კატეგორიაში აქტიური ოთახი ჯერ არ არის.<br>შექმენი ახალი მაგიდა.</div>';
        return;
      }

      box.innerHTML = "";
      list.forEach(room => {
        const div = document.createElement("div");
        div.className = "room-card";
        div.innerHTML =
          '<div class="room-card-top">' +
            '<div><div class="room-title">' + room.spaceName + " #" + room.roomCode + '</div>' +
            '<div class="room-meta">Host: ' + escapeHtml(room.hostName) + '<br>' + room.playerCount + ' player(s) inside</div></div>' +
            '<div class="badge">' + room.playerCount + ' online</div>' +
          '</div>' +
          '<button class="btn primary small">Join this table</button>';
        div.querySelector("button").onclick = () => joinRoom(room.roomCode, room.space);
        box.appendChild(div);
      });
    }

    function escapeHtml(str) {
      return String(str || "").replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[s]));
    }

    async function ensureMedia() {
      if (localStream) return localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (e) {
        toast("Camera/Mic permission denied or unavailable.");
        localStream = new MediaStream();
      }
      setupSpeakingDetection();
      return localStream;
    }

    function setupSpeakingDetection() {
      try {
        const audioTracks = localStream.getAudioTracks();
        if (!audioTracks.length) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const source = audioCtx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        setInterval(() => {
          if (!analyser || !micOn || !currentRoom) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          const nowSpeaking = avg > 18;
          if (nowSpeaking !== speakingState) {
            speakingState = nowSpeaking;
            socket.emit("speaking", { speaking: nowSpeaking });
            updateSpeaking(socket.id, nowSpeaking);
          }
        }, 220);
      } catch (e) {}
    }

    function showRoomScreen(room) {
      currentRoom = room;
      el("home").classList.add("hidden");
      el("home").classList.remove("active");
      el("roomScreen").classList.add("active");
      el("roomSpaceLabel").textContent = room.spaceName;
      el("roomCodeLabel").textContent = room.roomCode;
      el("chat").innerHTML = "";
      renderPlayers(room.players || []);
      renderVideoCards();
    }

    function showHome() {
      el("roomScreen").classList.remove("active");
      el("home").classList.remove("hidden");
      el("home").classList.add("active");
      currentRoom = null;
      cleanupPeers();
      renderRooms();
    }

    async function createRoom() {
      const username = el("username").value.trim() || "Guest";
      let code = el("roomCode").value.trim();
      if (!code) {
        code = randomCode();
        el("roomCode").value = code;
      }
      await ensureMedia();
      socket.emit("create-room", { username, roomCode: code, space: selectedSpace });
    }

    async function joinRoom(code, space) {
      const username = el("username").value.trim() || "Guest";
      await ensureMedia();
      socket.emit("join-room", { username, roomCode: code, space: space || selectedSpace });
    }

    function renderPlayers(players) {
      users = {};
      (players || []).forEach(p => { users[p.id] = p; });

      const list = el("playersList");
      list.innerHTML = "";
      (players || []).forEach(p => {
        const li = document.createElement("li");
        const host = currentRoom && p.id === currentRoom.hostId ? "HOST" : "";
        const you = p.id === socket.id ? "YOU" : "";
        li.innerHTML = '<span>' + escapeHtml(p.username) + '</span><span>' + [you, host].filter(Boolean).join(" · ") + '</span>';
        list.appendChild(li);
      });
      renderVideoCards();
    }

    function renderVideoCards() {
      const grid = el("videoGrid");
      if (!currentRoom) return;
      grid.innerHTML = "";

      Object.values(users).forEach(user => {
        const card = document.createElement("div");
        card.className = "video-card";
        card.id = "card-" + user.id;

        const video = document.createElement("video");
        video.id = "video-" + user.id;
        video.autoplay = true;
        video.playsInline = true;
        if (user.id === socket.id) video.muted = true;

        if (user.id === socket.id && localStream) {
          video.srcObject = localStream;
        }

        const off = document.createElement("div");
        off.className = "video-off";
        off.id = "off-" + user.id;
        off.textContent = "Camera off / waiting for video";

        const bar = document.createElement("div");
        bar.className = "vbar";
        bar.innerHTML =
          '<div class="vname">' + escapeHtml(user.username) + (user.id === socket.id ? " (you)" : "") + '</div>' +
          '<div class="icons"><span class="mic-icon" id="mic-' + user.id + '">🎙</span><span class="mic-icon" id="cam-' + user.id + '">◉</span></div>';

        card.appendChild(video);
        card.appendChild(off);
        card.appendChild(bar);
        grid.appendChild(card);

        const pc = peers[user.id];
        if (pc && pc.stream) video.srcObject = pc.stream;
      });

      updateAllMediaIndicators();
    }

    function updateAllMediaIndicators() {
      Object.values(users).forEach(u => {
        updateMediaIndicator(u.id, u.micOn, u.camOn);
        updateSpeaking(u.id, u.speaking);
      });
      if (users[socket.id]) {
        updateMediaIndicator(socket.id, micOn, camOn);
      }
    }

    function updateMediaIndicator(id, mic, cam) {
      const m = el("mic-" + id);
      const c = el("cam-" + id);
      const off = el("off-" + id);
      if (m) {
        m.textContent = mic === false ? "×" : "🎙";
        m.style.opacity = mic === false ? ".45" : "1";
      }
      if (c) {
        c.textContent = cam === false ? "×" : "◉";
        c.style.opacity = cam === false ? ".45" : "1";
      }
      if (off) off.style.display = cam === false ? "flex" : "none";
    }

    function updateSpeaking(id, speaking) {
      const m = el("mic-" + id);
      if (m) m.classList.toggle("speaking", !!speaking);
    }

    function createPeer(remoteId, initiator) {
      if (peers[remoteId]) return peers[remoteId].pc;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }]
      });

      const record = { pc, stream: new MediaStream() };
      peers[remoteId] = record;

      if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      }

      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach(t => record.stream.addTrack(t));
        const video = el("video-" + remoteId);
        if (video) video.srcObject = record.stream;
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit("webrtc-ice", { to: remoteId, candidate: event.candidate });
      };

      if (initiator) {
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
          socket.emit("webrtc-offer", { to: remoteId, offer: pc.localDescription });
        }).catch(console.error);
      }

      return pc;
    }

    function cleanupPeers() {
      Object.values(peers).forEach(r => { try { r.pc.close(); } catch(e){} });
      peers = {};
      users = {};
      el("videoGrid").innerHTML = "";
    }

    function addChat(username, text, system) {
      const box = el("chat");
      const div = document.createElement("div");
      div.className = "msg";
      if (system) div.innerHTML = '<b>SYSTEM:</b> ' + escapeHtml(text);
      else div.innerHTML = '<b>' + escapeHtml(username) + ':</b> ' + escapeHtml(text);
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    document.querySelectorAll(".nav-item[data-space]").forEach(btn => {
      btn.onclick = () => selectSpace(btn.dataset.space);
    });

    el("moreBtn").onclick = () => el("morePanel").classList.toggle("show");
    document.querySelectorAll("[data-more-space]").forEach(btn => {
      btn.onclick = () => selectSpace(btn.dataset.moreSpace);
    });

    el("randomBtn").onclick = () => el("roomCode").value = randomCode();
    el("createBtn").onclick = createRoom;
    el("backBtn").onclick = () => socket.emit("leave-room");
    el("leaveBtn").onclick = () => socket.emit("leave-room");
    el("startBtn").onclick = () => toast("Game engine comes next: roles, timer, voting.");
    el("sendBtn").onclick = () => {
      const input = el("chatInput");
      const text = input.value.trim();
      if (!text) return;
      socket.emit("chat-message", { text });
      input.value = "";
    };
    el("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") el("sendBtn").click(); });

    el("micBtn").onclick = () => {
      micOn = !micOn;
      if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = micOn);
      el("micBtn").textContent = "Mic: " + (micOn ? "On" : "Off");
      socket.emit("media-state", { micOn, camOn });
      updateMediaIndicator(socket.id, micOn, camOn);
    };

    el("camBtn").onclick = () => {
      camOn = !camOn;
      if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = camOn);
      el("camBtn").textContent = "Camera: " + (camOn ? "On" : "Off");
      socket.emit("media-state", { micOn, camOn });
      updateMediaIndicator(socket.id, micOn, camOn);
    };

    el("switchBtn").onclick = async () => {
      facingMode = facingMode === "user" ? "environment" : "user";
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStream && localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.stop();
          localStream.removeTrack(oldVideoTrack);
        }
        localStream.addTrack(newVideoTrack);

        Object.values(peers).forEach(r => {
          const sender = r.pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) sender.replaceTrack(newVideoTrack);
        });

        const localVideo = el("video-" + socket.id);
        if (localVideo) localVideo.srcObject = localStream;
      } catch (e) {
        toast("Could not switch camera.");
      }
    };

    socket.on("connect", () => {
      el("connDot").classList.add("on");
      el("connText").textContent = "Online";
      socket.emit("get-rooms");
    });

    socket.on("disconnect", () => {
      el("connDot").classList.remove("on");
      el("connText").textContent = "Offline";
    });

    socket.on("rooms-list", payload => {
      roomsPayload = payload;
      renderRooms();
    });

    socket.on("room-created", room => {
      toast("Room created.");
      showRoomScreen(room);
    });

    socket.on("room-joined", room => {
      toast("Joined room.");
      showRoomScreen(room);
    });

    socket.on("room-error", data => toast(data.message || "Room error"));

    socket.on("players-update", players => {
      if (currentRoom) {
        currentRoom.players = players;
        renderPlayers(players);
      }
    });

    socket.on("existing-users", ids => {
      ids.forEach(id => createPeer(id, true));
    });

    socket.on("user-joined", data => {
      addChat("SYSTEM", data.username + " joined.", true);
    });

    socket.on("user-left", data => {
      addChat("SYSTEM", data.username + " left.", true);
      if (peers[data.id]) {
        peers[data.id].pc.close();
        delete peers[data.id];
      }
    });

    socket.on("chat-message", data => addChat(data.username, data.text, false));
    socket.on("system-message", data => addChat("SYSTEM", data.text, true));

    socket.on("room-deleted", data => {
      toast(data.reason || "Room closed.");
      showHome();
    });

    socket.on("media-state", data => {
      if (users[data.id]) {
        users[data.id].micOn = data.micOn;
        users[data.id].camOn = data.camOn;
      }
      updateMediaIndicator(data.id, data.micOn, data.camOn);
    });

    socket.on("speaking", data => updateSpeaking(data.id, data.speaking));

    socket.on("webrtc-offer", async data => {
      const pc = createPeer(data.from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: data.from, answer: pc.localDescription });
    });

    socket.on("webrtc-answer", async data => {
      const rec = peers[data.from];
      if (rec) await rec.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on("webrtc-ice", async data => {
      const rec = peers[data.from];
      if (rec && data.candidate) {
        try { await rec.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
      }
    });

    el("roomCode").value = randomCode();
    selectSpace("mafia");
  </script>
</body>
</html>`;

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(page);
});

io.on("connection", (socket) => {
  socket.data.roomKey = null;

  socket.emit("rooms-list", {
    total: rooms.size,
    bySpace: Object.keys(SPACES).reduce((acc, s) => {
      acc[s] = publicRooms(s);
      return acc;
    }, {}),
    all: publicRooms()
  });

  socket.on("get-rooms", () => broadcastRoomList());

  socket.on("create-room", ({ username, roomCode, space }) => {
    username = String(username || "Guest").slice(0, 22);
    roomCode = String(roomCode || Math.floor(1000 + Math.random() * 900000)).slice(0, 8);
    space = SPACES[space] ? space : "mafia";

    const key = roomKey(space, roomCode);
    if (rooms.has(key)) {
      socket.emit("room-error", { message: "That room already exists. Join it or use another code." });
      return;
    }

    if (socket.data.roomKey) leaveCurrentRoom(socket);

    const room = {
      key,
      space,
      roomCode,
      hostId: socket.id,
      createdAt: Date.now(),
      players: new Map()
    };

    room.players.set(socket.id, {
      id: socket.id,
      username,
      micOn: true,
      camOn: true,
      speaking: false
    });

    rooms.set(key, room);
    socket.join(key);
    socket.data.roomKey = key;
    socket.data.space = space;
    socket.data.roomCode = roomCode;

    socket.emit("room-created", roomSnapshot(room));
    io.to(key).emit("players-update", roomSnapshot(room).players);
    broadcastRoomList();
  });

  socket.on("join-room", ({ username, roomCode, space }) => {
    username = String(username || "Guest").slice(0, 22);
    roomCode = String(roomCode || "").slice(0, 8);
    space = SPACES[space] ? space : "mafia";

    const key = roomKey(space, roomCode);
    const room = rooms.get(key);

    if (!room) {
      socket.emit("room-error", { message: "Room not found." });
      return;
    }

    if (socket.data.roomKey) leaveCurrentRoom(socket);

    const existingIds = Array.from(room.players.keys());

    room.players.set(socket.id, {
      id: socket.id,
      username,
      micOn: true,
      camOn: true,
      speaking: false
    });

    socket.join(key);
    socket.data.roomKey = key;
    socket.data.space = space;
    socket.data.roomCode = roomCode;

    socket.emit("room-joined", roomSnapshot(room));
    socket.emit("existing-users", existingIds);
    socket.to(key).emit("user-joined", { id: socket.id, username });
    io.to(key).emit("players-update", roomSnapshot(room).players);
    broadcastRoomList();
  });

  socket.on("leave-room", () => {
    leaveCurrentRoom(socket);
    socket.emit("left-room");
  });

  socket.on("chat-message", ({ text }) => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    io.to(key).emit("chat-message", {
      id: socket.id,
      username: player.username,
      text: String(text || "").slice(0, 500)
    });
  });

  socket.on("media-state", ({ micOn, camOn }) => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.micOn = !!micOn;
    player.camOn = !!camOn;
    socket.to(key).emit("media-state", { id: socket.id, micOn: !!micOn, camOn: !!camOn });
    io.to(key).emit("players-update", roomSnapshot(room).players);
  });

  socket.on("speaking", ({ speaking }) => {
    const key = socket.data.roomKey;
    const room = rooms.get(key);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.speaking = !!speaking;
    socket.to(key).emit("speaking", { id: socket.id, speaking: !!speaking });
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice", ({ to, candidate }) => {
    io.to(to).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket, true);
  });
});

function leaveCurrentRoom(socket, disconnected) {
  const key = socket.data.roomKey;
  if (!key) return;

  const room = rooms.get(key);
  if (!room) {
    socket.data.roomKey = null;
    return;
  }

  const player = room.players.get(socket.id);
  const username = player?.username || "Player";
  const wasHost = room.hostId === socket.id;

  if (wasHost) {
    deleteRoom(key, "Host left. Room closed.");
    return;
  }

  room.players.delete(socket.id);
  socket.leave(key);
  socket.data.roomKey = null;
  socket.data.space = null;
  socket.data.roomCode = null;

  socket.to(key).emit("user-left", { id: socket.id, username });
  io.to(key).emit("players-update", roomSnapshot(room).players);
  broadcastRoomList();
}

server.listen(PORT, () => {
  console.log("VOID PORTAL running on port " + PORT);
});
