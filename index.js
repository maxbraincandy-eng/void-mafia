<!DOCTYPE html>
<html lang="ka">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>VOID MAFIA</title>
    <link href="https://fonts.googleapis.com/css2?family=VT323&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        /* ═══════════════════════════════════════════
           VOID MAFIA — SYNTHWAVE STYLING
        ═══════════════════════════════════════════ */
        :root {
            --bg: #07020f;
            --bg2: #0e0520;
            --magenta: #ff00ff;
            --cyan: #00ffff;
            --pink: #ff2d9b;
            --purple: #bf00ff;
            --yellow: #ffe600;
            --gold: #ffd700;
            --text: #f0e6ff;
            --dim: #6a4a8a;
            --grid: rgba(191,0,255,0.07);
        }

        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: 'Rajdhani', sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: crosshair;
        }

        /* ── BACKGROUNDS ── */
        .grid-bg {
            position: fixed; inset: 0; z-index: -1;
            background: linear-gradient(transparent 0%, var(--bg) 100%),
                        repeating-linear-gradient(90deg, var(--grid) 0px, var(--grid) 1px, transparent 1px, transparent 60px),
                        repeating-linear-gradient(0deg, var(--grid) 0px, var(--grid) 1px, transparent 1px, transparent 60px);
            transform: perspective(500px) rotateX(60deg);
            transform-origin: bottom center;
            animation: gridScroll 10s linear infinite;
        }
        @keyframes gridScroll { from { background-position: 0 0; } to { background-position: 0 60px; } }

        .scanlines::after {
            content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 100;
            background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px);
        }

        /* ── UI CARDS ── */
        .card {
            background: rgba(14,5,32,0.9);
            border: 1px solid var(--magenta);
            box-shadow: 0 0 30px rgba(255,0,255,0.2);
            padding: 40px;
            width: min(450px, 95vw);
            text-align: center;
            position: relative;
            z-index: 10;
        }

        .logo-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 42px; font-weight: 900; letter-spacing: 6px;
            color: var(--cyan);
            text-shadow: 0 0 20px var(--cyan);
            margin-bottom: 5px;
        }

        .powered-by {
            font-family: 'Share Tech Mono', monospace;
            font-size: 11px; color: var(--magenta);
            letter-spacing: 2px; text-transform: uppercase;
        }

        .terminal {
            background: #000; border-left: 3px solid var(--cyan);
            padding: 10px; margin: 20px 0;
            font-family: 'VT323', monospace; font-size: 18px;
            color: var(--cyan); text-align: left;
        }

        /* ── INPUTS & BUTTONS ── */
        .field { margin-bottom: 20px; text-align: left; }
        .field label { 
            display: block; font-family: 'Share Tech Mono', monospace; 
            font-size: 12px; color: var(--dim); margin-bottom: 8px; 
        }
        input {
            width: 100%; background: rgba(0,0,0,0.5);
            border: 1px solid var(--magenta);
            color: white; padding: 12px; font-family: 'Share Tech Mono', monospace;
            outline: none; transition: 0.3s;
        }
        input:focus { border-color: var(--cyan); box-shadow: 0 0 15px var(--cyan); }

        .btn {
            width: 100%; padding: 15px; font-family: 'Orbitron', sans-serif;
            font-size: 14px; font-weight: 700; letter-spacing: 2px;
            cursor: pointer; border: none; margin-top: 10px;
            transition: 0.3s; text-transform: uppercase;
        }
        .btn-primary { background: var(--magenta); color: white; box-shadow: 0 0 15px var(--magenta); }
        .btn-secondary { background: transparent; color: var(--cyan); border: 1px solid var(--cyan); }
        .btn:hover { transform: translateY(-2px); filter: brightness(1.2); }

        /* ── GAME INTERFACE ── */
        #game-interface { display: none; width: 100%; max-width: 1200px; padding: 20px; z-index: 10; }
        #game-info { 
            background: var(--bg2); border: 1px solid var(--magenta); 
            padding: 20px; margin-bottom: 20px; text-align: center;
        }
        #timer { font-family: 'VT323', monospace; font-size: 48px; color: var(--yellow); }

        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .video-box { 
            background: #000; border: 1px solid var(--dim); 
            position: relative; aspect-ratio: 3/4; overflow: hidden;
        }
        .video-box.active-speaker { border: 2px solid var(--cyan); box-shadow: 0 0 20px var(--cyan); }
        video { width: 100%; height: 100%; object-fit: cover; }
        
        .nick { 
            position: absolute; bottom: 0; width: 100%; background: rgba(0,0,0,0.8); 
            color: var(--cyan); font-family: 'Share Tech Mono'; padding: 5px; font-size: 12px;
        }

        #night-overlay {
            display: none; position: fixed; inset: 0; background: rgba(7,2,15,0.98);
            z-index: 1000; flex-direction: column; align-items: center; justify-content: center;
        }

        .hidden { display: none !important; }
    </style>
