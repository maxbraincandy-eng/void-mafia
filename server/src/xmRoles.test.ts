/**
 * The optional roles: doctor, maniac, cult.
 *
 * These are rules tests, not transport tests — they drive the service directly,
 * because what matters is the order the night resolves in and who has won, and
 * neither of those is visible from a socket.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  createMatch, getMatch, joinMatchAsBot, setRoleConfig, startMatch, pickCard,
  beginMafiaMeet, endMafiaMeet, beginNight, endNight, leaveMatch, getSafeState,
  mafiaVote, donCheck, doctorHeal, maniacKill, cultConvert,
  effectiveCounts, type XmMatch, type XmRole,
} from './services/sxvaMafiaService.js';

let n = 0;
const nextId = () => `rt_${n++}`;

/** A match with `seats` players, dealt the exact roles asked for. */
function table(roles: XmRole[]): XmMatch {
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < roles.length; i++) joinMatchAsBot(m.id, `bot_${m.id}_${i}`, `P${i}`);

  setRoleConfig(m.id, hostId, {
    don: roles.filter(r => r === 'don').length,
    mafia: roles.filter(r => r === 'mafia').length,
    sheriff: roles.filter(r => r === 'sheriff').length,
    doctor: roles.filter(r => r === 'doctor').length,
    maniac: roles.filter(r => r === 'maniac').length,
    cult: roles.filter(r => r === 'cult').length,
  });
  startMatch(m.id, hostId);

  // Take the cards, then overwrite the roles: the deal is random and these
  // tests are about the rules, not about who drew what.
  const live = getMatch(m.id)!;
  live.seats.forEach((seat, i) => {
    pickCard(m.id, seat.userId, i);
    seat.role = roles[i]!;
    seat.cult = roles[i] === 'cult';
    seat.cultRevealed = roles[i] === 'cult';
  });

  beginMafiaMeet(m.id, hostId);
  endMafiaMeet(m.id, hostId);
  beginNight(m.id, hostId);
  return live;
}

const hostOf = (m: XmMatch) => m.hostId;
const bySeat = (m: XmMatch, i: number) => m.seats[i]!;

// ─── Composition ─────────────────────────────────────────────────────────────

test('the optional roles are off unless the host asks for them', () => {
  const m = createMatch(nextId(), 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < 8; i++) joinMatchAsBot(m.id, `bot_auto_${i}`, `P${i}`);
  const counts = effectiveCounts(getMatch(m.id)!);
  assert.equal(counts.doctor, 0);
  assert.equal(counts.maniac, 0);
  assert.equal(counts.cult, 0, 'a cult must never appear because enough people sat down');
});

test('a table too small to hold every special loses the extras, not the mafia', () => {
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < 4; i++) joinMatchAsBot(m.id, `bot_small_${i}`, `P${i}`);
  setRoleConfig(m.id, hostId, { don: 1, mafia: 1, sheriff: 1, doctor: 1, maniac: 1, cult: 1 });

  const counts = effectiveCounts(getMatch(m.id)!);
  assert.ok(counts.don + counts.mafia >= 1, 'there is still a mafia');
  assert.equal(counts.don + counts.mafia + counts.sheriff + counts.doctor + counts.maniac + counts.cult + counts.citizen, 4);
});

// ─── The doctor ──────────────────────────────────────────────────────────────

test('the doctor saves the mafia\'s target', () => {
  const m = table(['don', 'doctor', 'citizen', 'citizen', 'citizen']);
  const [don, doc, victim] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2)];

  donCheck(m.id, don.userId, victim.userId);
  mafiaVote(m.id, don.userId, victim.userId);
  doctorHeal(m.id, doc.userId, victim.userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.seats[2]!.alive, true, 'shot and saved');
  assert.equal(getMatch(m.id)!.announce!.killed.length, 0, 'a quiet night');
});

test('the doctor cannot heal the same person two nights running', () => {
  const m = table(['don', 'doctor', 'citizen', 'citizen', 'citizen']);
  const [don, doc, patient, shot, spare] =
    [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2), bySeat(m, 3), bySeat(m, 4)];

  // The mafia shoot somebody the doctor did not choose, so the patient lives to
  // be a repeat — the first version of this test shot the person it then tried
  // to heal again, and blamed the rule for refusing a corpse.
  donCheck(m.id, don.userId, shot.userId);
  mafiaVote(m.id, don.userId, shot.userId);
  doctorHeal(m.id, doc.userId, patient.userId);
  endNight(m.id, hostOf(m));

  // Next night.
  const live = getMatch(m.id)!;
  live.phase = 'night';
  live.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null,
                 doctorHeal: null, maniacKill: null, cultConvert: null, cultResult: null };

  assert.equal(
    doctorHeal(m.id, doc.userId, patient.userId), null,
    'the same patient twice would make one player simply immortal',
  );
  assert.ok(doctorHeal(m.id, doc.userId, spare.userId), 'anyone else who is alive is fine');
});

