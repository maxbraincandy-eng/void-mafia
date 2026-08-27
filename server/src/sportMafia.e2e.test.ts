/**
 * სპორტული მაფია, played through.
 *
 * The rules module is tested on its own; this drives them through a real match
 * to check they are actually wired to the game — that the blind shot is blind
 * in the payload a client receives, that a tie really reaches a tribunal, and
 * that the phases run in the order the ruleset says.
 *
 * Roles are dealt at random and then overwritten, the same way the other hosted
 * mafia tests do it: these are rules tests, not shuffle tests.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  createMatch, getMatch, joinMatchAsBot, setSettings, startMatch, pickCard,
  beginMafiaMeet, endPlanNight, beginNight, endNight, endVote,
  mafiaVote, donCheck, sheriffCheck, nominate, castVote, nextSpeaker,
  nextTribunalDefense, tribunalVote, endTribunalVote, endLastWords,
  getSafeState, type XmMatch, type XmRole,
} from './services/sxvaMafiaService.js';
import { SPORT_SEATS } from './services/sportMafiaRules.js';

let n = 0;
const nextId = () => `sp_${n++}`;

/** The tournament composition, in seat order, so tests can name a role by index. */
const SPORT_DEAL: XmRole[] = [
  'don', 'mafia', 'mafia', 'sheriff',
  'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen',
];

/** A ten-handed sport table, dealt and sitting on the planning night. */
function sportTable(roles: XmRole[] = SPORT_DEAL): XmMatch {
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < roles.length; i++) joinMatchAsBot(m.id, `bot_${m.id}_${i}`, `P${i}`);
  setSettings(m.id, hostId, { sport: true } as any);
  assert.ok(startMatch(m.id, hostId), 'a ten-handed table with the don card starts');

  const live = getMatch(m.id)!;
  live.seats.forEach((seat, i) => {
    pickCard(m.id, seat.userId, i);
    seat.role = roles[i]!;
  });
  beginMafiaMeet(m.id, hostId);
  return live;
}

const hostOf = (m: XmMatch) => m.hostId;
const at = (m: XmMatch, i: number) => m.seats[i]!;
const don = (m: XmMatch) => m.seats.find(s => s.role === 'don')!;
const mafiosi = (m: XmMatch) => m.seats.filter(s => s.role === 'mafia');
const sheriff = (m: XmMatch) => m.seats.find(s => s.role === 'sheriff')!;
const citizens = (m: XmMatch) => m.seats.filter(s => s.role === 'citizen');

/** Walk the whole team through a night: don checks, then everybody shoots. */
function teamShoots(m: XmMatch, targets: Record<string, string>, checkTarget?: string): void {
  const d = don(m);
  if (d.alive) donCheck(m.id, d.userId, checkTarget ?? citizens(m).find(c => c.alive)!.userId);
  for (const [voterId, targetId] of Object.entries(targets)) mafiaVote(m.id, voterId, targetId);
}

// ── Starting ──────────────────────────────────────────────────────────────────

test('sport needs ten players, and refuses to start with nine', () => {
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < 9; i++) joinMatchAsBot(m.id, `bot_nine_${i}`, `P${i}`);
  setSettings(m.id, hostId, { sport: true } as any);

  assert.equal(startMatch(m.id, hostId), null, 'nine-handed sport does not start');
  assert.equal(getMatch(m.id)!.phase, 'lobby', 'and the table stays in the lobby');

  // The lobby is told which half is missing rather than left guessing.
  const view = getSafeState(getMatch(m.id)!, hostId);
  assert.equal(view.sportRequested, true);
  assert.match(view.sportBlockedReason!, /9/);

  joinMatchAsBot(m.id, 'bot_nine_9', 'P9');
  assert.ok(startMatch(m.id, hostId), 'the tenth arrives and it starts');
  assert.equal(getMatch(m.id)!.sport, true);
});

test('the composition is the tournament\'s, not the host\'s', () => {
  const m = sportTable();
  const live = getMatch(m.id)!;
  assert.equal(live.seats.length, SPORT_SEATS);
  assert.deepEqual(live.roleConfig, { don: 1, mafia: 2, sheriff: 1, doctor: 0, maniac: 0, cult: 0 });
});

test('a table that did not ask for sport plays the casual rules', () => {
  const hostId = nextId();
  const m = createMatch(hostId, 'sock', 'Host', { maxSeats: 12 });
  for (let i = 0; i < 10; i++) joinMatchAsBot(m.id, `bot_cas_${i}`, `P${i}`);
  startMatch(m.id, hostId);
  assert.equal(getMatch(m.id)!.sport, false, 'ten players alone is not sport — the host has to ask');
});

// ── The planning night ────────────────────────────────────────────────────────