</head>
<body>

<div class="grid-bg"></div>
<div class="scanlines"></div>

<div id="login-screen" class="card">
    <div class="logo-wrap">
        <h1 class="logo-title">VOID MAFIA</h1>
        <div class="powered-by">System Operator // v2.0</div>
    </div>
    <div class="terminal" id="terminal-out">> AUTHORIZATION REQUIRED...</div>
    <div class="field">
        <label>// ENTER_CODENAME</label>
        <input type="text" id="nickname" placeholder="NICKNAME" autocomplete="off">
    </div>
    <button class="btn btn-primary" onclick="toRoomSelection()">შესვლა</button>
</div>

<div id="rooms-screen" class="card hidden">
    <h2 class="logo-title" style="font-size: 24px;">CHANNELS</h2>
    <div class="field">
        <label>// NEW_ROOM_ID</label>
        <input type="text" id="room-name" placeholder="ROOM_ID">
    </div>
    <div style="display: flex; gap: 10px;">
        <button class="btn btn-primary" onclick="joinRoom(document.getElementById('room-name').value, 'player')">ითამაშე</button>
        <button class="btn btn-secondary" onclick="joinRoom(document.getElementById('room-name').value, 'spectator')">ყურება</button>
    </div>
    <div id="room-list" style="margin-top: 20px;"></div>
</div>

<div id="game-interface">
    <div id="game-info">
        <div id="speaker-info" style="color: var(--magenta); letter-spacing: 2px; font-weight: bold;">[ CONNECTING... ]</div>
        <div id="timer">00:00</div>
        <div id="role-display" style="color: var(--cyan); margin-top: 10px; font-family: 'Share Tech Mono';">ROLE: UNDEFINED</div>
        <button id="start-btn" class="btn btn-primary hidden" style="max-width: 250px; margin: 15px auto;" onclick="startGame()">თამაშის დაწყება</button>
    </div>

    <div id="voting-panel" class="card" style="display: none; width: 100%; margin-bottom: 20px; border-color: var(--yellow);">
        <h3 style="color: var(--yellow);">VOTING PHASE</h3>
        <div id="vote-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;"></div>
    </div>

    <div class="video-grid" id="video-grid"></div>
</div>

<div id="night-overlay">
    <h1 style="color: var(--magenta); font-family: 'Orbitron'; letter-spacing: 10px; font-size: clamp(30px, 8vw, 60px);">NIGHT PHASE</h1>
    <p style="font-family: 'VT323'; color: var(--cyan); font-size: 24px;">ქალაქს ეძინება...</p>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://unpkg.com/simple-peer@9.11.1/simplepeer.min.js"></script>