// ─── The maniac ──────────────────────────────────────────────────────────────

test('the maniac kills on their own, and two can die in one night', () => {
  const m = table(['don', 'maniac', 'citizen', 'citizen', 'citizen', 'citizen']);
  const [don, maniac, a, b] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2), bySeat(m, 3)];

  // The don checks before shooting — the rule, and the reason this assertion
  // started failing the moment it was added.
  donCheck(m.id, don.userId, a.userId);
  mafiaVote(m.id, don.userId, a.userId);
  maniacKill(m.id, maniac.userId, b.userId);
  endNight(m.id, hostOf(m));

  const live = getMatch(m.id)!;
  assert.equal(live.announce!.killed.length, 2, 'the announcement carries both names');
  assert.equal(live.seats[2]!.alive, false);
  assert.equal(live.seats[3]!.alive, false);
  assert.equal(live.lastWordsQueue.length + (live.lastWordsUserId ? 1 : 0), 2, 'and both are owed a farewell');
});

test('one save covers every knife aimed at the same person', () => {
  const m = table(['don', 'maniac', 'doctor', 'citizen', 'citizen', 'citizen']);
  const [don, maniac, doc, target] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2), bySeat(m, 3)];

  donCheck(m.id, don.userId, target.userId);
  mafiaVote(m.id, don.userId, target.userId);
  maniacKill(m.id, maniac.userId, target.userId);
  doctorHeal(m.id, doc.userId, target.userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.seats[3]!.alive, true);
  assert.equal(getMatch(m.id)!.announce!.killed.length, 0, 'the mafia and the maniac wasted the night on each other');
});

test('the maniac wins when only one other player is left', () => {
  const m = table(['maniac', 'citizen', 'citizen', 'citizen']);
  const live = getMatch(m.id)!;
  live.seats[2]!.alive = false;
  live.seats[3]!.alive = false;

  maniacKill(m.id, live.seats[0]!.userId, live.seats[1]!.userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.winner, 'maniac');
});

// ─── The cult ────────────────────────────────────────────────────────────────

test('the cult converts, but never the mafia or the maniac', () => {
  const m = table(['cult', 'don', 'maniac', 'citizen', 'citizen', 'citizen']);
  const [leader, don, maniac, plain] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2), bySeat(m, 3)];

  cultConvert(m.id, leader.userId, don.userId);
  endNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[1]!.cult, false, 'the mafia do not join cults');
  assert.equal(getMatch(m.id)!.night.cultResult, 'immune');

  const live = getMatch(m.id)!;
  live.phase = 'night';
  live.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null,
                 doctorHeal: null, maniacKill: null, cultConvert: null, cultResult: null };
  cultConvert(m.id, leader.userId, maniac.userId);
  endNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[2]!.cult, false, 'nor does the maniac');

  const live2 = getMatch(m.id)!;
  live2.phase = 'night';
  live2.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null,
                  doctorHeal: null, maniacKill: null, cultConvert: null, cultResult: null };
  cultConvert(m.id, leader.userId, plain.userId);
  endNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[3]!.cult, true, 'a townsperson does');
  assert.equal(getMatch(m.id)!.night.cultResult, 'converted');
});

test('the cult wins when the whole table is cult', () => {
  const m = table(['cult', 'citizen', 'citizen', 'citizen', 'citizen']);
  const live = getMatch(m.id)!;
  live.seats[1]!.cult = true;
  live.seats[3]!.alive = false;
  live.seats[4]!.alive = false;

  cultConvert(m.id, live.seats[0]!.userId, live.seats[2]!.userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.winner, 'cult');
});

test('a converted player keeps the card they were dealt', () => {
  const m = table(['cult', 'doctor', 'citizen', 'citizen', 'citizen']);
  const [leader, doc] = [bySeat(m, 0), bySeat(m, 1)];

  cultConvert(m.id, leader.userId, doc.userId);
  endNight(m.id, hostOf(m));

  const converted = getMatch(m.id)!.seats[1]!;
  assert.equal(converted.cult, true, 'they are in the cult');
  assert.equal(converted.role, 'doctor', 'and they can still heal — they just win with somebody else now');
});

