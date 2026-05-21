const express = require('express');

const http = require('http');

const {
 Server 
}
 = require('socket.io');

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
 cors: {
 origin: '*' 
}
 
}
);

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const timers = new Map();

const spaces = {

  mafia: {
 label: 'Mafia', icon: '♛', max: 8 
}
,
  truth: {
 label: 'Truth', icon: '◆', max: 8 
}
,
  debate: {
 label: 'Debate', icon: '◇', max: 8 
}
,
  lounge: {
 label: 'Lounge', icon: '◌', max: 8 
}
,
  confession: {
 label: 'Confession', icon: '✦', max: 8 
}
,
  mystery: {
 label: 'Mystery', icon: '✧', max: 8 
}

}
;

function safeText(value, fallback = '') {

  return String(value || fallback).replace(/[<>]/g, '').trim().slice(0, 80);

}

function keyFor(space, code) {
 return `${
space
}
:${
code
}
`;
 
}

function shuffle(arr) {
 return arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
 
}

function getRoom(socket) {
 const key = socket.data.roomKey;
 return key ? rooms.get(key) : null;
 
}

function isHost(socket, room) {
 return !!room && room.hostId === socket.id;
 
}

function playerGameList(room) {

  return Array.from(room.players.values()).map(p => {

    const gp = room.game?.players?.[p.id] || {

}
;

    return {

      id: p.id, username: p.username, alive: gp.alive !== false,
      role: gp.role || null, revealedRole: !!gp.revealedRole, vote: gp.vote || null
    
}
;

  
}
);

}

function publicGame(room, forId = null) {

  if (!room.game) return null;

  const self = forId ? room.game.players[forId] : null;

  return {

    type: room.space,
    started: !!room.game.started,
    phase: room.game.phase || 'lobby',
    day: room.game.day || 0,
    timer: room.game.timer || 0,
    settings: room.game.settings,
    players: playerGameList(room).map(p => ({
 ...p, role: p.revealedRole ? p.role : null 
}
)),
    role: self?.role || null,
    alive: self?.alive !== false,
    winners: room.game.winners || null,
    log: room.game.log.slice(-20),
    debate: room.game.debate || null
  
}
;

}

function publicRoom(room) {

  return {

    id: room.id, code: room.code, space: room.space,
    label: spaces[room.space]?.label || room.space,
    hostId: room.hostId,
    hostName: room.players.get(room.hostId)?.username || 'Host',
    players: Array.from(room.players.values()).map(p => ({

      id: p.id, username: p.username, isHost: p.id === room.hostId,
      mic: !!p.mic, cam: !!p.cam, speaking: !!p.speaking
    
}
)),
    playerCount: room.players.size,
    max: spaces[room.space]?.max || 8,
    status: room.status || 'Waiting',
    game: publicGame(room)
  
}
;

}

function broadcastRooms() {
 io.emit('rooms:update', Array.from(rooms.values()).map(publicRoom));
 
}

function emitRoomState(room) {

  for (const id of room.players.keys()) {

    io.to(id).emit('room:update', {
 ...publicRoom(room), game: publicGame(room, id) 
}
);

  
}

  broadcastRooms();

}

function clearRoomTimer(room) {

  const t = timers.get(room.id);

  if (t) clearInterval(t);

  timers.delete(room.id);

}

function addLog(room, text) {

  if (!room.game) return;

  room.game.log.push({
 time: Date.now(), text 
}
);

  room.game.log = room.game.log.slice(-50);

}

function defaultGame(space) {

  if (space === 'mafia') {

    return {

      started: false, phase: 'lobby', day: 0, timer: 0, winners: null,
      settings: {
 daySeconds: 90, nightSeconds: 45, voteSeconds: 45, mafiaCount: 1, doctor: true, sheriff: true, revealRoles: true 
}
,
      players: {

}
, night: {
 mafiaTarget: null, doctorSave: null, sheriffChecks: {

}
 
}
, votes: {

}
, log: []
    
}
;

  
}

  if (space === 'debate') {

    return {
 started: false, phase: 'lobby', timer: 0, settings: {
 roundSeconds: 120 
}
, players: {

}
, log: [], debate: {
 activeSpeaker: null, queue: [] 
}
 
}
;

  
}

  return {
 started: false, phase: 'lobby', timer: 0, settings: {

}
, players: {

}
, log: [] 
}
;

}

function ensureGamePlayers(room) {

  if (!room.game) room.game = defaultGame(room.space);

  for (const p of room.players.values()) {

    if (!room.game.players[p.id]) room.game.players[p.id] = {
 id: p.id, username: p.username, alive: true, role: null, vote: null, nightAction: null, revealedRole: false 
}
;

    room.game.players[p.id].username = p.username;

  
}

  for (const id of Object.keys(room.game.players)) if (!room.players.has(id)) delete room.game.players[id];

}

function assignMafiaRoles(room) {

  ensureGamePlayers(room);

  const ids = Array.from(room.players.keys());

  const settings = room.game.settings;

  const roles = [];

  const mafiaCount = Math.max(1, Math.min(settings.mafiaCount || 1, Math.floor(ids.length / 2)));

  for (let i=0;
i<mafiaCount;
i++) roles.push(i === 0 ? 'Don' : 'Mafia');

  if (settings.doctor && roles.length < ids.length) roles.push('Doctor');

  if (settings.sheriff && roles.length < ids.length) roles.push('Sheriff');

  while (roles.length < ids.length) roles.push('Citizen');

  const mixedRoles = shuffle(roles).slice(0, ids.length);

  ids.forEach((id, i) => {

    room.game.players[id] = {
 ...room.game.players[id], alive: true, role: mixedRoles[i], vote: null, nightAction: null, revealedRole: false 
}
;

    io.to(id).emit('mafia:role', {
 role: mixedRoles[i] 
}
);

  
}
);

}

function checkMafiaWin(room) {

  const alive = Object.values(room.game.players).filter(p => p.alive !== false);

  const mafia = alive.filter(p => ['Mafia','Don'].includes(p.role)).length;

  const town = alive.length - mafia;

  if (mafia <= 0) return 'Citizens';

  if (mafia >= town) return 'Mafia';

  return null;

}

function startPhaseTimer(room, seconds, onEnd) {

  clearRoomTimer(room);

  room.game.timer = seconds;

  emitRoomState(room);

  const int = setInterval(() => {

    if (!rooms.has(room.id)) return clearRoomTimer(room);

    room.game.timer -= 1;

    if (room.game.timer <= 0) {
 clearRoomTimer(room);
 onEnd();
 return;
 
}

    emitRoomState(room);

  
}
, 1000);

  timers.set(room.id, int);

}

function startMafiaNight(room) {

  room.game.phase = 'night';
 room.game.day += 1;

  room.game.night = {
 mafiaTarget: null, doctorSave: null, sheriffChecks: {

}
 
}
;

  Object.values(room.game.players).forEach(p => {
 p.vote = null;
 p.nightAction = null;
 
}
);

  addLog(room, `Night ${
room.game.day
}
 started.`);

  startPhaseTimer(room, room.game.settings.nightSeconds || 45, () => resolveMafiaNight(room));

}