test('the game opens on a night nobody dies in', () => {
  const m = sportTable();
  const live = getMatch(m.id)!;
  assert.equal(live.phase, 'plan_night', 'not the acquaintance screen the casual rules open with');

  // No killing in it: the phase is not `night`, so the night actions refuse.
  const victim = citizens(live)[0]!;
  assert.equal(mafiaVote(m.id, don(live).userId, victim.userId), null);
  assert.equal(sheriffCheck(m.id, sheriff(live).userId, victim.userId), null);
  assert.equal(victim.alive, true);
});

test('the planning night leads straight into a day that counts', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const live = getMatch(m.id)!;
  assert.equal(live.phase, 'speech');
  // The casual rules open with a circle where nobody may nominate. Sport's
  // first day is a real one, and the first speaker may put somebody up.
  assert.equal(live.introRound, false);

  const speaker = live.speechOrder[live.speechIdx]!;
  const target = live.seats.find(s => s.userId !== speaker)!;
  assert.ok(nominate(m.id, speaker, target.userId), 'the very first speaker can nominate');
});

// ── The blind shot ────────────────────────────────────────────────────────────

/** Get the table to a real night, with everyone alive. */
function toNight(m: XmMatch): XmMatch {
  endPlanNight(m.id, hostOf(m));
  const live = getMatch(m.id)!;
  for (let i = 0; i < 40 && live.phase === 'speech'; i++) nextSpeaker(m.id, hostOf(m));
  if (getMatch(m.id)!.phase === 'vote') endVote(m.id, hostOf(m));
  beginNight(m.id, hostOf(m));
  return getMatch(m.id)!;
}

test('the team kills only when all of them press the same name', () => {
  const m = sportTable();
  const live = toNight(m);
  assert.equal(live.phase, 'night');

  const victim = citizens(live)[0]!;
  const [m1, m2] = mafiosi(live);
  teamShoots(live, {
    [don(live).userId]: victim.userId,
    [m1!.userId]: victim.userId,
    [m2!.userId]: victim.userId,
  }, sheriff(live).userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.seats.find(s => s.userId === victim.userId)!.alive, false);
});

test('one disagreement and the night is quiet', () => {
  const m = sportTable();
  const live = toNight(m);

  const [a, b] = citizens(live);
  const [m1, m2] = mafiosi(live);
  // Two on one name, the third somewhere else. Under the casual rules the
  // plurality would carry and `a` would die.
  teamShoots(live, {
    [don(live).userId]: a!.userId,
    [m1!.userId]: a!.userId,
    [m2!.userId]: b!.userId,
  }, sheriff(live).userId);
  endNight(m.id, hostOf(m));

  const after = getMatch(m.id)!;
  assert.equal(after.seats.find(s => s.userId === a!.userId)!.alive, true, 'no plurality');
  assert.equal(after.seats.find(s => s.userId === b!.userId)!.alive, true, 'and no don tiebreak');
  assert.equal(after.announce?.killed.length ?? 0, 0, 'the morning has nobody to announce');
});

test('one silence and the night is quiet too', () => {
  const m = sportTable();
  const live = toNight(m);
  const victim = citizens(live)[0]!;
  const [m1] = mafiosi(live);

  // The don and one mafioso agree; the other never presses. The night still has
  // to close — a team that will not act cannot be allowed to hang the game.
  teamShoots(live, {
    [don(live).userId]: victim.userId,
    [m1!.userId]: victim.userId,
  }, sheriff(live).userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.seats.find(s => s.userId === victim.userId)!.alive, true);
});

test('the mafia cannot see each other press', () => {
  const m = sportTable();
  const live = toNight(m);
  const victim = citizens(live)[0]!;
  const [m1, m2] = mafiosi(live);

  donCheck(m.id, don(live).userId, sheriff(live).userId);
  mafiaVote(m.id, don(live).userId, victim.userId);
  mafiaVote(m.id, m1!.userId, victim.userId);

  // The projection IS the rule. Sending the picks and hiding them in the UI
  // would leave them one devtools panel away, and the mode rests on nobody
  // being able to see them.
  const asMafia = getSafeState(getMatch(m.id)!, m2!.userId);
  assert.deepEqual(asMafia.mafiaPicks, [], 'the third mafioso is shooting blind');

  /*
   * And the blindness is the mode, not the projection being empty by accident.
   * The same position under the casual rules shows both picks — flipping the
   * flag is the only difference, so this is what proves the rule does work.
   */
  const live2 = getMatch(m.id)!;
  live2.sport = false;
  assert.equal(getSafeState(live2, m2!.userId).mafiaPicks.length, 2, 'casual rules show the team');
  live2.sport = true;
  assert.deepEqual(getSafeState(live2, m2!.userId).mafiaPicks, [], 'sport does not');

  // They still know WHO their team is — that is the planning night's job.
  assert.equal(asMafia.mateIds.length, 2, 'the team is known; the target is not');
});

