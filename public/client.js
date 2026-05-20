const socket = io();

const portalScreen = document.getElementById('portalScreen');
const roomScreen = document.getElementById('roomScreen');
const usernameInput = document.getElementById('usernameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinBtn = document.getElementById('joinBtn');
const statusText = document.getElementById('statusText');
const roomTitle = document.getElementById('roomTitle');
const roomMeta = document.getElementById('roomMeta');
const leaveBtn = document.getElementById('leaveBtn');
const startGameBtn = document.getElementById('startGameBtn');
const playerCount = document.getElementById('playerCount');
const playersList = document.getElementById('playersList');
const messages = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const spaceInfo = document.getElementById('spaceInfo');
const gameControls = document.getElementById('gameControls');

let selectedSpace = 'lounge';
let currentRoom = null;
let mySocketId = null;

const spaceContent = {
  lounge: {
    title: 'Void Lounge',
    description: 'A private neon lounge for friends. Use this as the main gathering room before switching into games.',
    controls: ''
  },
  mafia: {
    title: 'Mafia Lite',
    description: 'Mafia lobby is ready. Next version will add automatic roles, night/day phases, voting, dead chat, and spectator mode.',
    controls: '<p>Mafia engine is prepared as a placeholder. Use Start to lock the lobby and begin the role-preview phase.</p>'
  },
  confession: {
    title: 'Confession Room',
    description: 'Submit anonymous confessions. The host can reveal all submitted confessions without showing authors.',
    controls: `
      <input id="confessionInput" class="confession-input" maxlength="600" placeholder="Write anonymous confession..." />
      <div class="control-row">
        <button id="submitConfessionBtn">Submit Confession</button>
        <button id="revealConfessionsBtn">Reveal Confessions</button>
      </div>
      <div id="confessionsList"></div>
    `
  },
  truth: {
    title: 'Truth or Dare',
    description: 'Spin a random player. Then choose truth or dare in chat. Future version will include automatic question decks.',
    controls: `
      <div class="control-row">
        <button id="spinBtn">Spin Random Player</button>
      </div>
      <p id="spinResult"></p>
    `
  },
  debate: {
    title: 'Debate Arena',
    description: 'A simple debate lobby. Future version will add random topics, timer, audience votes, and winner screen.',
    controls: '<p>Suggested topic: Is truth more important than peace?</p>'
  },
  mystery: {
    title: 'Mystery Room',
    description: 'A detective-style social room. Future version will add hidden roles, clues, liar mechanics, and final guesses.',
    controls: '<p>Prototype mode: use chat to roleplay clues and accusations.</p>'
  }
};

function showScreen(screen) {
  portalScreen.classList.toggle('active', screen === 'portal');
  roomScreen.classList.toggle('active', screen === 'room');
}

function normalizeRoomCode(value) {
  return String(value || 'VOID').trim().toUpperCase().replace(/\s+/g, '-').slice(0, 20) || 'VOID';
}

function addMessage(type, content) {
  const item = document.createElement('div');
  item.className = `message ${type || ''}`.trim();
  item.innerHTML = content;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    };
    return map[char];
  });
}

function renderRoom(room) {
  currentRoom = room;
  const content = spaceContent[room.space] || spaceContent.lounge;

  roomTitle.textContent = content.title;
  roomMeta.textContent = `Room: ${room.roomCode} · ${room.playerCount} player${room.playerCount === 1 ? '' : 's'}`;
  playerCount.textContent = room.playerCount;

  playersList.innerHTML = '';
  room.players.forEach((player) => {
    const item = document.createElement('li');
    const you = player.id === mySocketId ? ' <span class="host-badge">YOU</span>' : '';
    const host = player.host ? ' <span class="host-badge">HOST</span>' : '';
    item.innerHTML = `${escapeHtml(player.username)}${you}${host}`;
    playersList.appendChild(item);
  });

  spaceInfo.innerHTML = `
    <h3>${content.title}</h3>
    <p>${content.description}</p>
    <p>Status: <strong>${room.gameState.started ? 'Started' : 'Lobby'}</strong> · Phase: <strong>${room.gameState.phase}</strong></p>
  `;

  gameControls.classList.toggle('active', Boolean(content.controls));
  gameControls.innerHTML = content.controls || '';
  bindDynamicControls(room.space);
}