test('a convert is not told until the next night falls', () => {
  const m = table(['cult', 'citizen', 'citizen', 'citizen', 'citizen']);
  const [leader, mark] = [bySeat(m, 0), bySeat(m, 1)];

  cultConvert(m.id, leader.userId, mark.userId);
  endNight(m.id, hostOf(m));

  // Night one is over; it is morning, and they belong to the cult already —
  // that is what will decide who wins — but nothing on their screen says so.
  const converted = getMatch(m.id)!.seats[1]!;
  assert.equal(converted.cult, true, 'they are in it from the moment it happened');
  assert.equal(converted.cultRevealed, false, 'but they have not been told');

  const morning = getSafeState(getMatch(m.id)!, mark.userId);
  assert.equal(morning.myCult, false, 'so their own screen says nothing');
  assert.deepEqual(morning.mateIds, [], 'and names nobody');
  assert.ok(morning.seats.every(s => !s.cult), 'and marks nobody at the table');

  // The leader, on the other hand, knew the same night — they did it.
  assert.equal(getSafeState(getMatch(m.id)!, leader.userId).myCult, true);
  assert.deepEqual(
    getSafeState(getMatch(m.id)!, leader.userId).mateIds, [mark.userId],
    'and can see who they took',
  );

  // Night two falls.
  beginNight(m.id, hostOf(m));

  const told = getSafeState(getMatch(m.id)!, mark.userId);
  assert.equal(getMatch(m.id)!.seats[1]!.cultRevealed, true);
  assert.equal(told.myCult, true, 'now they know');
  assert.deepEqual(told.mateIds, [leader.userId], 'and who they are in it with');
});

test('the cult comes apart when its leader is shot', () => {
  const m = table(['cult', 'don', 'doctor', 'citizen', 'citizen', 'citizen']);
  const [leader, don, doc] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2)];

  // Night one: the leader takes the doctor. The mafia only look around, so the
  // morning has no last words in it and the host can call the next night.
  cultConvert(m.id, leader.userId, doc.userId);
  donCheck(m.id, don.userId, bySeat(m, 3).userId);
  endNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[2]!.cult, true, 'the doctor is theirs');

  // Night two: the mafia shoot the leader.
  beginNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[2]!.cultRevealed, true, 'the doctor was told at nightfall');
  donCheck(m.id, don.userId, bySeat(m, 4).userId);
  mafiaVote(m.id, don.userId, leader.userId);
  endNight(m.id, hostOf(m));

  const after = getMatch(m.id)!;
  assert.equal(after.seats[0]!.alive, false, 'the leader is dead');
  assert.equal(after.seats[2]!.cult, false, 'and the doctor is the town\'s doctor again');
  assert.equal(after.seats[2]!.cultRevealed, false);
  assert.equal(after.seats[2]!.role, 'doctor', 'they never stopped being one');
  assert.equal(getSafeState(after, doc.userId).myCult, false, 'their screen agrees');
});

test('the cult comes apart when its leader walks out of the room', () => {
  const m = table(['cult', 'don', 'citizen', 'citizen', 'citizen', 'citizen']);
  const [leader, mark] = [bySeat(m, 0), bySeat(m, 2)];

  cultConvert(m.id, leader.userId, mark.userId);
  endNight(m.id, hostOf(m));
  beginNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.seats[2]!.cult, true);

  // Leaving is not dying, so it is the one exit that does not pass a win check.
  leaveMatch(m.id, leader.userId);

  const after = getMatch(m.id)!;
  assert.equal(after.seats[0]!.alive, true, 'they are alive — they just left');
  assert.equal(after.seats[2]!.cult, false, 'and took the cult with them');
  assert.equal(after.seats[2]!.cultRevealed, false);
});

test('a leaderless cult cannot win the game on its own', () => {
  const m = table(['cult', 'don', 'citizen', 'citizen', 'citizen']);
  const live = getMatch(m.id)!;

  // Everyone alive is in the cult except the mafia — one shot from a cult win.
  live.seats[2]!.cult = true; live.seats[2]!.cultRevealed = true;
  live.seats[3]!.alive = false;
  live.seats[4]!.alive = false;

  // The mafia shoot the leader instead. Alive: one convert, one don.
  donCheck(m.id, live.seats[1]!.userId, live.seats[2]!.userId);
  mafiaVote(m.id, live.seats[1]!.userId, live.seats[0]!.userId);
  endNight(m.id, hostOf(m));

  const after = getMatch(m.id)!;
  assert.notEqual(after.winner, 'cult', 'the cult died with the man who made it');
  assert.equal(after.seats[2]!.cult, false, 'the convert is a citizen again');
  assert.equal(after.winner, 'mafia', 'and one mafioso against one citizen is parity');
});

