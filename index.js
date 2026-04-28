
<!DOCTYPE html>
<html lang="ka">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>VOID MAFIA</title>
    <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Bebas+Neue&family=Rajdhani:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        /* ... (შენი არსებული სტილები უცვლელია) ... */
        :root {
            --orange: #ff6b00;
            --orange-bright: #ff8c00;
            --orange-dim: #ff6b0044;
            --orange-glow: #ff6b0088;
            --cyan: #00fff0;
            --bg: #030305;
            --bg2: #08080f;
            --grid: #ff6b0012;
            --text: #ffeedd;
            --muted: #ff6b0077;
            --main-red: #ff4757;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: var(--bg);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Rajdhani', sans-serif;
            overflow-x: hidden;
            position: relative;
            padding: 20px;
        }

        .grid-bg { position: fixed; inset: 0; background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 40px 40px; animation: gridDrift 20s linear infinite; z-index: -1; }
        @keyframes gridDrift { 0% { transform: perspective(600px) rotateX(10deg) translateY(0); } 100% { transform: perspective(600px) rotateX(10deg) translateY(40px); } }
        .scanlines { position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px); pointer-events: none; z-index: 100; }
        .noise { position: fixed; inset: -50%; width: 200%; height: 200%; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"); opacity: 0.4; pointer-events: none; z-index: 98; animation: noiseDrift 0.5s steps(2) infinite; }
        
        .card { position: relative; z-index: 10; width: min(400px, 92vw); background: rgba(8,8,15,0.9); border: 1px solid var(--orange-glow); padding: 30px; animation: cardIn 0.8s cubic-bezier(0.16,1,0.3,1) both; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
        .logo-wrap { text-align: center; margin-bottom: 24px; }
        .logo-title { font-family: 'Bebas Neue', cursive; font-size: 42px; letter-spacing: 8px; color: var(--text); text-shadow: 0 0 15px var(--orange); }
        .terminal { background: #000; border-left: 3px solid var(--orange); padding: 10px; margin-bottom: 20px; font-family: 'Share Tech Mono', monospace; font-size: 11px; color: var(--orange); min-height: 60px; text-align: left; }
        .field { margin-bottom: 15px; text-align: left; }
        .field label { display: block; font-family: 'Share Tech Mono', monospace; font-size: 10px; color: var(--orange); margin-bottom: 5px; letter-spacing: 2px; }
        input { width: 100%; background: #000; border: 1px solid var(--orange-dim); border-bottom: 2px solid var(--orange); color: white; padding: 12px; font-family: 'Share Tech Mono', monospace; outline: none; }
        
        .btn { width: 100%; padding: 14px; font-family: 'Bebas Neue', cursive; font-size: 18px; letter-spacing: 3px; cursor: pointer; border: none; transition: 0.3s; margin-top: 10px; clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%); }
        .btn-primary { background: var(--orange); color: #000; }
        .btn-secondary { background: transparent; color: var(--orange); border: 1px solid var(--orange-glow); }
        
        .history-box { margin-top: 20px; border: 1px solid var(--orange-dim); padding: 10px; font-size: 11px; color: var(--muted); font-family: 'Share Tech Mono'; }
        .history-item { display: flex; justify-content: space-between; border-bottom: 1px solid #111; padding: 5px 0; }

        #game-interface { display: none; width: 100%; max-width: 1000px; z-index: 10; }
        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; width: 100%; }
        .video-box { background: #000; border: 1px solid #333; position: relative; aspect-ratio: 3/4; overflow: hidden; border-radius: 4px; }
        .hidden { display: none !important; }
    </style>
</head>
<body>

<div class="noise"></div>
<div class="grid-bg"></div>
<div class="scanlines"></div>

<div id="login-screen" class="card">
    <div class="logo-wrap">
        <h1 class="logo-title">VOID MAFIA</h1>
        <div class="powered-by">Powered by ბატონი მაქსი</div>
    </div>

    <div class="terminal" id="terminal-out">> SYSTEM_READY: WAITING_FOR_AUTH...</div>

    <div class="field">
        <label>// OPERATOR_ID</label>
        <input type="text" id="nickname" placeholder="NICKNAME" autocomplete="off">
    </div>
    <div class="field">
        <label>// ACCESS_KEY</label>
        <input type="password" id="password" placeholder="PASSWORD">
    </div>

    <button class="btn btn-primary" onclick="handleAuth()">ავტორიზაცია</button>
</div>

<div id="rooms-screen" class="card hidden">
    <div class="logo-wrap"><h2 class="logo-title" style="font-size: 24px;">DATA_CENTER</h2></div>
    
    <div class="field">
        <label>// CREATE_NEW_CHANNEL</label>
        <input type="text" id="room-name" placeholder="ROOM_ID">
    </div>
    <button class="btn btn-primary" onclick="createRoom()">შექმენი ოთახი</button>

    <div id="room-list" style="margin-top: 20px;"></div>

    <div class="history-box">
        <div style="color: var(--orange); margin-bottom: 10px;">// RECENT_HISTORY</div>
        <div id="match-history-list">
            <div class="history-item"><span>NO_DATA_FOUND</span></div>
        </div>
    </div>
</div>

<div id="game-interface">
    <div id="game-info" style="background: rgba(8,8,15,0.95); border: 1px solid var(--orange); padding: 15px; margin-bottom: 20px; text-align: center;">
        <div id="speaker-info" style="color: var(--orange);">INITIALIZING...</div>
        <div id="timer" style="font-size: 32px; color: var(--orange); font-family: 'Share Tech Mono';">00:00</div>
        <div id="role-display" style="color: var(--cyan);">ROLE: UNDEFINED</div>
        <button id="start-btn" class="btn btn-primary hidden" onclick="startGame()">თამაშის დაწყება</button>
    </div>
    <div class="video-grid" id="video-grid"></div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script src="https://unpkg.com/simple-peer@9.11.1/simplepeer.min.js"></script>
<script>
    let socket;
    let localStream, myNickname, currentRoomId, myToken;
    const peers = {};

    async function handleAuth() {
        const user = document.getElementById('nickname').value.trim();
        const pass = document.getElementById('password').value.trim();
        const term = document.getElementById('terminal-out');

        if (!user || !pass) return term.innerText = "> ERROR: CREDENTIALS_REQUIRED";

        term.innerText = "> AUTHENTICATING...";

        try {
            // ავტორიზაციის API-ს გამოძახება
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            const data = await res.json();

            if (data.token) {
                myToken = data.token;
                myNickname = user;
                localStorage.setItem('void_token', data.token);
                
                term.innerText = "> ACCESS_GRANTED. REDIRECTING...";
                
                // სოკეტის დაკავშირება ტოკენით
                initSocket(data.token);
                
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('rooms-screen').classList.remove('hidden');
            } else {
                term.innerText = "> ERROR: " + (data.msg || "AUTH_FAILED");
            }
        } catch (e) {
            term.innerText = "> SYSTEM_ERROR: CONNECTION_REFUSED";
        }
    }

    function initSocket(token) {
        socket = io({
            auth: { token: token }
        });

        socket.on('update-room-list', rooms => {
            const container = document.getElementById('room-list');
            container.innerHTML = rooms.length ? "" : "<div class='history-item'>NO_ACTIVE_ROOMS</div>";
            rooms.forEach(r => {
                const b = document.createElement('button');
                b.className = "btn btn-secondary";
                b.style.fontSize = "12px";
                b.innerHTML = `JOIN: ${r.name} [${r.playerCount}/10]`;
                b.onclick = () => joinRoom(r.id, 'player');
                container.appendChild(b);
            });
        });

        socket.on('is-host', () => document.getElementById('start-btn').classList.remove('hidden'));
        
        socket.on('assign-role', role => {
            document.getElementById('role-display').innerText = "ROLE: " + role.toUpperCase();
        });
        
        // ... (სხვა სოკეტის ივენთები: all-users, user-joined და ა.შ. იგივე რჩება)
    }

    async function joinRoom(roomID, type) {
        currentRoomId = roomID;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            addVideoElement('me', localStream, myNickname + " (YOU)", true);
            
            document.getElementById('rooms-screen').classList.add('hidden');
            document.getElementById('game-interface').style.display = 'block';
            socket.emit('join-room', roomID);
        } catch (e) { alert("ERROR: Camera Access Denied"); }
    }

    function createRoom() {
        const name = document.getElementById('room-name').value;
        if (name) joinRoom(name, 'player'); // ბექენდი ავტომატურად ქმნის თუ არ არსებობს
    }

    function addVideoElement(id, stream, name, isLocal = false) {
        const videoGrid = document.getElementById('video-grid');
        let box = document.getElementById(id);
        if (!box) {
            box = document.createElement('div'); 
            box.id = id; 
            box.className = 'video-box';
            box.innerHTML = `<video id="v-${id}" autoplay playsinline ${isLocal?'muted':''}></video><div class="nick" style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.8); color:var(--orange); font-size:12px; padding:5px; text-align:center;">${name}</div>`;
            videoGrid.appendChild(box);
        }
        if (stream) document.getElementById(`v-${id}`).srcObject = stream;
    }
</script>
</body>
</html>
