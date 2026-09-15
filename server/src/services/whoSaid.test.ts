/**
 * ვინ თქვა? — the secret, the rotation, and the scoring.
 *
 * Three things, and every one of them fails in a way that looks completely
 * normal from inside a game.
 *
 * The SECRET: if the reader's identity reaches any other client, every round
 * still plays out — people still read, still vote, still see a reveal — and
 * the game is simply over as a game. Nothing on screen says so.
 *
 * The ROTATION: with a random reader each round somebody reads three times in
 * six and somebody never reads at all, and the player who never read has not
 * actually played. You only notice after the match.
 *
 * The SCORING: arithmetic nobody can check in their head while a round is
 * running, on a board they will absolutely argue about afterwards.
 */

import { test, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

import {
  createMatch, joinMatch, startMatch, beginVoting, castVote, finishRound,
  nextRound, rematch, leaveMatch, getMatch, getSafeState, listMatches,
  MIN_PLAYERS, __reset, type WhoSaidMatch,
} from './whoSaidService.js';
import {
  PHRASES, pickReader, scoreRound, pickPhrase,
  POINTS_CORRECT_GUESS, POINTS_PER_FOOLED,
} from './whoSaidPhrases.js';

beforeEach(() => { __reset(); });

/** A match with `n` players, seated, ready to start. */
function table(n: number): WhoSaidMatch {
  const m = createMatch('u0', 's0', 'P0', { rounds: 6 });
  for (let i = 1; i < n; i++) joinMatch(m.id, `u${i}`, `s${i}`, `P${i}`);
  return m;
}

const others = (m: WhoSaidMatch) => m.players.filter(p => p.userId !== m.readerId);

// ── the phrases ─────────────────────────────────────────────────────────────

test('every phrase is short enough to read in one breath', () => {
  // A long line lets the reader settle back into their own voice, which is the
  // one thing the game is about hiding.
  for (const p of PHRASES) {
    assert.ok(p.length <= 70, `"${p}" is ${p.length} characters`);
    assert.ok(p.length >= 14, `"${p}" is too short to disguise a voice`);
  }
});

test('no phrase is repeated in the bank', () => {
  assert.equal(new Set(PHRASES).size, PHRASES.length);
});

test('the bank outlasts the longest match', () => {
  // Twenty rounds is the cap, and a phrase heard twice tells the room more
  // about the reader than about the voice.
  assert.ok(PHRASES.length >= 20, `only ${PHRASES.length} phrases`);
});

test('a phrase is not handed out twice in one match', () => {
  const used: number[] = [];
  for (let i = 0; i < PHRASES.length; i++) {
    const p = pickPhrase(used);
    assert.ok(!used.includes(p), `phrase ${p} came round again after ${i} rounds`);
    used.push(p);
  }
});

// ── the secret ──────────────────────────────────────────────────────────────

test('the phrase goes to the reader and to nobody else', () => {
  const m = table(5);
  startMatch(m.id, 'u0');
  const reader = m.readerId!;
  for (const p of m.players) {
    const view = getSafeState(m, p.userId);
    if (p.userId === reader) {
      assert.ok(view.phrase, 'the reader was not given the line');
      assert.equal(view.youAreReading, true);
    } else {
      assert.equal(view.phrase, null, `${p.userId} can see the line`);
      assert.equal(view.youAreReading, false, `${p.userId} was told they are reading`);
    }
  }
});

test('a non-reader cannot tell who is reading, whoever it is', () => {
  /*
   * Every player's id is necessarily in the state — you have to be able to
   * vote for them — so "the reader's id is absent" is not the property. The
   * property is that the view does not DEPEND on who the reader is: swap the
   * reader for somebody else and a bystander's payload must come back byte for
   * byte the same. Anything that marked the reader out would change it.
   */
  const m = table(5);
  startMatch(m.id, 'u0');
  const bystander = m.players.find(p => p.userId !== m.readerId && p.userId !== m.hostId)!;
  const before = JSON.stringify(getSafeState(m, bystander.userId));

  const elsewhere = m.players.find(p => p.userId !== m.readerId && p.userId !== bystander.userId)!;
  m.readerId = elsewhere.userId;
  const after = JSON.stringify(getSafeState(m, bystander.userId));

  assert.equal(after, before, 'a bystander\'s state changes with who is reading');
});

test('no phrase reaches anybody but the reader', () => {
  const m = table(5);
  startMatch(m.id, 'u0');
  for (const p of m.players.filter(x => x.userId !== m.readerId)) {
    const asText = JSON.stringify(getSafeState(m, p.userId));
    for (const phrase of PHRASES) {
      assert.ok(!asText.includes(phrase), `${p.userId}'s state leaks a phrase`);
    }
  }
});

test('the reader stops being sent the line once voting opens', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  assert.equal(getSafeState(m, m.readerId!).phrase, null,
    'the line was still in the payload during the vote');
});