// ── The don, and the sheriff ──────────────────────────────────────────────────

test('the sheriff finds mafia and the don comes back clean', () => {
  const m = sportTable();
  const live = toNight(m);
  const s = sheriff(live);
  const [m1] = mafiosi(live);

  sheriffCheck(m.id, s.userId, m1!.userId);
  assert.equal(getMatch(m.id)!.night.sheriffResult, true, 'a plain mafioso is caught');

  // Fresh night, so the sheriff may check again.
  const live2 = getMatch(m.id)!;
  live2.night.sheriffCheck = null; live2.night.sheriffResult = null;
  sheriffCheck(m.id, s.userId, don(live2).userId);
  assert.equal(getMatch(m.id)!.night.sheriffResult, false, 'the don reads as a citizen');
  assert.match(sheriff(getMatch(m.id)!).lastCheck!, /მშვიდობიანია/);
});

test('the don checks for the sheriff before anyone shoots', () => {
  const m = sportTable();
  const live = toNight(m);
  const d = don(live);
  const victim = citizens(live)[0]!;

  assert.equal(mafiaVote(m.id, d.userId, victim.userId), null, 'the check comes first');
  assert.ok(donCheck(m.id, d.userId, sheriff(live).userId));
  assert.equal(getMatch(m.id)!.night.donResult, true);
  assert.match(don(getMatch(m.id)!).lastCheck!, /შერიფია/, 'and it says so in words');
  assert.ok(mafiaVote(m.id, d.userId, victim.userId), 'then the shot');
});

// ── Tribunal ──────────────────────────────────────────────────────────────────

/** Force a tied vote between two named players and close it. */
function forceTie(m: XmMatch, aId: string, bId: string): XmMatch {
  const live = getMatch(m.id)!;
  live.phase = 'vote';
  live.nominations = [aId, bId];
  live.votes = {};
  live.voteIdx = 0;
  live.voteResult = null;

  // One vote each, from two citizens who are not on trial.
  const voters = live.seats.filter(s => s.alive && s.userId !== aId && s.userId !== bId).slice(0, 2);
  live.votes[voters[0]!.userId] = aId;
  live.votes[voters[1]!.userId] = bId;
  endVote(m.id, hostOf(m));
  return getMatch(m.id)!;
}

test('a tied vote goes to tribunal, not to a re-vote', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);

  const live = forceTie(m, a!.userId, b!.userId);
  assert.equal(live.phase, 'tribunal_defense', 'the casual rules would re-run the same vote');
  assert.equal(live.tribunal!.onTrial.length, 2);
  // Seat order, so the running order is a fact about the table rather than a
  // by-product of how the tally happened to iterate.
  assert.deepEqual(
    live.tribunal!.onTrial,
    [a!, b!].sort((x, y) => x.seat - y.seat).map(x => x.userId),
  );
});

test('each of the accused speaks, then the town is asked', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  forceTie(m, a!.userId, b!.userId);

  assert.equal(getMatch(m.id)!.tribunal!.defenseIdx, 0);
  nextTribunalDefense(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.tribunal!.defenseIdx, 1, 'the second defence');
  nextTribunalDefense(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.phase, 'tribunal_vote', 'and only then the verdict');
});

/** Get a tribunal all the way to its vote. */
function toTribunalVote(m: XmMatch, aId: string, bId: string): XmMatch {
  forceTie(m, aId, bId);
  const live = getMatch(m.id)!;
  for (let i = 0; i < live.tribunal!.onTrial.length; i++) nextTribunalDefense(m.id, hostOf(m));
  return getMatch(m.id)!;
}

test('the accused do not vote on their own fate', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  const live = toTribunalVote(m, a!.userId, b!.userId);
  assert.equal(live.phase, 'tribunal_vote');

  assert.equal(tribunalVote(m.id, a!.userId, 'free'), null, 'not from the dock');
  assert.equal(tribunalVote(m.id, b!.userId, 'free'), null);

  const view = getSafeState(getMatch(m.id)!, a!.userId);
  assert.equal(view.tribunal!.iAmOnTrial, true);
  assert.equal(view.tribunal!.canVote, false);
  assert.equal(view.tribunal!.votesTotal, 8, 'ten alive, two in the dock');
});

