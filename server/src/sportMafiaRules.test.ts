/**
 * The sport ruleset, on its own.
 *
 * These are the four rules that make sport a different game from the casual
 * hosted rules, tested where they live rather than through a whole match: blind
 * unanimous shooting, a don the sheriff cannot see, who may sit on a tribunal,
 * and what a tribunal decides. The match-level tests drive them through real
 * sockets; these pin the rules themselves.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  SPORT_SEATS, SPORT_ROLES, SPORT_CITIZENS, canStartSport,
  sheriffSees, agreedTarget, teamHasActed, tribunalElectorate, tribunalVerdict,
} from './services/sportMafiaRules.js';

// ── Composition ───────────────────────────────────────────────────────────────

test('ten seats, and the split adds up to exactly ten', () => {
  assert.equal(SPORT_SEATS, 10);
  const { don, mafia, sheriff, doctor, maniac, cult } = SPORT_ROLES;
  assert.equal(don, 1);
  assert.equal(mafia, 2);
  assert.equal(sheriff, 1);
  assert.equal(doctor + maniac + cult, 0, 'sport has no optional roles at all');
  assert.equal(SPORT_CITIZENS, 6);
  assert.equal(don + mafia + sheriff + SPORT_CITIZENS, SPORT_SEATS);
});

test('the mafia team is three against seven', () => {
  const team = SPORT_ROLES.don + SPORT_ROLES.mafia;
  assert.equal(team, 3);
  assert.equal(SPORT_SEATS - team, 7, 'and parity is four eliminations away');
});

// ── Starting ──────────────────────────────────────────────────────────────────

test('sport needs the don card AND ten players, and says which is missing', () => {
  assert.equal(canStartSport(10, true).ok, true);

  const noDon = canStartSport(10, false);
  assert.equal(noDon.ok, false);
  assert.match(noDon.reason!, /დონის კარტი/);

  const nineHanded = canStartSport(9, true);
  assert.equal(nineHanded.ok, false);
  assert.match(nineHanded.reason!, /9/, 'the message says what the table actually has');

  // Eleven is refused as firmly as nine. The role split and the parity maths
  // are built on ten; more is not "closer to right".
  assert.equal(canStartSport(11, true).ok, false);
  assert.equal(canStartSport(4, true).ok, false);
  assert.equal(canStartSport(0, true).ok, false);
});

// ── The sheriff's check ───────────────────────────────────────────────────────

test('the sheriff finds mafia, and never the don', () => {
  assert.equal(sheriffSees('mafia'), true);
  // The single line that makes the don worth being. Under the casual rules
  // `isMafiaRole` answers this and the don is caught like anyone else.
  assert.equal(sheriffSees('don'), false, 'the don reads as a citizen');
  assert.equal(sheriffSees('sheriff'), false);
  assert.equal(sheriffSees('citizen'), false);
  assert.equal(sheriffSees(null), false, 'a seat with no card is not a lead');
});

// ── The blind shot ────────────────────────────────────────────────────────────

const team = (...ids: string[]) => ids.map(userId => ({ userId }));

test('a kill lands only when the whole team pressed the same name', () => {
  const three = team('don', 'm1', 'm2');
  assert.equal(agreedTarget(three, { don: 'v', m1: 'v', m2: 'v' }), 'v');
});

test('one disagreement wastes the night', () => {
  const three = team('don', 'm1', 'm2');
  // No plurality, no don tiebreak — that is the casual rule and it would hand
  // back the coordination this mode is built to take away.
  assert.equal(agreedTarget(three, { don: 'v', m1: 'v', m2: 'other' }), null);
  assert.equal(agreedTarget(three, { don: 'a', m1: 'b', m2: 'c' }), null);
});

test('one silence wastes the night too', () => {
  const three = team('don', 'm1', 'm2');
  assert.equal(agreedTarget(three, { don: 'v', m1: 'v' }), null, 'm2 never pressed');
  assert.equal(agreedTarget(three, {}), null);
});

test('a team of one still has to press', () => {
  // Late game: two of the three are dead. The rule does not soften.
  assert.equal(agreedTarget(team('m1'), { m1: 'v' }), 'v');
  assert.equal(agreedTarget(team('m1'), {}), null);
});

test('a dead team kills nobody', () => {
  assert.equal(agreedTarget([], { someone: 'v' }), null);
});

test('acting and agreeing are different questions', () => {
  const three = team('don', 'm1', 'm2');
  const split = { don: 'a', m1: 'b', m2: 'c' };
  // All three are finished; they simply wasted it. The night must still close,
  // or a disagreeing team would hang the game forever.
  assert.equal(teamHasActed(three, split), true);
  assert.equal(agreedTarget(three, split), null);

  assert.equal(teamHasActed(three, { don: 'a', m1: 'b' }), false, 'one still to act');
});

// ── Tribunal ──────────────────────────────────────────────────────────────────

const seat = (userId: string, alive = true) => ({ userId, alive });

test('the players on trial do not vote on their own fate', () => {
  const seats = [seat('a'), seat('b'), seat('c'), seat('d'), seat('dead', false)];
  const voters = tribunalElectorate(seats, ['a', 'b']).map(s => s.userId);
  assert.deepEqual(voters, ['c', 'd'], 'the accused are out, and so are the dead');
});

test('an empty electorate is possible and is not a crash', () => {
  // Two on trial and nobody else alive. The verdict rule has to answer it.
  const seats = [seat('a'), seat('b')];
  assert.deepEqual(tribunalElectorate(seats, ['a', 'b']), []);
  assert.equal(tribunalVerdict(0, 0), 'free');
});

test('punishing two players needs a real majority', () => {
  assert.equal(tribunalVerdict(3, 2), 'punish');
  assert.equal(tribunalVerdict(5, 0), 'punish');

  // Everything short of that frees them. Losing two players out of ten is the
  // heavier outcome, so the burden sits with the side asking for it.
  assert.equal(tribunalVerdict(2, 3), 'free');
  assert.equal(tribunalVerdict(2, 2), 'free', 'a tied tribunal frees them');
  assert.equal(tribunalVerdict(0, 0), 'free', 'and so does a silent one');
});