<script>
    /* აქ დარჩა შენი ორიგინალური ლოგიკა უცვლელად */
    const socket = io();
    const videoGrid = document.getElementById('video-grid');
    const peers = {};
    let localStream, myNickname, currentRoomId, myType, myRole;

    function toRoomSelection() {
        myNickname = document.getElementById('nickname').value.trim();
        if (!myNickname) return;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('rooms-screen').classList.remove('hidden');
        socket.emit('get-rooms');
    }

    async function joinRoom(roomID, type) {
        if (!roomID) return;
        currentRoomId = roomID;
        myType = type;
        try {
            if (type === 'player') {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                addVideoElement('me', localStream, myNickname + " (შენ)", true);
            }
            document.getElementById('rooms-screen').classList.add('hidden');
            document.getElementById('game-interface').style.display = 'block';
            socket.emit('join-room', roomID, myNickname, type);
        } catch (e) { alert("კამერასთან წვდომა უარყოფილია"); }
    }

    socket.on('is-host', () => document.getElementById('start-btn').classList.remove('hidden'));

    function startGame() {
        socket.emit('start-game', currentRoomId);
        document.getElementById('start-btn').classList.add('hidden');
    }

    socket.on('assign-role', role => {
        myRole = role;
        const rd = document.getElementById('role-display');
        rd.innerText = "ROLE: " + role.toUpperCase();
        rd.style.color = (role === 'Mafia') ? 'var(--magenta)' : 'var(--cyan)';
    });

    socket.on('next-turn', (data) => {
        document.getElementById('night-overlay').style.display = 'none';
        document.getElementById('voting-panel').style.display = 'none';
        document.getElementById('speaker-info').innerText = "საუბრობს: " + data.nickname;
        document.querySelectorAll('.video-box').forEach(b => b.classList.remove('active-speaker'));
        const active = document.getElementById(data.userId === socket.id ? 'me' : data.userId);
        if (active) active.classList.add('active-speaker');
        if (localStream) localStream.getAudioTracks()[0].enabled = (socket.id === data.userId);
        startTimer(data.seconds);
    });

    socket.on('start-voting', (players) => {
        const panel = document.getElementById('voting-panel');
        const list = document.getElementById('vote-list');
        panel.style.display = 'block';
        list.innerHTML = "";
        players.forEach(p => {
            if (p.id !== socket.id) {
                const b = document.createElement('button');
                b.className = "btn btn-secondary";
                b.innerText = p.nick;
                b.onclick = () => {
                    socket.emit('cast-vote', { targetId: p.id, roomId: currentRoomId });
                    list.innerHTML = "<p style='color:var(--cyan)'>ხმა რეგისტრირებულია</p>";
                };
                list.appendChild(b);
            }
        });
    });

    socket.on('night-phase', () => {
        document.getElementById('night-overlay').style.display = 'flex';
        if (localStream) localStream.getAudioTracks()[0].enabled = false;
    });

    function startTimer(s) {
        clearInterval(window.tmr);
        let left = s;
        window.tmr = setInterval(() => {
            document.getElementById('timer').innerText = `00:${left < 10 ? '0'+left : left}`;
            if (--left < 0) clearInterval(window.tmr);
        }, 1000);
    }

    function addVideoElement(id, stream, name, isLocal = false) {
        let box = document.getElementById(id);
        if (!box) {
            box = document.createElement('div'); box.id = id; box.className = 'video-box';
            box.innerHTML = `<video id="v-${id}" autoplay playsinline ${isLocal?'muted':''}></video><div class="nick">${name}</div>`;
            videoGrid.appendChild(box);
        }
        if (stream) document.getElementById(`v-${id}`).srcObject = stream;
    }

    /* Socket Peer ლოგიკა */
    socket.on('all-users', users => {
        users.forEach(u => {
            const p = new SimplePeer({ initiator: true, trickle: false, stream: localStream });
            p.on('signal', s => socket.emit('sending-signal', { userToSignal: u.id, callerID: socket.id, signal: s }));
            p.on('stream', st => addVideoElement(u.id, st, u.nickname));
            peers[u.id] = p;
        });
    });

    socket.on('user-joined', p => {
        const peer = new SimplePeer({ initiator: false, trickle: false, stream: localStream });
        peer.on('signal', s => socket.emit('returning-signal', { signal: s, callerID: p.callerID }));
        peer.on('stream', st => addVideoElement(p.callerID, st, p.nickname));
        peer.signal(p.signal);
        peers[p.callerID] = peer;
    });

    socket.on('receiving-returned-signal', p => peers[p.id] && peers[p.id].signal(p.signal));
    socket.on('user-left', id => { document.getElementById(id)?.remove(); delete peers[id]; });
</script>
</body>
</html>