function bindDynamicControls(space) {
  if (space === 'truth') {
    const spinBtn = document.getElementById('spinBtn');
    if (spinBtn) {
      spinBtn.addEventListener('click', () => socket.emit('truth-spin'));
    }
  }

  if (space === 'confession') {
    const submitBtn = document.getElementById('submitConfessionBtn');
    const revealBtn = document.getElementById('revealConfessionsBtn');
    const input = document.getElementById('confessionInput');

    if (submitBtn && input) {
      submitBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        socket.emit('submit-confession', { text });
        input.value = '';
      });
    }

    if (revealBtn) {
      revealBtn.addEventListener('click', () => socket.emit('reveal-confessions'));
    }
  }
}

document.querySelectorAll('.space-card').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.space-card').forEach((card) => card.classList.remove('selected'));
    button.classList.add('selected');
    selectedSpace = button.dataset.space;
  });
});

joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim() || 'Guest';
  const roomCode = normalizeRoomCode(roomCodeInput.value);

  messages.innerHTML = '';
  socket.emit('join-space', {
    username,
    roomCode,
    space: selectedSpace
  });
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave-room');
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start-game');
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit('lobby-message', { text });
  messageInput.value = '';
});

socket.on('connect', () => {
  mySocketId = socket.id;
  statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
  statusText.textContent = 'Disconnected';
  addMessage('error', 'Connection lost. Trying to reconnect...');
});

socket.on('connected', (payload) => {
  mySocketId = payload.id;
});

socket.on('joined-room', (room) => {
  showScreen('room');
  addMessage('system', `Joined <strong>${escapeHtml(room.spaceName)}</strong> room <strong>${escapeHtml(room.roomCode)}</strong>.`);
  renderRoom(room);
});

socket.on('room-update', renderRoom);

socket.on('system-message', (payload) => {
  addMessage('system', escapeHtml(payload.text));
});

socket.on('error-message', (payload) => {
  addMessage('error', escapeHtml(payload.text));
});

socket.on('lobby-message', (payload) => {
  addMessage('', `<strong>${escapeHtml(payload.username)}:</strong> ${escapeHtml(payload.text)}`);
});

socket.on('game-started', (room) => {
  addMessage('system', `Game started in <strong>${escapeHtml(room.spaceName)}</strong>.`);
  renderRoom(room);
});

socket.on('truth-spin-result', (payload) => {
  const result = document.getElementById('spinResult');
  if (result) result.textContent = `Selected player: ${payload.selected}`;
  addMessage('system', `Truth or Dare selected: <strong>${escapeHtml(payload.selected)}</strong>.`);
});

socket.on('confession-saved', (payload) => {
  addMessage('system', `Your confession was saved. Total confessions: ${payload.count}.`);
});

socket.on('confessions-revealed', (payload) => {
  const list = document.getElementById('confessionsList');
  const html = payload.confessions.length
    ? payload.confessions.map((item) => `<div class="message"><strong>#${item.number}</strong> ${escapeHtml(item.text)}</div>`).join('')
    : '<p>No confessions submitted yet.</p>';

  if (list) list.innerHTML = html;
  addMessage('system', 'Host revealed anonymous confessions.');
});

socket.on('left-room', () => {
  currentRoom = null;
  showScreen('portal');
});

usernameInput.value = localStorage.getItem('voidPortalUsername') || '';
usernameInput.addEventListener('change', () => {
  localStorage.setItem('voidPortalUsername', usernameInput.value.trim());
});