function resolveMafiaNight(room) {

  const target = room.game.night.mafiaTarget;

  const save = room.game.night.doctorSave;

  if (target && target !== save && room.game.players[target]) {

    room.game.players[target].alive = false;

    room.game.players[target].revealedRole = !!room.game.settings.revealRoles;

    addLog(room, `${
room.game.players[target].username
}
 was eliminated during the night.`);

  
}
 else if (target && target === save) {

    addLog(room, 'Doctor saved the night target. Nobody died.');

  
}
 else addLog(room, 'Nobody died during the night.');

  const win = checkMafiaWin(room);

  if (win) return endMafia(room, win);

  startMafiaDay(room);

}

function startMafiaDay(room) {

  room.game.phase = 'day';

  room.game.votes = {

}
;

  Object.values(room.game.players).forEach(p => p.vote = null);

  addLog(room, `Day ${
room.game.day
}
 discussion started.`);

  startPhaseTimer(room, room.game.settings.daySeconds || 90, () => startMafiaVoting(room));

}

function startMafiaVoting(room) {

  room.game.phase = 'voting';
 room.game.votes = {

}
;

  addLog(room, 'Voting started.');

  startPhaseTimer(room, room.game.settings.voteSeconds || 45, () => resolveMafiaVoting(room));

}

