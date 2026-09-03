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
  mafiaVote, setHostShot, donCheck, sheriffCheck, doctorHeal, maniacKill, cultConvert, advanceNightAuto,
  castVote, nextCandidate, advanceCandidateAuto, setSettings,
  effectiveCounts, roleCounts, type XmMatch, type XmRole,
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

test('a small table gets a plain mafioso, and the don only once there are two', () => {
  // The don is the mafia's leader, and a leader of one is not a rank — it is a
  // solitary player with a sheriff check attached. So the plain mafia fills
  // first and the don arrives when somebody is there to be led.
  for (const n of [4, 5, 6]) {
    const c = roleCounts(n);
    assert.equal(c.don, 0, `${n} players: no don by default`);
    assert.equal(c.mafia, 1, `${n} players: one plain mafioso`);
  }
  for (const [n, mafia] of [[7, 1], [8, 1], [9, 2], [12, 3]] as const) {
    const c = roleCounts(n);
    assert.equal(c.don, 1, `${n} players: now there is a don`);
    assert.equal(c.mafia, mafia, `${n} players: and ${mafia} to lead`);
  }
});

test('when the mafia must lose a seat, the don goes before the last mafioso', () => {
  // The host asked for four mafia-team members at a three-player table. Once
  // the specials and the sheriff are gone the trim has to cut into the mafia
  // itself, and the rank is what is expendable — somebody still has to shoot.
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < 3; i++) joinMatchAsBot(m.id, `bot_tiny_${i}`, `P${i}`);
  setRoleConfig(m.id, hostId, { don: 1, mafia: 3, sheriff: 0, doctor: 0, maniac: 0, cult: 0 });

  const counts = effectiveCounts(getMatch(m.id)!);
  assert.equal(counts.don, 0, 'the rank is what is expendable');
  assert.equal(counts.mafia, 3, 'the shooters stay');
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

// ─── The night shot: everybody, or nobody, or the host ───────────────────────

test('a split shot kills nobody, don or no don', async () => {
  /*
   * The bug this was written for. The rule was a plurality with the don
   * breaking ties, so three mafia pointing in three directions still killed
   * somebody — and whether a split killed at all depended on whether the table
   * happened to have a don in it. At a table, pointing in three directions is a
   * miss.
   */
  for (const roles of [
    ['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen'],
    ['don', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen'],
    ['mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen'],
  ] as XmRole[][]) {
    const m = table(roles);
    const mafia = m.seats.filter(s => s.role === 'don' || s.role === 'mafia');
    const targets = m.seats.filter(s => s.role !== 'don' && s.role !== 'mafia');
    const don = m.seats.find(s => s.role === 'don');
    if (don) donCheck(m.id, don.userId, targets[0]!.userId);
    // Everybody points somewhere different.
    mafia.forEach((s, i) => mafiaVote(m.id, s.userId, targets[i]!.userId));

    assert.equal(m.phase, 'night', `${roles.join('/')}: a split night resolved itself`);
    endNight(m.id, hostOf(m));
    assert.deepEqual(m.announce?.killed ?? [], [],
      `${roles.join('/')}: a split shot killed #${m.announce?.killed?.[0]?.seat}`);
    assert.equal(m.seats.filter(s => s.alive).length, roles.length);
  }
});

test('an agreed shot still lands, and closes the night on its own', () => {
  // The other half of the rule: agreement is what kills, and a night with
  // nothing left to decide should not wait for the moderator.
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, victim] = m.seats;
  donCheck(m.id, don.userId, sher.userId);
  mafiaVote(m.id, don.userId, victim!.userId);
  mafiaVote(m.id, maf!.userId, victim!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);

  assert.notEqual(m.phase, 'night', 'an agreed night should have closed itself');
  assert.deepEqual((m.announce?.killed ?? []).map(k => k.seat), [victim!.seat]);
  assert.equal(victim!.alive, false);
});

test('a split night waits for the host instead of resolving behind them', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  donCheck(m.id, don.userId, sher!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);
  mafiaVote(m.id, don.userId, c1!.userId);
  mafiaVote(m.id, maf!.userId, c2!.userId);

  // Everyone has acted, so the old rule would have resolved here.
  const view = getSafeState(m, hostOf(m));
  assert.equal(m.phase, 'night');
  assert.equal(view.nightAllActed, true, 'every role acted');
  assert.equal(view.nightShot?.needsHost, true, 'the host was not told the night is on them');
  assert.equal(view.nightShot?.agreedId, null);
});