// ─── Win order ───────────────────────────────────────────────────────────────

test('the mafia cannot claim parity while a maniac is still shooting', () => {
  const m = table(['don', 'maniac', 'citizen', 'citizen', 'citizen']);
  const live = getMatch(m.id)!;
  live.seats[3]!.alive = false;
  live.seats[4]!.alive = false;
  // Alive: don, maniac, one citizen. The mafia are 1 of 3 — no parity anyway,
  // but make it 1 v 1 v 1 and confirm nobody has won yet.
  donCheck(m.id, live.seats[0]!.userId, live.seats[2]!.userId);
  mafiaVote(m.id, live.seats[0]!.userId, live.seats[2]!.userId);
  maniacKill(m.id, live.seats[1]!.userId, live.seats[2]!.userId);
  endNight(m.id, hostOf(m));

  // Don and maniac remain: two players, one of them the maniac.
  assert.equal(getMatch(m.id)!.winner, 'maniac', 'the maniac finishes the last one at night');
});

test('town wins only when nothing hostile is left', () => {
  const m = table(['don', 'maniac', 'cult', 'citizen', 'citizen', 'citizen']);
  const live = getMatch(m.id)!;
  live.seats[0]!.alive = false;   // don
  live.seats[2]!.alive = false;   // cult leader
  assert.equal(live.winner, null, 'a live maniac is still a problem');

  live.seats[1]!.alive = false;   // maniac
  maniacKill(m.id, live.seats[1]!.userId, live.seats[3]!.userId);  // dead, so refused
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.winner, 'town');
});

// ─── The don's order, and ending a game ──────────────────────────────────────

test('the don checks before shooting, so the answer is on screen while they choose', async () => {
  const { mafiaVote: vote, donCheck } = await import('./services/sxvaMafiaService.js');
  const m = table(['don', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, sheriff, plain] = [bySeat(m, 0), bySeat(m, 1), bySeat(m, 2)];

  assert.equal(
    vote(m.id, don.userId, plain.userId), null,
    'shooting first meant the night could resolve on the check, and the one piece '
    + 'of information the don gets all night went past on its way to the morning',
  );

  assert.ok(donCheck(m.id, don.userId, sheriff.userId), 'so the check comes first');
  assert.equal(getMatch(m.id)!.night.donResult, true);
  assert.match(bySeat(getMatch(m.id)!, 0).lastCheck ?? '', /შერიფია/, 'and it says so in words');

  assert.ok(vote(m.id, don.userId, plain.userId), 'then the kill');
});

test('a plain mafia shoots without checking anything', async () => {
  const { mafiaVote: vote } = await import('./services/sxvaMafiaService.js');
  const m = table(['don', 'mafia', 'citizen', 'citizen', 'citizen']);
  assert.ok(vote(m.id, bySeat(m, 1).userId, bySeat(m, 2).userId), 'the order rule is the don\'s alone');
});

test('the host can end a game without closing the room', async () => {
  const { endGame } = await import('./services/sxvaMafiaService.js');
  const m = table(['don', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const code = m.code;
  const seats = m.seats.length;

  assert.ok(endGame(m.id, hostOf(m)));

  const after = getMatch(m.id)!;
  assert.equal(after.phase, 'lobby', 'everyone lands back in the lobby');
  assert.equal(after.dissolved, false, 'the room is not closed');
  assert.equal(after.code, code, 'and keeps its code, so nobody has to reassemble');
  assert.equal(after.seats.length, seats, 'with the same people still seated');
  assert.ok(after.seats.every(s => s.role === null && s.alive), 'roles and lives reset');
  assert.equal(after.round, 0);
});

test('only the host ends the game, and never from the lobby', async () => {
  const { endGame } = await import('./services/sxvaMafiaService.js');
  const m = table(['don', 'citizen', 'citizen', 'citizen']);
  assert.equal(endGame(m.id, bySeat(m, 1).userId), null, 'a player cannot stop everyone\'s game');
  assert.ok(endGame(m.id, hostOf(m)));
  assert.equal(endGame(m.id, hostOf(m)), null, 'and there is nothing to end once it is over');
});