test('who somebody voted for is private until the reveal', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  const [a, b] = others(m);
  castVote(m.id, a!.userId, b!.userId);

  const view = getSafeState(m, b!.userId);
  assert.equal(view.players.find(p => p.userId === a!.userId)!.hasVoted, true,
    'that somebody has voted should be public');
  const asText = JSON.stringify(view.players);
  assert.ok(!asText.includes('"vote"'), 'a vote target is in the public player list');
  assert.equal(getSafeState(m, a!.userId).yourVote, b!.userId, 'a voter cannot see their own vote');
});

// ── the rotation ────────────────────────────────────────────────────────────

test('nobody reads twice before everybody has read once', () => {
  const m = table(5);
  startMatch(m.id, 'u0');
  const order: string[] = [m.readerId!];
  for (let r = 1; r < 5; r++) {
    finishRound(m);
    nextRound(m.id, 'u0');
    order.push(m.readerId!);
  }
  assert.equal(new Set(order).size, 5, `five rounds gave readers ${order.join(', ')}`);
});

test('nobody reads twice in a row', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  let prev = m.readerId!;
  for (let r = 1; r < 12; r++) {
    finishRound(m);
    m.rounds = 99;                       // keep going past the configured length
    nextRound(m.id, 'u0');
    assert.notEqual(m.readerId, prev, `${m.readerId} read twice running`);
    prev = m.readerId!;
  }
});

test('reading stays even over a long match', () => {
  const m = table(4);
  m.rounds = 99;
  startMatch(m.id, 'u0');
  for (let r = 1; r < 20; r++) { finishRound(m); nextRound(m.id, 'u0'); }
  const counts = m.players.map(p => p.timesRead);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1,
    `reads came out ${counts.join('/')}`);
});

test('a player who has left is not handed the line', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  const victim = others(m)[0]!.userId;
  leaveMatch(m.id, victim);
  for (let r = 0; r < 8; r++) {
    finishRound(m);
    m.rounds = 99;
    nextRound(m.id, 'u0');
    assert.notEqual(m.readerId, victim, 'a disconnected player was made the reader');
  }
});

test('the rotation rule itself', () => {
  const P = (id: string, seat: number, timesRead: number, connected = true) =>
    ({ userId: id, seat, timesRead, connected });
  // Fewest reads wins.
  assert.equal(pickReader([P('a', 0, 2), P('b', 1, 0), P('c', 2, 1)], null), 'b');
  // Ties break on seat, so the choice is stable rather than arbitrary.
  assert.equal(pickReader([P('a', 1, 0), P('b', 0, 0)], null), 'b');
  // The previous reader is excluded even when they have read least.
  assert.equal(pickReader([P('a', 0, 0), P('b', 1, 5)], 'a'), 'b');
  // Disconnected players are not eligible.
  assert.equal(pickReader([P('a', 0, 0, false), P('b', 1, 9)], null), 'b');
  // Everybody but the last reader has gone: they read again rather than nobody.
  assert.equal(pickReader([P('a', 0, 3)], 'a'), 'a');
  assert.equal(pickReader([], null), null);
});

// ── the scoring ─────────────────────────────────────────────────────────────

test('a correct guess is worth two and the reader gets nothing for it', () => {
  const s = scoreRound('r', { a: 'r', b: 'r' });
  assert.deepEqual(s.correct.sort(), ['a', 'b']);
  assert.equal(s.fooled, 0);
  assert.equal(s.points['a'], POINTS_CORRECT_GUESS);
  assert.equal(s.points['b'], POINTS_CORRECT_GUESS);
  assert.equal(s.points['r'], undefined, 'the reader was paid for being caught');
});

test('the reader is paid per player fooled', () => {
  // Three voters, one right: the reader fooled two.
  const s = scoreRound('r', { a: 'r', b: 'c', c: 'b' });
  assert.equal(s.fooled, 2);
  assert.equal(s.points['r'], 2 * POINTS_PER_FOOLED);
  assert.equal(s.points['a'], POINTS_CORRECT_GUESS);
  assert.equal(s.points['b'], undefined);
});

test('fooling a big room is worth more than fooling a small one', () => {
  /*
   * A flat bonus for escaping makes a six-player round and a three-player one
   * worth the same, and staying hidden among six is much harder.
   */
  const small = scoreRound('r', { a: 'b', b: 'a' });
  const big = scoreRound('r', { a: 'b', b: 'a', c: 'a', d: 'b', e: 'a' });
  assert.ok(big.points['r']! > small.points['r']!,
    `five fooled paid ${big.points['r']}, two paid ${small.points['r']}`);
});

test('a reader who somehow votes is ignored', () => {
  const s = scoreRound('r', { r: 'a', a: 'r' });
  assert.equal(s.fooled, 0, 'the reader\'s own vote counted as fooling somebody');
  assert.equal(s.points['r'], undefined);
});

