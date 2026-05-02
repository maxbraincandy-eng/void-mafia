(function () {
  const peers = new Map();
  let localStream = null;
  let audioContext = null;
  let micAnalyser = null;
  let micData = null;
  let micPulseTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function app() {
    window.App = window.App || {};
    return window.App;
  }

  function socket() {
    const App = app();

    if (App.socket) return App.socket;

    if (typeof io === "function") {
      App.socket = io();
      return App.socket;
    }

    return null;
  }

  function toastSafe(message) {
    if (typeof toast === "function") return toast(message);

    const box = $("toast");
    if (!box) {
      alert(message);
      return;
    }

    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = message;
    box.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  function getUser() {
    const App = app();

    if (App.user) return App.user;

    try {
      const saved = JSON.parse(localStorage.getItem("void_user") || "null");
      if (saved) App.user = saved;
      return saved;
    } catch {
      return null;
    }
  }

  function getRoomId() {
    const App = app();

    return (
      App.currentRoomId ||
      App.currentRoom?.id ||
      document.body.dataset.roomId ||
      null
    );
  }

  function isInGameOrLobby() {
    const game = $("game");
    return game && !game.classList.contains("hidden");
  }

  async function ensureMedia() {
    if (localStream) return localStream;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toastSafe("ამ ბრაუზერს კამერა/მიკროფონი არ აქვს მხარდაჭერილი");
      return null;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      app().localStream = localStream;

      setupMicAnalyser(localStream);
      attachLocalPreview();

      return localStream;
    } catch (err) {
      console.error("getUserMedia failed:", err);
      toastSafe("კამერა/მიკროფონი ვერ ჩაირთო. ნებართვები გადაამოწმე.");
      return null;
    }
  }

  function setupMicAnalyser(stream) {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);

      micAnalyser = audioContext.createAnalyser();
      micAnalyser.fftSize = 256;

      source.connect(micAnalyser);
      micData = new Uint8Array(micAnalyser.frequencyBinCount);

      if (micPulseTimer) clearInterval(micPulseTimer);

      micPulseTimer = setInterval(updateMicPulse, 120);
    } catch (err) {
      console.warn("mic analyser disabled:", err);
    }
  }

  function updateMicPulse() {
    if (!micAnalyser || !micData) return;

    micAnalyser.getByteFrequencyData(micData);

    let sum = 0;
    for (const value of micData) sum += value;

    const avg = sum / micData.length;
    const speaking = avg > 18;

    document.querySelectorAll(".lobby-player.is-me, .tile.is-me").forEach(el => {
      el.classList.toggle("speaking", speaking);
    });

    document.querySelectorAll("#lobbyMicBtn, #micBtn").forEach(btn => {
      btn.classList.toggle("speaking", speaking);
    });
  }

  function attachLocalPreview() {
    const App = app();
    const room = App.currentRoom;
    const user = getUser();

    if (!room || !user || !localStream) return;

    const players = Array.isArray(room.players) ? room.players : [];
    const me = players.find(p => String(p.userId) === String(user.userId));
    if (!me) return;

    const video = $(`vid_${me.id}`);
    if (video && video.srcObject !== localStream) {
      video.srcObject = localStream;
      video.muted = true;
      video.play().catch(() => {});
    }
  }

  function createPeer(peerSocketId, initiator) {
    const s = socket();
    if (!s || !peerSocketId) return null;

    if (peers.has(peerSocketId)) return peers.get(peerSocketId);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
      ]
    });

    peers.set(peerSocketId, pc);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = event => {
      if (event.candidate) {
        s.emit("signal:ice", {
          to: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = event => {
      attachRemoteStream(peerSocketId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        closePeer(peerSocketId);
      }
    };

    if (initiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          s.emit("signal:offer", {
            to: peerSocketId,
            signal: pc.localDescription
          });
        })
        .catch(err => console.error("offer failed:", err));
    }

    return pc;
  }

  function attachRemoteStream(peerSocketId, stream) {
    if (!stream) return;

    let audio = document.getElementById(`remote_audio_${peerSocketId}`);

    if (!audio) {
      audio = document.createElement("audio");
      audio.id = `remote_audio_${peerSocketId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = "none";
      document.body.appendChild(audio);
    }

    audio.srcObject = stream;
    audio.play().catch(() => {
      showAudioUnlock();
    });

    const video = document.querySelector(`[data-socket-id="${peerSocketId}"] video`);

    if (video) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }

  function showAudioUnlock() {
    const unlock = $("audioUnlock");
    if (unlock) unlock.classList.remove("hidden");
  }

  function closePeer(peerSocketId) {
    const pc = peers.get(peerSocketId);

    if (pc) {
      try {
        pc.close();
      } catch {}
    }

    peers.delete(peerSocketId);

    const audio = document.getElementById(`remote_audio_${peerSocketId}`);
    if (audio) audio.remove();
  }

  async function connectToRoomPeers() {
    const App = app();
    const room = App.currentRoom;
    const s = socket();

    if (!room || !s) return;

    await ensureMedia();

    const players = Array.isArray(room.players) ? room.players : [];
    const mySocketId = s.id;

    players.forEach(player => {
      if (!player.socketId) return;
      if (player.socketId === mySocketId) return;

      createPeer(player.socketId, true);
    });
  }

  function bindSocketSignals() {
    const s = socket();
    if (!s || s.__voidSignalsBound) return;

    s.__voidSignalsBound = true;

    s.on("signal:offer", async ({ from, signal }) => {
      await ensureMedia();

      const pc = createPeer(from, false);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        s.emit("signal:answer", {
          to: from,
          signal: pc.localDescription
        });
      } catch (err) {
        console.error("offer handling failed:", err);
      }
    });

    s.on("signal:answer", async ({ from, signal }) => {
      const pc = peers.get(from);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } catch (err) {
        console.error("answer failed:", err);
      }
    });

    s.on("signal:ice", async ({ from, candidate }) => {
      const pc = peers.get(from);
      if (!pc || !candidate) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("ice failed:", err);
      }
    });

    s.on("room:state", room => {
      app().currentRoom = room;
      app().currentRoomId = room?.id || app().currentRoomId;

      setTimeout(() => {
        attachLocalPreview();
        connectToRoomPeers();
      }, 250);
    });

    s.on("chat:message", msg => {
      appendChatMessage(msg);
    });
  }

  async function toggleMic() {
    await ensureMedia();

    const track = localStream?.getAudioTracks?.()[0];
    if (!track) return;

    track.enabled = !track.enabled;

    const App = app();
    App.micOn = track.enabled;

    const roomId = getRoomId();
    const s = socket();

    if (s && roomId) {
      s.emit("media:state", {
        roomId,
        micOn: track.enabled
      });
    }

    updateMicButtons(track.enabled);
  }

  async function toggleCam() {
    await ensureMedia();

    const track = localStream?.getVideoTracks?.()[0];
    if (!track) return;

    track.enabled = !track.enabled;

    const App = app();
    App.cameraOn = track.enabled;

    const roomId = getRoomId();
    const s = socket();

    if (s && roomId) {
      s.emit("media:state", {
        roomId,
        cameraOn: track.enabled
      });
    }

    updateCamButtons(track.enabled);
  }

  function updateMicButtons(enabled) {
    document.querySelectorAll("#lobbyMicBtn, #micBtn").forEach(btn => {
      btn.textContent = enabled ? "MIC ON" : "MIC OFF";
      btn.classList.toggle("off", !enabled);
    });
  }

  function updateCamButtons(enabled) {
    document.querySelectorAll("#lobbyCamBtn, #camBtn").forEach(btn => {
      btn.textContent = enabled ? "CAM ON" : "CAM OFF";
      btn.classList.toggle("off", !enabled);
    });
  }

  function openChat() {
    const panel = $("chatPanel");
    if (!panel) return;

    panel.classList.remove("hidden");
    renderChatFromRoom();
  }

  function openLog() {
    const panel = $("logPanel");
    if (!panel) return;

    panel.classList.remove("hidden");
  }

  function closePanelByButton(event) {
    const btn = event.target.closest("[data-close]");
    if (!btn) return;

    const id = btn.getAttribute("data-close");
    const panel = $(id);

    if (panel) panel.classList.add("hidden");
  }

  function appendChatMessage(msg) {
    const box = $("chatMessages");
    if (!box || !msg) return;

    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML = `
      <b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtmlSafe(msg.nickname || "Player")}</b><br>
      ${escapeHtmlSafe(msg.message || "")}
    `;

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function renderChatFromRoom() {
    const App = app();
    const box = $("chatMessages");
    if (!box) return;

    const chat = Array.isArray(App.currentRoom?.chat) ? App.currentRoom.chat : [];

    box.innerHTML = chat.map(msg => `
      <div class="msg">
        <b>${msg.seat ? "#" + msg.seat + " · " : ""}${escapeHtmlSafe(msg.nickname || "Player")}</b><br>
        ${escapeHtmlSafe(msg.message || "")}
      </div>
    `).join("");

    box.scrollTop = box.scrollHeight;
  }

  function sendChat() {
    const input = $("chatInput");
    const message = (input?.value || "").trim();
    const s = socket();
    const roomId = getRoomId();

    if (!message) return;
    if (!s || !roomId) {
      toastSafe("ოთახი ვერ მოიძებნა");
      return;
    }

    s.emit("chat:send", {
      roomId,
      message
    }, res => {
      if (!res?.ok) {
        toastSafe(res?.error || "მესიჯი ვერ გაიგზავნა");
        return;
      }

      input.value = "";
    });
  }

  async function loadClans() {
    const box = $("clansList");
    if (!box) return;

    try {
      const res = await fetch("/api/clans", {
        cache: "no-store"
      });

      const data = await res.json();
      const clans = Array.isArray(data.clans) ? data.clans : [];

      renderClans(clans);
      updateClanStats(clans.length);
    } catch (err) {
      console.error("load clans failed:", err);
      box.innerHTML = `<div class="room-card">კლანების ჩატვირთვა ვერ მოხერხდა.</div>`;
    }
  }

  function renderClans(clans) {
    const box = $("clansList");
    if (!box) return;

    if (!clans.length) {
      box.innerHTML = `<div class="room-card">კლანები ჯერ არ არის.</div>`;
      return;
    }

    box.innerHTML = clans.map(clan => {
      const members = clan.membersCount || clan.members?.length || 0;

      return `
        <div class="clan-card">
          <div class="room-title">
            <h3>${escapeHtmlSafe(clan.name || "Clan")}</h3>
            <span class="badge live">${escapeHtmlSafe(clan.emblem || "◆")}</span>
          </div>

          <div class="room-meta">
            <span class="badge">ლიდერი: ${escapeHtmlSafe(clan.leaderName || "Player")}</span>
            <span class="badge">წევრები: ${members}</span>
            <span class="badge">ქულა: ${clan.points || 0}</span>
            <span class="badge">მოგება: ${clan.wins || 0}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  async function createClan() {
    const input = $("clanName");
    const name = (input?.value || "").trim();
    const user = getUser();

    if (!user?.userId) {
      toastSafe("ჯერ შედი ანგარიშში");
      return;
    }

    if (!name) {
      toastSafe("კლანის სახელი ჩაწერე");
      return;
    }

    try {
      const res = await fetch("/api/clans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-store",
        body: JSON.stringify({
          name,
          user
        })
      });

      const data = await res.json();

      if (!data.ok) {
        toastSafe(data.error || "კლანის შექმნა ვერ მოხერხდა");
        return;
      }

      input.value = "";
      toastSafe("კლანი შეიქმნა");
      await loadClans();
    } catch (err) {
      console.error("create clan failed:", err);
      toastSafe("სერვერთან კავშირი ვერ მოხერხდა");
    }
  }

  function updateClanStats(count) {
    const el = $("sClans");
    if (el) el.textContent = String(count || 0);
  }

  function escapeHtmlSafe(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bindButtons() {
    document.addEventListener("click", event => {
      if (event.target.closest("#chatBtn")) {
        event.preventDefault();
        openChat();
      }

      if (event.target.closest("#logBtn")) {
        event.preventDefault();
        openLog();
      }

      if (event.target.closest("#sendChat")) {
        event.preventDefault();
        sendChat();
      }

      if (event.target.closest("#createClan")) {
        event.preventDefault();
        createClan();
      }

      if (event.target.closest("#lobbyMicBtn") || event.target.closest("#micBtn")) {
        event.preventDefault();
        toggleMic();
      }

      if (event.target.closest("#lobbyCamBtn") || event.target.closest("#camBtn")) {
        event.preventDefault();
        toggleCam();
      }

      closePanelByButton(event);
    });

    $("chatInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") sendChat();
    });

    $("enableAudio")?.addEventListener("click", async () => {
      try {
        if (audioContext?.state === "suspended") {
          await audioContext.resume();
        }

        document.querySelectorAll("audio").forEach(a => {
          a.play().catch(() => {});
        });

        $("audioUnlock")?.classList.add("hidden");
      } catch {}
    });
  }

  function observeUi() {
    const observer = new MutationObserver(() => {
      const App = app();

      if (isInGameOrLobby() && App.currentRoom) {
        attachLocalPreview();
      }

      const micTrack = localStream?.getAudioTracks?.()[0];
      const camTrack = localStream?.getVideoTracks?.()[0];

      if (micTrack) updateMicButtons(micTrack.enabled);
      if (camTrack) updateCamButtons(camTrack.enabled);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function boot() {
    bindSocketSignals();
    bindButtons();
    observeUi();
    loadClans();

    setInterval(() => {
      if (isInGameOrLobby()) {
        connectToRoomPeers();
      }
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
