function setupIncomingUsers(users) {
  users.forEach(u => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: localStream
    });

    peer.on("signal", signal => {
      socket.emit("sending-signal", {
        userToSignal: u.id,
        callerID: socket.id,
        signal
      });
    });

    peer.on("stream", stream => {
      addVideo(u.id, stream, u.name, u.index);
    });

    peer.on("error", err => console.error("peer error:", err));

    peers[u.id] = peer;
  });
}

function setupNewUserPeer(p) {
  const peer = new SimplePeer({
    initiator: false,
    trickle: false,
    stream: localStream
  });

  peer.on("signal", signal => {
    socket.emit("returning-signal", {
      signal,
      callerID: p.id
    });
  });

  peer.on("stream", stream => {
    addVideo(p.id, stream, p.nick, p.index);
  });

  peer.on("error", err => console.error("peer error:", err));

  if (p.signal) {
    peer.signal(p.signal);
  }

  peers[p.id] = peer;
}

function receiveReturnedSignal(p) {
  if (peers[p.id]) {
    peers[p.id].signal(p.signal);
  }
}

function removePeer(id) {
  if (peers[id]) {
    peers[id].destroy();
    delete peers[id];
  }

  const el = $(id);
  if (el) el.remove();
}

function addVideo(id, stream, name, index, mute = false) {
  if ($(id)) return;

  const div = document.createElement("div");
  div.id = id;
  div.className = "video-box";
  div.style.order = index;

  div.innerHTML = `
    <div class="player-number">#${index}</div>
    <video id="v-${id}" autoplay playsinline ${mute ? "muted" : ""}></video>
    <div class="video-label">${escapeHtml(name)}</div>
  `;

  $("video-grid").appendChild(div);

  if (stream) {
    $("v-" + id).srcObject = stream;
    setTimeout(updateVoiceByPhase, 300);
  }
}

async function startCameraAndMic() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  return localStream;
}

function toggleMic() {
  if (!localStream) return;

  const track = localStream.getAudioTracks()[0];
  if (!track) return;

  track.enabled = !track.enabled;
  $("mic-btn").style.background = track.enabled ? "var(--neon)" : "#333";
}

function toggleCam() {
  if (!localStream) return;

  const track = localStream.getVideoTracks()[0];
  if (!track) return;

  track.enabled = !track.enabled;
  $("cam-btn").style.background = track.enabled ? "var(--cyan)" : "#333";
}