function resolveMafiaVoting(room) {

  const counts = {

}
;

  Object.values(room.game.players).forEach(p => {
 if (p.alive !== false && p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
 
}
);

  let top = null, topCount = 0, tie = false;

  for (const [id, count] of Object.entries(counts)) {

    if (count > topCount) {
 top = id;
 topCount = count;
 tie = false;
 
}

    else if (count === topCount) tie = true;

  
}

  if (top && !tie && room.game.players[top]) {

    room.game.players[top].alive = false;

    room.game.players[top].revealedRole = !!room.game.settings.revealRoles;

    addLog(room, `${
room.game.players[top].username
}
 was voted out.`);

  
}
 else addLog(room, 'Vote ended with no elimination.');

  const win = checkMafiaWin(room);

  if (win) return endMafia(room, win);

  startMafiaNight(room);

}

function endMafia(room, winners) {

  clearRoomTimer(room);

  room.game.phase = 'ended';
 room.game.winners = winners;
 room.status = 'Ended';

  Object.values(room.game.players).forEach(p => p.revealedRole = true);

  addLog(room, `${
winners
}
 win.`);

  emitRoomState(room);

}

function removeFromCurrentRoom(socket) {

  const key = socket.data.roomKey;

  if (!key || !rooms.has(key)) return;

  const room = rooms.get(key);
 const wasHost = room.hostId === socket.id;

  socket.leave(key);
 room.players.delete(socket.id);

  if (room.game?.players?.[socket.id]) delete room.game.players[socket.id];

  socket.to(key).emit('peer:left', {
 id: socket.id 
}
);

  socket.data.roomKey = null;

  if (wasHost) {

    clearRoomTimer(room);

    io.to(key).emit('room:closed', {
 reason: 'Host left. Room was deleted.' 
}
);

    for (const p of room.players.values()) {
 const s = io.sockets.sockets.get(p.id);
 if (s) {
 s.leave(key);
 s.data.roomKey = null;
 
}
 
}

    rooms.delete(key);
 broadcastRooms();
 return;

  
}

  emitRoomState(room);

}

io.on('connection', socket => {

  socket.emit('rooms:update', Array.from(rooms.values()).map(publicRoom));

  socket.on('room:create', ({
 username, space, code 
}
) => {

    username = safeText(username, 'Guest');
 space = spaces[space] ? space : 'mafia';
 code = safeText(code || Math.floor(100000+Math.random()*900000), 'VOID');

    removeFromCurrentRoom(socket);

    const key = keyFor(space, code);
 if (rooms.has(key)) return socket.emit('notice', {
 type:'error', text:'Room already exists.' 
}
);

    const room = {
 id:key, code, space, hostId:socket.id, status:'Waiting', players:new Map(), game: defaultGame(space) 
}
;

    room.players.set(socket.id, {
 id:socket.id, username, mic:false, cam:false, speaking:false 
}
);
 ensureGamePlayers(room);

    rooms.set(key, room);
 socket.join(key);
 socket.data.roomKey = key;

    socket.emit('room:joined', {
 room:{
...publicRoom(room), game:publicGame(room, socket.id)
}
, selfId:socket.id, existingPeers:[] 
}
);

    emitRoomState(room);

  
}
);

  socket.on('room:join', ({
 username, space, code 
}
) => {

    username = safeText(username, 'Guest');
 space = spaces[space] ? space : 'mafia';
 code = safeText(code, '');

    const key = keyFor(space, code);
 const room = rooms.get(key);

    if (!room) return socket.emit('notice', {
 type:'error', text:'Room not found.' 
}
);

    if (room.players.size >= (spaces[space]?.max || 8)) return socket.emit('notice', {
 type:'error', text:'Room is full.' 
}
);

    removeFromCurrentRoom(socket);

    const existingPeers = Array.from(room.players.values()).map(p => ({
 id:p.id, username:p.username 
}
));

    room.players.set(socket.id, {
 id:socket.id, username, mic:false, cam:false, speaking:false 
}
);
 ensureGamePlayers(room);

    socket.join(key);
 socket.data.roomKey = key;

    socket.emit('room:joined', {
 room:{
...publicRoom(room), game:publicGame(room, socket.id)
}
, selfId:socket.id, existingPeers 
}
);

    socket.to(key).emit('peer:joined', {
 id:socket.id, username 
}
);
 emitRoomState(room);

  
}
);

  socket.on('room:leave', () => removeFromCurrentRoom(socket));

  socket.on('room:start', () => {
 const room=getRoom(socket);
 if(!isHost(socket,room)) return;
 if(room.space==='mafia'){
 assignMafiaRoles(room);
 room.game.started=true;
 room.status='In Game';
 startMafiaNight(room);
 
}
 else if(room.space==='debate'){
 room.game.started=true;
 room.status='Live Debate';
 room.game.phase='debate';
 room.game.debate.queue=Array.from(room.players.keys());
 room.game.debate.activeSpeaker=room.game.debate.queue[0]||null;
 addLog(room,'Debate started.');
 startPhaseTimer(room, room.game.settings.roundSeconds||120, ()=>{
room.game.phase='ended';
 emitRoomState(room);

}
);
 
}
 else {
 room.status='In Room';
 room.game.started=true;
 emitRoomState(room);
 
}
 
}
);

  socket.on('game:settings', settings => {
 const room=getRoom(socket);
 if(!isHost(socket,room)||!room.game||room.game.started) return;
 room.game.settings={
...room.game.settings,...settings
}
;
 emitRoomState(room);
 
}
);

  socket.on('mafia:action', ({
 action, target 
}
) => {
 const room=getRoom(socket);
 if(!room||room.space!=='mafia'||!room.game.started) return;
 const me=room.game.players[socket.id];
 if(!me||me.alive===false) return;
 target=safeText(target,'');
 if(room.game.phase==='night'){
 if(['Mafia','Don'].includes(me.role)&&action==='kill') room.game.night.mafiaTarget=target;
 if(me.role==='Doctor'&&action==='save') room.game.night.doctorSave=target;
 if(me.role==='Sheriff'&&action==='check') {
 const checked=room.game.players[target];
 io.to(socket.id).emit('notice',{
type:'ok',text: checked && ['Mafia','Don'].includes(checked.role) ? 'Result: suspicious.' : 'Result: not suspicious.'
}
);
 room.game.night.sheriffChecks[socket.id]=target;
 
}
 
}
 if(room.game.phase==='voting'&&action==='vote'){
 me.vote=target;
 room.game.votes[socket.id]=target;
 
}
 emitRoomState(room);
 
}
);

  socket.on('game:nextPhase', () => {
 const room=getRoom(socket);
 if(!isHost(socket,room)||room.space!=='mafia') return;
 clearRoomTimer(room);
 if(room.game.phase==='night') resolveMafiaNight(room);
 else if(room.game.phase==='day') startMafiaVoting(room);
 else if(room.game.phase==='voting') resolveMafiaVoting(room);
 
}
);

  socket.on('game:reset', () => {
 const room=getRoom(socket);
 if(!isHost(socket,room)) return;
 clearRoomTimer(room);
 room.game=defaultGame(room.space);
 room.status='Waiting';
 ensureGamePlayers(room);
 emitRoomState(room);
 
}
);

  socket.on('debate:next', () => {
 const room=getRoom(socket);
 if(!isHost(socket,room)||room.space!=='debate') return;
 const q=room.game.debate.queue;
 if(q.length){
 q.push(q.shift());
 room.game.debate.activeSpeaker=q[0];
 addLog(room,'Next speaker.');
 
}
 emitRoomState(room);
 
}
);

  socket.on('chat:message', text => {
 const room=getRoom(socket);
 if(!room) return;
 const p=room.players.get(socket.id);
 const message=safeText(text,'').slice(0,220);
 if(!p||!message) return;
 io.to(room.id).emit('chat:message',{
id:Date.now()+Math.random(),userId:socket.id,username:p.username,text:message,time:new Date().toISOString()
}
);
 
}
);

  socket.on('media:state', state => {
 const room=getRoom(socket);
 if(!room) return;
 const p=room.players.get(socket.id);
 if(!p) return;
 p.mic=!!state.mic;
 p.cam=!!state.cam;
 p.speaking=!!state.speaking;
 io.to(room.id).emit('media:state',{
id:socket.id,mic:p.mic,cam:p.cam,speaking:p.speaking
}
);
 emitRoomState(room);
 
}
);

  socket.on('webrtc:offer', ({
to,offer
}
) => io.to(to).emit('webrtc:offer',{
from:socket.id,offer
}
));

  socket.on('webrtc:answer', ({
to,answer
}
) => io.to(to).emit('webrtc:answer',{
from:socket.id,answer
}
));

  socket.on('webrtc:ice', ({
to,candidate
}
) => io.to(to).emit('webrtc:ice',{
from:socket.id,candidate
}
));

  socket.on('disconnect', () => {
 removeFromCurrentRoom(socket);
 broadcastRooms();
 
}
);

}
);

const html = `<!DOCTYPE html><html lang="ka"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>VOID PORTAL</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;
600;
700;
800;
900&family=Orbitron:wght@700;
900&display=swap" rel="stylesheet"><style>
:root{
--bg:#060713;
--panel:rgba(10,14,33,.78);
--line:rgba(135,158,255,.18);
--text:#f7f7ff;
--muted:#aeb6d7;
--dim:#727a9c;
--cyan:#5df7ff;
--pink:#ff62dd;
--green:#39ff9d;
--red:#ff5c8a;
--safe:env(safe-area-inset-bottom);
--nav:78px
}
*{
box-sizing:border-box;
-webkit-tap-highlight-color:transparent
}
html,body{
margin:0;
min-height:100%;
font-family:Inter,system-ui,sans-serif;
background:var(--bg);
color:var(--text)
}
body{
min-height:100dvh;
overflow-x:hidden;
background:radial-gradient(circle at 10% -10%,rgba(255,98,221,.22),transparent 34%),radial-gradient(circle at 90% 10%,rgba(93,247,255,.18),transparent 38%),radial-gradient(circle at 50% 120%,rgba(141,108,255,.2),transparent 42%),#060713
}
body:before{
content:"";
position:fixed;
inset:0;
z-index:0;
pointer-events:none;
background:repeating-linear-gradient(115deg,rgba(93,247,255,.06) 0 1px,transparent 1px 38px),repeating-linear-gradient(65deg,rgba(255,98,221,.05) 0 1px,transparent 1px 44px);
opacity:.6
}
.hide{
display:none!important
}
button,input,select{
font:inherit
}
button{
border:none
}
.app{
position:relative;
z-index:1;
min-height:100dvh;
padding:12px 12px calc(var(--nav) + 24px + var(--safe))
}
.home-view,.room-view{
max-width:760px;
margin:0 auto
}
.hero,.panel,.room-head,.video-wrap,.game-panel,.sheet{
border:1px solid var(--line);
background:linear-gradient(180deg,rgba(14,18,40,.82),rgba(6,8,22,.86));
border-radius:26px;
box-shadow:0 18px 50px rgba(0,0,0,.32),inset 0 1px rgba(255,255,255,.05)
}
.hero{
padding:18px;
margin-bottom:12px;
overflow:hidden
}
.hero-row{
display:flex;
justify-content:space-between;
gap:10px;
align-items:center;
flex-wrap:wrap
}
.eyebrow{
font-size:10px;
letter-spacing:.34em;
color:var(--cyan);
font-weight:900
}
.powered{
font-size:11px;
color:#ffd8f8;
border:1px solid rgba(255,98,221,.32);
background:rgba(255,98,221,.09);
border-radius:999px;
padding:7px 10px
}
h1{
margin:10px 0 6px;
font-family:Orbitron,sans-serif;
font-size:clamp(38px,12vw,72px);
line-height:.92;
letter-spacing:-.05em
}
.subtitle{
margin:0;
color:var(--muted);
font-size:15px
}
.stats{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:8px;
margin:12px 0
}
.stat{
text-align:center;
border:1px solid var(--line);
background:rgba(10,14,33,.62);
border-radius:18px;
padding:10px 8px
}
.stat strong{
display:block;
font-size:19px
}
.stat span{
font-size:10px;
letter-spacing:.12em;
text-transform:uppercase;
color:var(--dim);
font-weight:900
}
.panel{
padding:14px
}
.profile-row{
display:grid;
grid-template-columns:1fr 128px;
gap:10px;
margin-bottom:12px
}
.input,.select{
width:100%;
border:1px solid rgba(135,158,255,.18);
background:rgba(4,7,18,.78);
color:white;
border-radius:18px;
padding:15px;
outline:none;
min-width:0
}
.btn{
border:1px solid rgba(255,255,255,.08);
background:rgba(255,255,255,.055);
color:white;
border-radius:18px;
padding:15px 14px;
font-weight:900;
cursor:pointer
}
.btn.primary{
color:#03101d;
background:linear-gradient(90deg,var(--cyan),#d4ffff 46%,var(--pink));
box-shadow:0 10px 30px rgba(93,247,255,.14),0 0 24px rgba(255,98,221,.14)
}
.btn.danger{
border-color:rgba(255,92,138,.35);
color:#ffd3df
}
.btn.tiny{
padding:9px 12px;
border-radius:13px;
font-size:12px
}
.create-row{
display:grid;
grid-template-columns:1fr 1fr;
gap:10px;
margin-bottom:12px
}
.section-title{
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
margin:12px 2px 10px
}
.section-title h2{
margin:0;
font-size:15px;
letter-spacing:.16em;
text-transform:uppercase
}
.section-title small{
color:var(--dim);
font-weight:800
}
.rooms{
display:flex;
flex-direction:column;
gap:10px
}
.room-card{
display:grid;
grid-template-columns:1fr auto;
gap:12px;
align-items:center;
border:1px solid rgba(135,158,255,.16);
background:rgba(8,11,27,.72);
border-radius:22px;
padding:13px
}
.room-name{
display:flex;
gap:8px;
font-weight:900;
font-size:17px
}
.room-meta{
margin-top:5px;
color:var(--muted);
font-size:13px;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis
}
.badges{
display:flex;
gap:6px;
flex-wrap:wrap;
margin-top:8px
}
.badge{
font-size:10px;
text-transform:uppercase;
letter-spacing:.1em;
font-weight:900;
color:#cfd6ff;
border:1px solid rgba(255,255,255,.08);
background:rgba(255,255,255,.05);
border-radius:999px;
padding:5px 8px
}
.badge.live{
color:#b8ffd9;
border-color:rgba(57,255,157,.25);
background:rgba(57,255,157,.08)
}
.empty{
border:1px dashed rgba(135,158,255,.18);
border-radius:22px;
padding:26px 16px;
text-align:center;
color:var(--muted);
background:rgba(6,8,22,.45)
}
.bottom-nav{
position:fixed;
z-index:25;
left:12px;
right:12px;
bottom:calc(10px + var(--safe));
height:var(--nav);
display:grid;
grid-template-columns:repeat(5,1fr);
gap:6px;
padding:9px;
border:1px solid rgba(135,158,255,.2);
border-radius:26px;
background:rgba(6,8,22,.86);
backdrop-filter:blur(18px)
}
.bottom-nav.room-mode{
display:none!important
}
.nav-item{
display:flex;
flex-direction:column;
align-items:center;
justify-content:center;
gap:5px;
border-radius:20px;
background:transparent;
color:#aeb6d7;
font-size:11px;
font-weight:900
}
.nav-item i{
font-style:normal;
font-size:22px
}
.nav-item.active{
color:white;
border:1px solid rgba(93,247,255,.28);
background:rgba(93,247,255,.08)
}
.more-pop{
position:fixed;
right:16px;
bottom:calc(var(--nav) + 18px + var(--safe));
z-index:30;
min-width:190px;
border:1px solid var(--line);
border-radius:22px;
background:rgba(8,10,24,.96);
padding:8px
}
.more-pop .nav-item{
height:52px;
flex-direction:row;
justify-content:flex-start;
padding:0 12px;
font-size:13px
}
.room-view{
min-height:100dvh;
display:flex;
flex-direction:column;
gap:10px;
padding-bottom:96px
}
.room-head{
padding:11px 12px;
display:grid;
grid-template-columns:1fr auto;
gap:10px;
align-items:center
}
.room-title .top{
display:flex;
gap:7px;
font-size:11px;
text-transform:uppercase;
letter-spacing:.18em;
color:var(--cyan);
font-weight:900
}
.room-title h2{
margin:3px 0 0;
font-size:18px
}
.head-actions{
display:flex;
gap:7px
}
.video-wrap{
padding:8px;
overflow:hidden
}
.video-grid{
height:calc(100dvh - 245px - var(--safe));
min-height:380px;
display:grid;
grid-template-columns:repeat(2,1fr);
grid-template-rows:repeat(4,1fr);
gap:8px;
overflow:hidden
}
.video-grid.debate{
grid-template-rows:1.6fr 1fr 1fr 1fr
}
.video-grid.debate .tile:first-child{
grid-column:1/3
}
.tile{
position:relative;
overflow:hidden;
border-radius:18px;
background:radial-gradient(circle at 50% 42%,rgba(93,247,255,.09),transparent 28%),rgba(3,6,16,.92);
border:1px solid rgba(135,158,255,.14);
min-height:0
}
.tile video{
width:100%;
height:100%;
object-fit:cover;
display:block;
background:#030610
}
.tile.self video{
transform:scaleX(-1)
}
.placeholder{
position:absolute;
inset:0;
display:flex;
align-items:center;
justify-content:center;
text-align:center;
color:#aeb6d7;
font-size:12px
}
.tile-bar{
position:absolute;
left:7px;
right:7px;
bottom:7px;
height:38px;
border-radius:15px;
padding:0 7px 0 10px;
display:flex;
align-items:center;
justify-content:space-between;
gap:6px;
background:rgba(0,0,0,.62);
backdrop-filter:blur(10px);
border:1px solid rgba(255,255,255,.08)
}
.tile-name{
font-weight:900;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
font-size:13px
}
.tile-icons{
display:flex;
gap:5px
}
.ico{
width:28px;
height:28px;
border-radius:999px;
display:grid;
place-items:center;
background:rgba(255,255,255,.08);
border:1px solid rgba(255,255,255,.08);
font-size:13px
}
.ico.speaking{
background:rgba(57,255,157,.18);
border-color:rgba(57,255,157,.52);
box-shadow:0 0 18px rgba(57,255,157,.45);
animation:pulse 1.05s infinite
}
@keyframes pulse{
50%{
transform:scale(1.1)
}

}
.control-dock{
position:fixed;
left:12px;
right:12px;
bottom:calc(10px + var(--safe));
z-index:22;
max-width:740px;
margin:0 auto;
display:grid;
grid-template-columns:repeat(5,1fr);
gap:7px;
padding:8px;
border:1px solid rgba(135,158,255,.18);
border-radius:24px;
background:rgba(6,8,22,.86);
backdrop-filter:blur(18px)
}
.ctrl{
position:relative;
min-height:54px;
border-radius:18px;
background:rgba(255,255,255,.055);
color:#e8ecff;
font-weight:900;
font-size:10px;
display:flex;
flex-direction:column;
gap:3px;
align-items:center;
justify-content:center
}
.ctrl b{
font-size:19px
}
.ctrl.on{
border:1px solid rgba(57,255,157,.32);
background:rgba(57,255,157,.09)
}
.unread{
position:absolute;
right:9px;
top:7px;
min-width:18px;
height:18px;
padding:0 5px;
border-radius:999px;
background:var(--pink);
color:white;
font-size:11px;
display:grid;
place-items:center;
border:1px solid rgba(255,255,255,.24)
}
.game-panel{
padding:12px;
margin-top:2px
}
.game-row{
display:grid;
grid-template-columns:1fr 1fr;
gap:8px;
margin:8px 0
}
.game-log{
max-height:110px;
overflow:auto;
color:var(--muted);
font-size:12px;
border:1px solid rgba(255,255,255,.06);
border-radius:16px;
padding:9px;
background:rgba(0,0,0,.18)
}
.role-card{
border:1px solid rgba(93,247,255,.22);
background:rgba(93,247,255,.08);
border-radius:16px;
padding:10px;
margin-bottom:8px
}
.sheet-backdrop{
position:fixed;
inset:0;
z-index:35;
background:rgba(0,0,0,.42);
backdrop-filter:blur(4px)
}
.sheet{
position:fixed;
z-index:36;
left:10px;
right:10px;
bottom:calc(8px + var(--safe));
max-width:740px;
margin:0 auto;
padding:14px;
max-height:72dvh;
display:flex;
flex-direction:column
}
.sheet-head{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:10px
}
.sheet-head h3{
margin:0;
font-size:15px;
letter-spacing:.16em;
text-transform:uppercase;
display:flex;
gap:10px;
align-items:center
}
.chatIcon{
width:28px;
height:28px;
border-radius:10px;
background:linear-gradient(135deg,var(--cyan),var(--pink));
display:inline-grid;
place-items:center;
color:#06101d;
box-shadow:0 0 24px rgba(93,247,255,.28)
}
.chatIcon svg{
width:18px;
height:18px
}
.close{
width:38px;
height:38px;
border-radius:50%;
background:rgba(255,255,255,.06);
color:white
}
.chat-log{
height:330px;
overflow:auto;
border:1px solid rgba(255,255,255,.07);
border-radius:20px;
padding:10px;
background:rgba(0,0,0,.2);
display:flex;
flex-direction:column;
gap:8px
}
.msg{
align-self:flex-start;
max-width:86%;
padding:10px 11px;
border-radius:18px;
background:rgba(255,255,255,.07);
border:1px solid rgba(255,255,255,.06)
}
.msg.me{
align-self:flex-end;
background:linear-gradient(135deg,rgba(93,247,255,.12),rgba(255,98,221,.12));
border-color:rgba(93,247,255,.18)
}
.msg.system{
align-self:center;
text-align:center;
color:#cfd6ff;
background:rgba(255,255,255,.045)
}
.msg strong{
display:block;
font-size:11px;
color:var(--cyan);
margin-bottom:3px
}
.chat-send{
display:grid;
grid-template-columns:1fr 92px;
gap:8px;
margin-top:10px
}
.players-list{
display:flex;
flex-direction:column;
gap:8px;
overflow:auto;
max-height:55dvh
}
.player-row{
display:grid;
grid-template-columns:1fr auto;
gap:8px;
align-items:center;
border:1px solid rgba(255,255,255,.07);
background:rgba(255,255,255,.04);
border-radius:17px;
padding:12px
}
.notice{
position:fixed;
z-index:60;
left:18px;
right:18px;
top:calc(10px + env(safe-area-inset-top));
max-width:720px;
margin:0 auto;
border-radius:18px;
padding:12px 14px;
background:rgba(8,10,24,.96);
border:1px solid rgba(93,247,255,.28);
font-weight:800
}
@media(max-width:420px){
.app{
padding-left:8px;
padding-right:8px
}
.profile-row,.create-row,.game-row{
grid-template-columns:1fr
}
.video-grid{
gap:6px;
height:calc(100dvh - 238px - var(--safe));
min-height:360px
}
.tile{
border-radius:15px
}
.bottom-nav,.control-dock{
left:8px;
right:8px
}
.ctrl{
min-height:50px;
font-size:9px
}

}

</style></head><body><div id="notice" class="notice hide"></div><div class="app"><main id="homeView" class="home-view"><section class="hero"><div class="hero-row"><span class="eyebrow">PRIVATE SOCIAL GAME HUB</span><span class="powered">powered by ბატონი მაქსი</span></div><h1>VOID PORTAL</h1><p class="subtitle">აირჩიე სივრცე, ნახე აქტიური ოთახები და შედი ცალკე მაგიდაზე.</p></section><section class="stats"><div class="stat"><strong id="activeRooms">0</strong><span>Rooms</span></div><div class="stat"><strong id="onlinePlayers">0</strong><span>Players</span></div><div class="stat"><strong id="currentModeShort">Mafia</strong><span>Mode</span></div></section><section class="panel"><div class="profile-row"><input id="username" class="input" placeholder="Username" maxlength="24" value="max"/><input id="roomCode" class="input" placeholder="Room code" maxlength="12"/></div><div class="create-row"><button id="randomCodeBtn" class="btn">Random Code</button><button id="createBtn" class="btn primary">Create Mafia Room</button></div><div class="section-title"><h2 id="roomsTitle">Mafia Rooms</h2><small id="roomsCount">0 active</small></div><div id="roomsList" class="rooms"></div></section></main><main id="roomView" class="room-view hide"><section class="room-head"><div class="room-title"><div class="top"><span id="roomModeIcon">♛</span><span id="roomMode">Mafia</span><span>•</span><span id="roomPlayersCount">1/8</span></div><h2 id="roomName">Room #VOID</h2></div><div class="head-actions"><button id="startBtn" class="btn tiny primary">Start</button><button id="topLeaveBtn" class="btn tiny danger">Leave</button></div></section><section id="gamePanel" class="game-panel hide"></section><section class="video-wrap"><div id="videoGrid" class="video-grid"></div></section></main></div><nav class="bottom-nav" id="bottomNav"><button class="nav-item active" data-space="mafia"><i>♛</i><span>Mafia</span></button><button class="nav-item" data-space="truth"><i>◆</i><span>Truth</span></button><button class="nav-item" data-space="debate"><i>◇</i><span>Debate</span></button><button class="nav-item" data-space="lounge"><i>◌</i><span>Lounge</span></button><button class="nav-item" id="moreBtn"><i>＋</i><span>More</span></button></nav><div id="morePop" class="more-pop hide"><button class="nav-item" data-space="confession"><i>✦</i><span>Confession</span></button><button class="nav-item" data-space="mystery"><i>✧</i><span>Mystery</span></button></div><div id="controlDock" class="control-dock hide"><button id="micBtn" class="ctrl"><b>🎙</b><span>Mic</span></button><button id="camBtn" class="ctrl"><b>▣</b><span>Cam</span></button><button id="switchBtn" class="ctrl"><b>⇄</b><span>Switch</span></button><button id="chatBtn" class="ctrl"><b>💬</b><span>Chat</span><em id="unreadBadge" class="unread hide">0</em></button><button id="playersBtn" class="ctrl"><b>☷</b><span>Players</span></button></div><div id="sheetBackdrop" class="sheet-backdrop hide"></div><section id="chatSheet" class="sheet hide"><div class="sheet-head"><h3><span class="chatIcon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 6.5C5 4.57 6.57 3 8.5 3h7C17.43 3 19 4.57 19 6.5v4C19 12.43 17.43 14 15.5 14H11l-4.4 4.1c-.63.58-1.6.14-1.6-.72V6.5Z" fill="currentColor"/><path d="M8 7h8M8 10h6" stroke="#06101d" stroke-width="1.4" stroke-linecap="round"/></svg></span>Chat</h3><button class="close" data-close-sheet>×</button></div><div id="chatLog" class="chat-log"></div><div class="chat-send"><input id="chatInput" class="input" placeholder="Message..." maxlength="220"/><button id="sendBtn" class="btn primary">Send</button></div></section><section id="playersSheet" class="sheet hide"><div class="sheet-head"><h3>☷ Players</h3><button class="close" data-close-sheet>×</button></div><div id="playersList" class="players-list"></div></section><script src="/socket.io/socket.io.js"></script><script>
const socket=io();
const spaces={
mafia:{
label:'Mafia',icon:'♛',create:'Create Mafia Room'
}
,truth:{
label:'Truth or Dare',icon:'◆',create:'Create Truth Room'
}
,debate:{
label:'Debate Arena',icon:'◇',create:'Create Debate Room'
}
,lounge:{
label:'Void Lounge',icon:'◌',create:'Create Lounge Room'
}
,confession:{
label:'Confession',icon:'✦',create:'Create Confession Room'
}
,mystery:{
label:'Mystery Room',icon:'✧',create:'Create Mystery Room'
}

}
;
let selectedSpace='mafia',allRooms=[],currentRoom=null,selfId=null,localStream=null,currentFacingMode='user',mediaState={
mic:false,cam:false,speaking:false
}
,peers=new Map(),remoteStreams=new Map(),unread=0,audioCtx=null,analyser=null,speakingTimer=null;
const $=id=>document.getElementById(id);
const els={
homeView:$('homeView'),roomView:$('roomView'),bottomNav:$('bottomNav'),username:$('username'),roomCode:$('roomCode'),createBtn:$('createBtn'),randomCodeBtn:$('randomCodeBtn'),roomsList:$('roomsList'),roomsTitle:$('roomsTitle'),roomsCount:$('roomsCount'),activeRooms:$('activeRooms'),onlinePlayers:$('onlinePlayers'),currentModeShort:$('currentModeShort'),moreBtn:$('moreBtn'),morePop:$('morePop'),notice:$('notice'),roomModeIcon:$('roomModeIcon'),roomMode:$('roomMode'),roomPlayersCount:$('roomPlayersCount'),roomName:$('roomName'),videoGrid:$('videoGrid'),controlDock:$('controlDock'),micBtn:$('micBtn'),camBtn:$('camBtn'),switchBtn:$('switchBtn'),chatBtn:$('chatBtn'),playersBtn:$('playersBtn'),unreadBadge:$('unreadBadge'),startBtn:$('startBtn'),topLeaveBtn:$('topLeaveBtn'),gamePanel:$('gamePanel'),chatSheet:$('chatSheet'),playersSheet:$('playersSheet'),sheetBackdrop:$('sheetBackdrop'),chatLog:$('chatLog'),chatInput:$('chatInput'),sendBtn:$('sendBtn'),playersList:$('playersList')
}
;
function showNotice(t,ms=2300){
els.notice.textContent=t;
els.notice.classList.remove('hide');
clearTimeout(showNotice.t);
showNotice.t=setTimeout(()=>els.notice.classList.add('hide'),ms)
}
function randomCode(){
return String(Math.floor(100000+Math.random()*900000))
}
function getUsername(){
return(els.username.value||'Guest').trim().slice(0,24)
}
function getCode(){
let c=(els.roomCode.value||'').trim();
if(!c){
c=randomCode();
els.roomCode.value=c
}
return c
}
function playChatSound(){
try{
const C=window.AudioContext||window.webkitAudioContext;
const ctx=new C();
const o=ctx.createOscillator();
const g=ctx.createGain();
o.type='sine';
o.frequency.value=760;
g.gain.setValueAtTime(.0001,ctx.currentTime);
g.gain.exponentialRampToValueAtTime(.08,ctx.currentTime+.02);
g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.16);
o.connect(g);
g.connect(ctx.destination);
o.start();
o.stop(ctx.currentTime+.18)
}
catch(e){

}

}
function setSpace(space){
selectedSpace=space;
document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.space===space));
els.morePop.classList.add('hide');
const s=spaces[space];
els.currentModeShort.textContent=s.label.split(' ')[0];
els.createBtn.textContent=s.create;
els.roomsTitle.textContent=s.label+' Rooms';
renderRooms()
}
function renderRooms(){
const f=allRooms.filter(r=>r.space===selectedSpace);
els.activeRooms.textContent=allRooms.length;
els.onlinePlayers.textContent=allRooms.reduce((n,r)=>n+(r.playerCount||0),0);
els.roomsCount.textContent=f.length+' active';
els.roomsList.innerHTML='';
if(!f.length){
els.roomsList.innerHTML='<div class="empty">ამ სივრცეში ჯერ ოთახი არ არის.<br>შექმენი პირველი მაგიდა.</div>';
return
}
f.forEach(room=>{
const d=document.createElement('div');
d.className='room-card';
d.innerHTML='<div><div class="room-name"><span>'+(spaces[room.space]?.icon||'◌')+'</span><span>#'+room.code+'</span></div><div class="room-meta">Host: '+room.hostName+' • '+room.playerCount+'/'+room.max+' players</div><div class="badges"><span class="badge live">'+room.status+'</span><span class="badge">'+room.label+'</span></div></div><button class="btn tiny primary">Join</button>';
d.querySelector('button').onclick=()=>{
els.roomCode.value=room.code;
socket.emit('room:join',{
username:getUsername(),space:room.space,code:room.code
}
)
}
;
els.roomsList.appendChild(d)
}
)
}
function goRoom(room){
currentRoom=room;
els.homeView.classList.add('hide');
els.roomView.classList.remove('hide');
els.controlDock.classList.remove('hide');
els.bottomNav.classList.add('room-mode');
updateRoomUI(room)
}
function goHome(){
currentRoom=null;
selfId=null;
stopLocalMedia();
closeAllPeers();
remoteStreams.clear();
els.roomView.classList.add('hide');
els.controlDock.classList.add('hide');
els.homeView.classList.remove('hide');
els.bottomNav.classList.remove('room-mode');
closeSheets();
renderRooms()
}
function updateRoomUI(room){
currentRoom=room;
const s=spaces[room.space]||spaces.mafia;
els.roomModeIcon.textContent=s.icon;
els.roomMode.textContent=s.label;
els.roomName.textContent='Room #'+room.code;
els.roomPlayersCount.textContent=room.playerCount+'/'+room.max;
els.startBtn.style.display=room.hostId===selfId?'':'none';
els.videoGrid.classList.toggle('debate',room.space==='debate');
renderGamePanel();
renderVideos();
renderPlayers()
}
function renderGamePanel(){
if(!currentRoom?.game){
els.gamePanel.classList.add('hide');
return
}
const g=currentRoom.game,host=currentRoom.hostId===selfId;
els.gamePanel.classList.remove('hide');
if(currentRoom.space==='mafia'){
const alive=(g.players||[]).filter(p=>p.alive).length;
els.gamePanel.innerHTML='<div class="role-card"><b>Role:</b> '+(g.role||'Hidden')+' • <b>Phase:</b> '+g.phase+' • <b>Timer:</b> '+g.timer+'s • <b>Alive:</b> '+alive+'</div>'+(host&&!g.started?'<div class="game-row"><input id="mafiaCount" class="input" placeholder="Mafia count" value="'+(g.settings.mafiaCount||1)+'"><input id="daySeconds" class="input" placeholder="Day sec" value="'+(g.settings.daySeconds||90)+'"></div><div class="game-row"><input id="nightSeconds" class="input" placeholder="Night sec" value="'+(g.settings.nightSeconds||45)+'"><input id="voteSeconds" class="input" placeholder="Vote sec" value="'+(g.settings.voteSeconds||45)+'"></div><button id="saveMafiaSettings" class="btn primary">Save Mafia Settings</button>':'')+(g.started?renderMafiaActions(g):'')+'<div class="game-log">'+(g.log||[]).map(x=>'• '+x.text).join('<br>')+'</div>';
if($('saveMafiaSettings'))$('saveMafiaSettings').onclick=()=>socket.emit('game:settings',{
mafiaCount:+$('mafiaCount').value||1,daySeconds:+$('daySeconds').value||90,nightSeconds:+$('nightSeconds').value||45,voteSeconds:+$('voteSeconds').value||45
}
);
document.querySelectorAll('[data-mafia-action]').forEach(b=>b.onclick=()=>socket.emit('mafia:action',{
action:b.dataset.mafiaAction,target:b.dataset.target
}
));

}
else if(currentRoom.space==='debate'){
const active=g.debate?.activeSpeaker;
const p=(currentRoom.players||[]).find(x=>x.id===active);
els.gamePanel.innerHTML='<div class="role-card"><b>Active speaker:</b> '+(p?.username||'None')+' • <b>Timer:</b> '+(g.timer||0)+'s</div>'+(host?'<button id="nextSpeaker" class="btn primary">Next Speaker</button>':'')+'<div class="game-log">'+(g.log||[]).map(x=>'• '+x.text).join('<br>')+'</div>';
if($('nextSpeaker'))$('nextSpeaker').onclick=()=>socket.emit('debate:next')
}
else els.gamePanel.classList.add('hide')
}
function renderMafiaActions(g){
if(!g.alive)return '<div class="role-card">You are eliminated.</div>';
const alive=(g.players||[]).filter(p=>p.alive&&p.id!==selfId);
let html='<div class="game-row">';
alive.forEach(p=>{
if(g.phase==='night'&&['Mafia','Don'].includes(g.role))html+='<button class="btn" data-mafia-action="kill" data-target="'+p.id+'">Kill '+p.username+'</button>';
if(g.phase==='night'&&g.role==='Doctor')html+='<button class="btn" data-mafia-action="save" data-target="'+p.id+'">Save '+p.username+'</button>';
if(g.phase==='night'&&g.role==='Sheriff')html+='<button class="btn" data-mafia-action="check" data-target="'+p.id+'">Check '+p.username+'</button>';
if(g.phase==='voting')html+='<button class="btn" data-mafia-action="vote" data-target="'+p.id+'">Vote '+p.username+'</button>'
}
);
return html+'</div>'
}
function renderVideos(){
if(!currentRoom)return;
let players=[...(currentRoom.players||[])];
if(currentRoom.space==='debate'&&currentRoom.game?.debate?.activeSpeaker){
players.sort((a,b)=>(a.id===currentRoom.game.debate.activeSpeaker?-1:b.id===currentRoom.game.debate.activeSpeaker?1:0))
}
const visible=players.slice(0,8);
els.videoGrid.innerHTML='';
visible.forEach(p=>{
const tile=document.createElement('div');
tile.className='tile'+(p.id===selfId?' self':'');
const v=document.createElement('video');
v.autoplay=true;
v.playsInline=true;
v.muted=p.id===selfId;
if(p.id===selfId&&localStream)v.srcObject=localStream;
if(p.id!==selfId&&remoteStreams.has(p.id))v.srcObject=remoteStreams.get(p.id);
const has=(p.id===selfId&&localStream&&localStream.getVideoTracks().length&&mediaState.cam)||(p.id!==selfId&&remoteStreams.has(p.id));
const ph=document.createElement('div');
ph.className='placeholder';
ph.textContent=p.cam?'Waiting for video':'Camera off';
ph.style.display=has?'none':'flex';
const bar=document.createElement('div');
bar.className='tile-bar';
bar.innerHTML='<div class="tile-name">'+p.username+(p.id===selfId?' (you)':'')+'</div><div class="tile-icons"><span class="ico '+(p.speaking?'speaking':'')+'">🎙</span><span class="ico">'+(p.cam?'▣':'×')+'</span></div>';
tile.append(v,ph,bar);
els.videoGrid.appendChild(tile)
}
);
for(let i=visible.length;
i<8;
i++){
const t=document.createElement('div');
t.className='tile';
t.innerHTML='<div class="placeholder">Empty slot</div>';
els.videoGrid.appendChild(t)
}
updateControls()
}
function renderPlayers(){
if(!currentRoom)return;
els.playersList.innerHTML='';
currentRoom.players.forEach(p=>{
const r=document.createElement('div');
r.className='player-row';
r.innerHTML='<strong>'+p.username+(p.id===selfId?' (you)':'')+'</strong><div class="badges">'+(p.isHost?'<span class="badge">HOST</span>':'')+'<span class="badge">'+(p.mic?'MIC':'MUTED')+'</span><span class="badge">'+(p.cam?'CAM':'NO CAM')+'</span></div>';
els.playersList.appendChild(r)
}
)
}
function updateControls(){
els.micBtn.classList.toggle('on',mediaState.mic);
els.camBtn.classList.toggle('on',mediaState.cam);
els.micBtn.querySelector('span').textContent=mediaState.mic?'Mic On':'Mic Off';
els.camBtn.querySelector('span').textContent=mediaState.cam?'Cam On':'Cam Off'
}
async function ensureStream(){
if(!localStream)localStream=await navigator.mediaDevices.getUserMedia({
audio:true,video:{
facingMode:currentFacingMode,width:{
ideal:360,max:640
}
,height:{
ideal:480,max:640
}
,frameRate:{
ideal:15,max:20
}

}

}
);
attachLocal();
return localStream
}
function attachLocal(){
if(!localStream)return;
peers.forEach(pc=>localStream.getTracks().forEach(track=>{
if(!pc.getSenders().some(s=>s.track&&s.track.kind===track.kind))pc.addTrack(track,localStream)
}
))
}
async function setMic(on){
try{
if(on&&!localStream)await ensureStream();
if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=on);
mediaState.mic=on;
if(on)startSpeaking();
else{
mediaState.speaking=false;
clearInterval(speakingTimer)
}
socket.emit('media:state',mediaState);
renderVideos()
}
catch(e){
showNotice('Mic permission needed.')
}

}
async function setCam(on){
try{
if(on){
if(!localStream)await ensureStream();
let vt=localStream.getVideoTracks()[0];
if(!vt){
const cs=await navigator.mediaDevices.getUserMedia({
video:{
facingMode:currentFacingMode,width:{
ideal:360,max:640
}
,height:{
ideal:480,max:640
}
,frameRate:{
ideal:15,max:20
}

}
,audio:false
}
);
vt=cs.getVideoTracks()[0];
localStream.addTrack(vt);
for(const pc of peers.values()){
const s=pc.getSenders().find(x=>x.track&&x.track.kind==='video');
s?await s.replaceTrack(vt):pc.addTrack(vt,localStream)
}

}
localStream.getVideoTracks().forEach(t=>t.enabled=true);
attachLocal();
mediaState.cam=true;
socket.emit('media:state',mediaState);
renderVideos();
await renegotiateAll()
}
else{
if(localStream)localStream.getVideoTracks().forEach(t=>t.enabled=false);
mediaState.cam=false;
socket.emit('media:state',mediaState);
renderVideos()
}

}
catch(e){
showNotice('Camera permission needed or camera failed.')
}

}
function startSpeaking(){
if(!localStream)return;
try{
const at=localStream.getAudioTracks()[0];
if(!at)return;
audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();
const src=audioCtx.createMediaStreamSource(new MediaStream([at]));
analyser=audioCtx.createAnalyser();
analyser.fftSize=256;
src.connect(analyser);
const data=new Uint8Array(analyser.frequencyBinCount);
clearInterval(speakingTimer);
speakingTimer=setInterval(()=>{
if(!analyser||!mediaState.mic)return;
analyser.getByteFrequencyData(data);
const avg=data.reduce((a,b)=>a+b,0)/data.length;
const sp=avg>18;
if(sp!==mediaState.speaking){
mediaState.speaking=sp;
socket.emit('media:state',mediaState)
}

}
,220)
}
catch(e){

}

}
async function switchCamera(){
if(!localStream||!mediaState.cam)return showNotice('Turn camera on first.');
currentFacingMode=currentFacingMode==='user'?'environment':'user';
const old=localStream.getVideoTracks()[0];
if(old)old.stop();
try{
const ns=await navigator.mediaDevices.getUserMedia({
video:{
facingMode:currentFacingMode,width:{
ideal:360,max:640
}
,frameRate:{
ideal:15,max:20
}

}
,audio:false
}
);
const nt=ns.getVideoTracks()[0];
localStream.getVideoTracks().forEach(t=>localStream.removeTrack(t));
localStream.addTrack(nt);
for(const pc of peers.values()){
const s=pc.getSenders().find(x=>x.track&&x.track.kind==='video');
if(s)await s.replaceTrack(nt)
}
renderVideos()
}
catch(e){
showNotice('Camera switch failed.')
}

}
function createPeer(id,init){
if(peers.has(id))return peers.get(id);
const pc=new RTCPeerConnection({
iceServers:[{
urls:'stun:stun.l.google.com:19302'
}
,{
urls:'stun:global.stun.twilio.com:3478'
}
]
}
);
peers.set(id,pc);
pc.onicecandidate=e=>{
if(e.candidate)socket.emit('webrtc:ice',{
to:id,candidate:e.candidate
}
)
}
;
pc.ontrack=e=>{
remoteStreams.set(id,e.streams[0]);
renderVideos()
}
;
if(localStream)localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
if(init)pc.onnegotiationneeded=async()=>{
try{
const offer=await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('webrtc:offer',{
to:id,offer
}
)
}
catch(e){

}

}
;
return pc
}
async function renegotiateAll(){
for(const[id,pc]of peers){
try{
const offer=await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('webrtc:offer',{
to:id,offer
}
)
}
catch(e){

}

}

}
function closeAllPeers(){
peers.forEach(pc=>pc.close());
peers.clear()
}
function stopLocalMedia(){
if(localStream){
localStream.getTracks().forEach(t=>t.stop());
localStream=null
}
clearInterval(speakingTimer);
mediaState={
mic:false,cam:false,speaking:false
}
;
socket.emit('media:state',mediaState)
}
function openSheet(type){
els.sheetBackdrop.classList.remove('hide');
if(type==='chat'){
els.chatSheet.classList.remove('hide');
unread=0;
updateUnread()
}
if(type==='players')els.playersSheet.classList.remove('hide')
}
function closeSheets(){
els.sheetBackdrop.classList.add('hide');
els.chatSheet.classList.add('hide');
els.playersSheet.classList.add('hide')
}
function updateUnread(){
els.unreadBadge.textContent=unread;
els.unreadBadge.classList.toggle('hide',unread<=0)
}
document.querySelectorAll('[data-space]').forEach(b=>b.onclick=()=>setSpace(b.dataset.space));
els.moreBtn.onclick=()=>els.morePop.classList.toggle('hide');
els.randomCodeBtn.onclick=()=>els.roomCode.value=randomCode();
els.createBtn.onclick=()=>socket.emit('room:create',{
username:getUsername(),space:selectedSpace,code:getCode()
}
);
els.startBtn.onclick=()=>socket.emit('room:start');
els.topLeaveBtn.onclick=()=>socket.emit('room:leave');
els.micBtn.onclick=()=>setMic(!mediaState.mic);
els.camBtn.onclick=()=>setCam(!mediaState.cam);
els.switchBtn.onclick=switchCamera;
els.chatBtn.onclick=()=>openSheet('chat');
els.playersBtn.onclick=()=>openSheet('players');
els.sheetBackdrop.onclick=closeSheets;
document.querySelectorAll('[data-close-sheet]').forEach(b=>b.onclick=closeSheets);
function sendMsg(){
const t=els.chatInput.value.trim();
if(!t)return;
socket.emit('chat:message',t);
els.chatInput.value=''
}
els.sendBtn.onclick=sendMsg;
els.chatInput.onkeydown=e=>{
if(e.key==='Enter')sendMsg()
}
;
socket.on('rooms:update',r=>{
allRooms=r||[];
renderRooms()
}
);
socket.on('notice',n=>showNotice(n.text||'Notice'));
socket.on('room:joined',({
room,selfId:id,existingPeers
}
)=>{
selfId=id;
goRoom(room);
(existingPeers||[]).forEach(p=>createPeer(p.id,true));
showNotice('Joined room #'+room.code)
}
);
socket.on('room:update',room=>{
if(currentRoom&&room.id===currentRoom.id)updateRoomUI(room);
allRooms=allRooms.map(r=>r.id===room.id?room:r);
renderRooms()
}
);
socket.on('room:closed',({
reason
}
)=>{
showNotice(reason||'Room closed');
goHome()
}
);
socket.on('peer:joined',({
id
}
)=>{
createPeer(id,false);
renderVideos()
}
);
socket.on('peer:left',({
id
}
)=>{
if(peers.has(id)){
peers.get(id).close();
peers.delete(id)
}
remoteStreams.delete(id);
renderVideos()
}
);
socket.on('media:state',st=>{
if(!currentRoom)return;
currentRoom.players=currentRoom.players.map(p=>p.id===st.id?{
...p,...st
}
:p);
renderVideos();
renderPlayers()
}
);
socket.on('chat:message',msg=>{
const d=document.createElement('div');
d.className='msg'+(msg.userId===selfId?' me':'');
d.innerHTML='<strong>'+msg.username+'</strong><span>'+msg.text+'</span>';
els.chatLog.appendChild(d);
els.chatLog.scrollTop=els.chatLog.scrollHeight;
if(msg.userId!==selfId&&els.chatSheet.classList.contains('hide')){
unread++;
updateUnread();
playChatSound()
}

}
);
socket.on('mafia:role',({
role
}
)=>showNotice('Your role: '+role,5000));
socket.on('webrtc:offer',async({
from,offer
}
)=>{
const pc=createPeer(from,false);
try{
await pc.setRemoteDescription(new RTCSessionDescription(offer));
attachLocal();
const ans=await pc.createAnswer();
await pc.setLocalDescription(ans);
socket.emit('webrtc:answer',{
to:from,answer:ans
}
)
}
catch(e){

}

}
);
socket.on('webrtc:answer',async({
from,answer
}
)=>{
const pc=peers.get(from);
if(pc)try{
await pc.setRemoteDescription(new RTCSessionDescription(answer))
}
catch(e){

}

}
);
socket.on('webrtc:ice',async({
from,candidate
}
)=>{
const pc=peers.get(from);
if(pc&&candidate)try{
await pc.addIceCandidate(new RTCIceCandidate(candidate))
}
catch(e){

}

}
);
window.addEventListener('beforeunload',()=>{
try{
socket.emit('room:leave')
}
catch(e){

}

}
);
els.roomCode.value=randomCode();
setSpace('mafia');
renderRooms();

</script></body></html>`;

app.get('*', (req, res) => res.send(html));

server.listen(PORT, () => console.log(`VOID PORTAL v1.0 alpha running on port ${
PORT
}
`));