test('a majority to punish takes both, and each gets their minute', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  const live = toTribunalVote(m, a!.userId, b!.userId);

  const jury = live.seats.filter(s => s.alive && s.userId !== a!.userId && s.userId !== b!.userId);
  jury.slice(0, 5).forEach(s => tribunalVote(m.id, s.userId, 'punish'));
  jury.slice(5).forEach(s => tribunalVote(m.id, s.userId, 'free'));

  const after = getMatch(m.id)!;
  assert.equal(after.seats.find(s => s.userId === a!.userId)!.alive, false);
  assert.equal(after.seats.find(s => s.userId === b!.userId)!.alive, false);
  assert.equal(after.phase, 'last_words');
  assert.equal(after.lastWordsQueue.length, 1, 'and the second is owed a farewell too');

  endLastWords(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.phase, 'last_words', 'the second one speaks');
});

test('anything short of a majority frees them both', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  const live = toTribunalVote(m, a!.userId, b!.userId);

  const jury = live.seats.filter(s => s.alive && s.userId !== a!.userId && s.userId !== b!.userId);
  jury.slice(0, 4).forEach(s => tribunalVote(m.id, s.userId, 'punish'));
  jury.slice(4).forEach(s => tribunalVote(m.id, s.userId, 'free'));

  const after = getMatch(m.id)!;
  assert.equal(after.seats.find(s => s.userId === a!.userId)!.alive, true);
  assert.equal(after.seats.find(s => s.userId === b!.userId)!.alive, true);
  assert.equal(after.tribunal, null, 'the tribunal is over');
  assert.equal(after.phase, 'day_announce', 'and the day moves on to the night');
});

test('a silent tribunal frees them', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  toTribunalVote(m, a!.userId, b!.userId);

  // Nobody voted and the clock ran out. Losing two of ten is the heavier
  // outcome; the burden sits with the side asking for it.
  endTribunalVote(m.id, null);
  const after = getMatch(m.id)!;
  assert.equal(after.seats.find(s => s.userId === a!.userId)!.alive, true);
  assert.equal(after.seats.find(s => s.userId === b!.userId)!.alive, true);
});

test('the running tally is not shown while people are still voting', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  const live = toTribunalVote(m, a!.userId, b!.userId);

  const jury = live.seats.filter(s => s.alive && s.userId !== a!.userId && s.userId !== b!.userId);
  tribunalVote(m.id, jury[0]!.userId, 'punish');

  // A live count would let the last voters work out exactly how many more are
  // needed, and the point of asking each of them is that they answer for
  // themselves.
  const view = getSafeState(getMatch(m.id)!, jury[1]!.userId);
  assert.equal(view.tribunal!.tally, null);
  assert.equal(view.tribunal!.votesCast, 1, 'how many have answered is fair; what they said is not');
  assert.equal(view.tribunal!.myVerdict, null);
  assert.equal(getSafeState(getMatch(m.id)!, jury[0]!.userId).tribunal!.myVerdict, 'punish', 'you see your own');
});

test('one verdict each, and no changing it', () => {
  const m = sportTable();
  endPlanNight(m.id, hostOf(m));
  const [a, b] = citizens(getMatch(m.id)!);
  const live = toTribunalVote(m, a!.userId, b!.userId);
  const juror = live.seats.find(s => s.alive && s.userId !== a!.userId && s.userId !== b!.userId)!;

  assert.ok(tribunalVote(m.id, juror.userId, 'punish'));
  assert.equal(tribunalVote(m.id, juror.userId, 'free'), null);
  assert.equal(getMatch(m.id)!.tribunal!.votes[juror.userId], 'punish');
});

// ── Winning ───────────────────────────────────────────────────────────────────

test('the town wins when the don and both mafia are gone', () => {
  const m = sportTable();
  const live = getMatch(m.id)!;
  don(live).alive = false;
  mafiosi(live).forEach(s => { s.alive = false; });

  // Any resolution re-checks; a quiet night is the cheapest way to trigger it.
  endPlanNight(m.id, hostOf(m));
  beginNight(m.id, hostOf(m));
  endNight(m.id, hostOf(m));
  assert.equal(getMatch(m.id)!.winner, 'town');
});

test('the mafia win at parity — three against three', () => {
  const m = sportTable();
  const live = getMatch(m.id)!;
  // Kill four citizens: three mafia-team against three town.
  citizens(live).slice(0, 3).forEach(s => { s.alive = false; });
  sheriff(live).alive = false;

  const alive = live.seats.filter(s => s.alive);
  assert.equal(alive.length, 6, 'three and three');

  endPlanNight(m.id, hostOf(m));
  beginNight(m.id, hostOf(m));
  const victim = citizens(getMatch(m.id)!).find(c => c.alive)!;
  const [m1, m2] = mafiosi(getMatch(m.id)!);
  teamShoots(getMatch(m.id)!, {
    [don(live).userId]: victim.userId,
    [m1!.userId]: victim.userId,
    [m2!.userId]: victim.userId,
  }, victim.userId);
  endNight(m.id, hostOf(m));

  assert.equal(getMatch(m.id)!.winner, 'mafia', 'three against two is over');
});