test('a round with no votes at all pays nobody', () => {
  const s = scoreRound('r', {});
  assert.equal(s.fooled, 0);
  assert.deepEqual(s.points, {});
  assert.deepEqual(s.correct, []);
});

test('scores land on the players', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  const rest = others(m);
  castVote(m.id, rest[0]!.userId, m.readerId!);          // right
  castVote(m.id, rest[1]!.userId, rest[2]!.userId);      // wrong
  castVote(m.id, rest[2]!.userId, rest[1]!.userId);      // wrong

  assert.equal(m.status, 'reveal', 'the round did not close once everybody had voted');
  assert.equal(m.players.find(p => p.userId === rest[0]!.userId)!.score, POINTS_CORRECT_GUESS);
  assert.equal(m.players.find(p => p.userId === m.readerId)!.score, 2 * POINTS_PER_FOOLED);
  assert.equal(m.reveal!.fooled, 2);
});

// ── the rules around a round ────────────────────────────────────────────────

test('the reader cannot vote', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  assert.equal(castVote(m.id, m.readerId!, others(m)[0]!.userId), null,
    'the reader was allowed to vote');
});

test('nobody can vote for themselves', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  const voter = others(m)[0]!.userId;
  assert.equal(castVote(m.id, voter, voter), null);
});

test('a vote for somebody who is not in the match is refused', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  /*
   * Stored rather than refused, this would be scored as "not the reader" and
   * silently become a point for the reader — a player could hand them points
   * by voting for a name that does not exist.
   */
  assert.equal(castVote(m.id, others(m)[0]!.userId, 'nobody'), null);
  assert.equal(m.reveal, null);
});

test('a vote before the vote opens is refused', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  assert.equal(m.status, 'reading');
  assert.equal(castVote(m.id, others(m)[0]!.userId, m.readerId!), null);
});

test('the round closes by itself once everybody able to vote has', () => {
  const m = table(3);
  startMatch(m.id, 'u0');
  beginVoting(m.id, 'u0');
  const rest = others(m);
  castVote(m.id, rest[0]!.userId, m.readerId!);
  assert.equal(m.status, 'voting', 'the round closed on the first vote');
  castVote(m.id, rest[1]!.userId, m.readerId!);
  assert.equal(m.status, 'reveal');
});

test('only the host or the reader may cut the reading short', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  const bystander = m.players.find(p => p.userId !== m.hostId && p.userId !== m.readerId)!;
  assert.equal(beginVoting(m.id, bystander.userId), null, 'a bystander ended the reading');
  assert.ok(beginVoting(m.id, m.readerId!), 'the reader could not end their own reading');
});

test('a match will not start under three players', () => {
  const m = table(MIN_PLAYERS - 1);
  assert.equal(startMatch(m.id, 'u0'), null);
  joinMatch(m.id, 'uX', 'sX', 'PX');
  assert.ok(startMatch(m.id, 'u0'));
});

test('only the host starts, and nobody joins mid-match', () => {
  const m = table(4);
  assert.equal(startMatch(m.id, 'u1'), null, 'a guest started the match');
  startMatch(m.id, 'u0');
  assert.equal(joinMatch(m.id, 'late', 'sl', 'Late'), null, 'somebody joined mid-match');
});

test('a reconnecting player keeps their seat and their score', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  const p = others(m)[0]!;
  p.score = 7;
  leaveMatch(m.id, p.userId);
  const back = joinMatch(m.id, p.userId, 'new-socket', p.nickname);
  assert.ok(back, 'a returning player could not get back in');
  assert.equal(back!.isNew, false);
  assert.equal(m.players.find(x => x.userId === p.userId)!.score, 7);
  assert.equal(m.players.find(x => x.userId === p.userId)!.connected, true);
});

test('an empty room stops being advertised', () => {
  const m = table(3);
  assert.equal(listMatches().length, 1);
  for (const p of [...m.players]) leaveMatch(m.id, p.userId);
  assert.equal(listMatches().length, 0, 'a room nobody is in is still listed');
});

test('a rematch clears the scores and the phrases', () => {
  const m = table(4);
  startMatch(m.id, 'u0');
  finishRound(m);
  rematch(m.id, 'u0');
  assert.equal(m.status, 'waiting');
  assert.equal(m.round, 0);
  assert.deepEqual(m.usedPhrases, []);
  assert.ok(m.players.every(p => p.score === 0 && p.timesRead === 0));
});

test('the match ends after the configured number of rounds', () => {
  const m = table(4);
  m.rounds = 3;
  startMatch(m.id, 'u0');
  for (let r = 0; r < 3; r++) {
    finishRound(m);
    nextRound(m.id, 'u0');
  }
  assert.equal(getMatch(m.id)!.status, 'finished', `ended at round ${m.round} of ${m.rounds}`);
});