test('the host names the victim, and that is who dies', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  donCheck(m.id, don.userId, sher!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);
  mafiaVote(m.id, don.userId, c1!.userId);
  mafiaVote(m.id, maf!.userId, c2!.userId);

  // The moderator looks at the split and calls it: the second name.
  assert.ok(setHostShot(m.id, hostOf(m), c2!.userId));
  assert.notEqual(m.phase, 'night', 'the ruling should have closed the night');
  assert.deepEqual((m.announce?.killed ?? []).map(k => k.seat), [c2!.seat]);
  assert.equal(c1!.alive, true, 'the wrong player died');
});

test('the host can call a miss, and it is a real answer', () => {
  // Distinct from "the host has not ruled yet": a called miss closes the night.
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  donCheck(m.id, don.userId, sher!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);
  mafiaVote(m.id, don.userId, c1!.userId);
  mafiaVote(m.id, maf!.userId, c2!.userId);

  assert.ok(setHostShot(m.id, hostOf(m), null));
  assert.notEqual(m.phase, 'night');
  assert.deepEqual(m.announce?.killed ?? [], []);
  assert.equal(m.seats.filter(s => s.alive).length, 6);
});

test('the host can overrule a shot the mafia did agree on', () => {
  // The moderator runs the table, so their word is the shot even when there was
  // no split to settle.
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  donCheck(m.id, don.userId, sher!.userId);
  mafiaVote(m.id, don.userId, c1!.userId);
  assert.ok(setHostShot(m.id, hostOf(m), c2!.userId));
  mafiaVote(m.id, maf!.userId, c1!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);

  assert.equal(c2!.alive, false, 'the host\'s name should have been the shot');
  assert.equal(c1!.alive, true);
});

test('only the host rules on the shot, and never on a mafioso', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1] = m.seats;
  assert.equal(setHostShot(m.id, don.userId, c1!.userId), null, 'a player ruled on the shot');
  assert.equal(setHostShot(m.id, sher!.userId, c1!.userId), null);
  // The mafia do not shoot their own, and the host does not get to by accident.
  assert.equal(setHostShot(m.id, hostOf(m), maf!.userId), null, 'the host shot a mafioso');
  assert.equal(m.night.hostShot, undefined, 'a rejected ruling was still recorded');
});

test('sport keeps shooting blind — no moderator ruling there', () => {
  /*
   * The one place the host must NOT be able to repair a split: the whole mode
   * rests on the team coordinating without seeing each other.
   */
  const m = table(['don', 'mafia', 'mafia', 'sheriff', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen']);
  m.sport = true;
  const mafia = m.seats.filter(s => s.role === 'don' || s.role === 'mafia');
  const targets = m.seats.filter(s => s.role !== 'don' && s.role !== 'mafia');
  assert.equal(setHostShot(m.id, hostOf(m), targets[0]!.userId), null, 'sport accepted a host ruling');
  assert.equal(getSafeState(m, hostOf(m)).nightShot, null, 'sport showed the host the picks');
  mafia.forEach((s, i) => mafiaVote(m.id, s.userId, targets[i]!.userId));
  endNight(m.id, hostOf(m));
  assert.deepEqual(m.announce?.killed ?? [], [], 'a split still killed in sport');
});

test('a split night gets a clock, so an absent host cannot freeze the table', () => {
  /*
   * The risk the host's authority introduces: "wait for the moderator" with
   * nothing behind it means a host who closed their laptop leaves everybody in
   * a night that never ends. The wait is bounded, and running out resolves it
   * the way an unruled split resolves — quietly.
   */
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  assert.equal(m.nightEndsAt, 0, 'a night nobody is waiting on should have no clock');

  donCheck(m.id, don.userId, sher!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);
  mafiaVote(m.id, don.userId, c1!.userId);
  mafiaVote(m.id, maf!.userId, c2!.userId);

  assert.ok(m.nightEndsAt > Date.now(), 'a split night was left waiting with no deadline');
  // Firing it is what the timer does, and it must not kill anybody.
  assert.ok(advanceNightAuto(m.id));
  assert.deepEqual(m.announce?.killed ?? [], []);
  assert.equal(m.nightEndsAt, 0, 'the clock outlived the night it belonged to');
});

test('an agreed night never starts a host clock', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, victim] = m.seats;
  donCheck(m.id, don.userId, sher!.userId);
  mafiaVote(m.id, don.userId, victim!.userId);
  mafiaVote(m.id, maf!.userId, victim!.userId);
  sheriffCheck(m.id, sher!.userId, don.userId);
  assert.equal(m.nightEndsAt, 0);
  assert.equal(victim!.alive, false);
});

// ─── The vote: one name at a time, a few seconds each ────────────────────────

/** A table sitting in a vote with the given candidates, in that order. */
function voting(m: XmMatch, candidates: number[]): void {
  m.phase = 'vote';
  m.nominations = candidates.map(i => m.seats[i]!.userId);
  m.votes = {};
  m.voteIdx = 0;
  m.voteResult = null;
  m.voteRevote = false;
  // Deliberately shorter than a fresh window, so a reset is unambiguous rather
  // than two identical timestamps a millisecond apart.
  m.voteEndsAt = Date.now() + 1000;
}

test('the clock belongs to a candidate, not to the whole vote', () => {
  /*
   * The bug. One clock ran across the entire vote and ENDED it when it expired,
   * so a table with four names that spent its time on the first two never asked
   * about the other two — and the standing rule swept every silent player onto
   * the last name they had never been asked about.
   */
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  voting(m, [2, 3, 4, 5]);

  advanceCandidateAuto(m.id);
  assert.equal(m.phase, 'vote', 'the first candidate running out ended the whole vote');
  assert.equal(m.voteIdx, 1, 'it did not move to the second name');

  advanceCandidateAuto(m.id);
  assert.equal(m.voteIdx, 2);
  advanceCandidateAuto(m.id);
  assert.equal(m.voteIdx, 3, 'the fourth name was never reached');
});

test('each candidate gets their own few seconds', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  voting(m, [2, 3, 4]);
  const first = m.voteEndsAt;

  advanceCandidateAuto(m.id);
  assert.ok(m.voteEndsAt > first, 'the second candidate inherited the first one\'s clock');
  assert.ok(Math.abs(m.voteEndsAt - Date.now() - m.settings.voteSeconds * 1000) < 500,
    'the new window is not one candidate long');
});

test('a moderator can get ahead of the clock, and it resets', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  voting(m, [2, 3, 4]);
  const first = m.voteEndsAt;
  nextCandidate(m.id, hostOf(m));
  assert.equal(m.voteIdx, 1);
  assert.ok(m.voteEndsAt > first, 'advancing early left the old deadline in place');
  // Only the moderator.
  assert.equal(nextCandidate(m.id, m.seats[0]!.userId), null);
});

test('running out on the last name closes the vote, as it always did', () => {
  // The standing rule survives: past the last candidate, everyone still silent
  // is counted for that last name.
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const last = m.seats[4]!;
  voting(m, [2, 4]);
  advanceCandidateAuto(m.id);          // → the second (last) name
  assert.equal(m.voteIdx, 1);
  advanceCandidateAuto(m.id);          // → closes
  assert.notEqual(m.phase, 'vote', 'the last candidate running out did not close the vote');
  assert.equal(last.alive, false, 'the silent table did not carry the last name');
});

test('a hand goes up for the name on the floor and nowhere else', () => {
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  const [don, maf, sher, c1, c2] = m.seats;
  voting(m, [3, 4]);   // c1 then c2

  // Voting ahead for the second name is refused while the first is up.
  assert.equal(castVote(m.id, don.userId, c2!.userId), null, 'a vote landed on a name not yet asked');
  assert.ok(castVote(m.id, don.userId, c1!.userId));
  assert.equal(m.votes[don.userId], c1!.userId);
  // One hand each, and it cannot be moved once counted.
  assert.equal(castVote(m.id, don.userId, c1!.userId), null);
  advanceCandidateAuto(m.id);
  assert.equal(castVote(m.id, don.userId, c2!.userId), null, 'a second vote was allowed on the next name');
  // Somebody who has not voted still can, on the name now up.
  assert.ok(castVote(m.id, maf!.userId, c2!.userId));
  assert.equal(sher!.alive, true);
});

test('five seconds is the default, and the host can set three to thirty', () => {
  /*
   * Per candidate, not per vote — so the old fifteen-second floor was a
   * whole-vote number and would have made a single name outlast a whole round
   * of them.
   */
  const m = table(['don', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen']);
  assert.equal(m.settings.voteSeconds, 5);
  m.phase = 'lobby';
  setSettings(m.id, hostOf(m), { voteSeconds: 1 });
  assert.equal(m.settings.voteSeconds, 3, 'no floor');
  setSettings(m.id, hostOf(m), { voteSeconds: 300 });
  assert.equal(m.settings.voteSeconds, 30, 'no ceiling');
  setSettings(m.id, hostOf(m), { voteSeconds: 8 });
  assert.equal(m.settings.voteSeconds, 8);
});
