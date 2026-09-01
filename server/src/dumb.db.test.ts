/**
 * დებილების ტესტი — the bank, the scoring and the board.
 *
 * Two things here are worth real tests and the rest is content.
 *
 * The first is that a client cannot score itself. Everything a quiz
 * leaderboard is for evaporates if the answers are readable or the score is
 * self-reported, and both mistakes look completely fine until somebody opens a
 * network tab. So the tests below submit deliberately dishonest answers —
 * invented question ids, the same question twelve times, a claimed score — and
 * check that none of them help.
 *
 * The second is that twelve questions drawn from sixty must not repeat between
 * consecutive runs, because that is the promise the size of the bank was chosen
 * to keep.
 *
 *   DUMB_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/dumb.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.DUMB_TEST_DATABASE_URL;
const skip = url ? false : 'set DUMB_TEST_DATABASE_URL to run the dumb-test tests';
if (url) process.env.DATABASE_URL = url;

type Svc = typeof import('./services/dumbService.js');
type Bank = typeof import('./services/dumbBank.js');
type Db = typeof import('./db.js');

let S: Svc;
let B: Bank;
let db: Db;

const A = 'dtu_alice';
const C = 'dtu_carol';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  S = await import('./services/dumbService.js');
  B = await import('./services/dumbBank.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[A, 'Alice'], [C, 'Carol']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🙂', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM dumb_attempts WHERE user_id LIKE 'dtu\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'dtu\\_%'`;
}

/** Answer a drawn test perfectly — only possible with the answers in hand. */
const perfect = (t: ReturnType<Bank['drawTest']>) =>
  t.map(q => ({ questionId: q.id, optionId: q.options[q.correct].id }));

/** Answer everything wrong, deliberately. */
const allWrong = (t: ReturnType<Bank['drawTest']>) =>
  t.map(q => ({ questionId: q.id, optionId: q.options[(q.correct + 1) % q.options.length].id }));

// ── The bank ──────────────────────────────────────────────────────────────────

test('every question is well formed', { skip }, () => {
  // Content, but the kind of content whose mistakes are invisible until a player
  // meets one: a question with three options, or a correct index off the end.
  const ids = new Set<string>();
  for (const q of B.BANK) {
    assert.equal(q.options.length, 4, `${q.id} has ${q.options.length} options`);
    assert.ok(q.correct >= 0 && q.correct < 4, `${q.id} points at option ${q.correct}`);
    assert.ok(q.text.trim().length > 5, `${q.id} has no question`);
    assert.ok(q.reveal.trim().length > 5, `${q.id} has no punchline, which is the point of it`);
    assert.ok(!ids.has(q.id), `${q.id} appears twice`);
    ids.add(q.id);
    const seen = new Set(q.options.map(o => o.text.trim()));
    assert.equal(seen.size, 4, `${q.id} repeats an option`);
    for (const o of q.options) assert.ok(o.text.trim().length > 0, `${q.id} has a blank option`);
  }
});

test('the bank is big enough for the promise it makes', { skip }, () => {
  /*
   * Twelve per test, and consecutive runs must not repeat. That needs at least
   * twenty-four; sixty is what makes a repeat unlikely across several runs
   * rather than merely impossible across two.
   */
  assert.ok(B.BANK.length >= B.QUESTIONS_PER_TEST * 4,
    `${B.BANK.length} questions for tests of ${B.QUESTIONS_PER_TEST}`);
});

test('the three questions this game was asked for are present', { skip }, () => {
  const shlag = B.byId('shlagbaumi');
  assert.ok(B.byId('holland_egg'), 'the Dutch quail egg is missing');
  assert.ok(B.byId('leri_film'), 'კუდიანი ლერი is missing');
  assert.ok(shlag, 'the boom barrier is missing');
  assert.match(shlag!.options[shlag!.correct].text, /შლაგ ბაუმ/,
    'the boom barrier answer is not Schlag Baum, which was the whole joke');
});

test('a drawn test is twelve distinct questions', { skip }, () => {
  const t = B.drawTest();
  assert.equal(t.length, B.QUESTIONS_PER_TEST);
  assert.equal(new Set(t.map(q => q.id)).size, t.length, 'a question was drawn twice');
});

test('options are shuffled, so the answer is not always in the same place', { skip }, () => {
  /*
   * Without this the correct answer sits at a fixed index forever and the game
   * becomes "remember that the boom barrier one is first" — a memory test, and
   * a worse one.
   */
  const positions = new Set<number>();
  for (let i = 0; i < 40; i++) {
    for (const q of B.drawTest()) if (q.id === 'shlagbaumi') positions.add(q.correct);
  }
  assert.ok(positions.size >= 3, `the answer only ever appeared at ${[...positions].join(',')}`);
});

test('a shuffled question still points at its own answer', { skip }, () => {
  // Shuffling that lost track of the correct index would silently make every
  // answer wrong, and the game would look like it worked.
  for (let i = 0; i < 30; i++) {
    for (const q of B.drawTest()) {
      const original = B.byId(q.id)!;
      assert.equal(
        q.options[q.correct].text,
        original.options[original.correct].text,
        `${q.id} lost its answer in the shuffle`,
      );
    }
  }
});

test('the next test avoids the questions just seen', { skip }, () => {
  // The promise the bank size exists to keep.
  const first = B.drawTest().map(q => q.id);
  const second = B.drawTest(first).map(q => q.id);
  const shared = second.filter(id => first.includes(id));
  assert.deepEqual(shared, [], `${shared.length} questions repeated straight away`);
});

test('an impossible exclusion gives a full test rather than a short one', { skip }, () => {
  // A repeat is a small disappointment; a nine-question test is a bug.
  const everything = B.BANK.map(q => q.id);
  assert.equal(B.drawTest(everything).length, B.QUESTIONS_PER_TEST);
});

// ── Scoring cannot be self-reported ───────────────────────────────────────────

test('the score is computed from the answers, not from what the client says', { skip }, async () => {
  const t = B.drawTest();
  const r = await S.submitAttempt(A, allWrong(t), 30_000);
  assert.equal(r.correct, 0, 'wrong answers scored');
  assert.equal(r.total, 12);

  const p = await S.submitAttempt(C, perfect(t), 30_000);
  assert.equal(p.correct, 12);
});

test('invented question ids score nothing', { skip }, async () => {
  const r = await S.submitAttempt(A, [
    { questionId: 'not_a_question', optionId: 'not_an_option' },
    { questionId: 'also_fake', optionId: 'x' },
  ], 1000);
  assert.equal(r.correct, 0);
  assert.equal(r.total, 0, 'a made-up question counted towards the total');
});

test('answering the same question repeatedly counts once', { skip }, async () => {
  /*
   * The cheapest attack there is: find one question you know and send it twelve
   * times. Distinct ids only, so it is worth exactly one mark.
   */
  const t = B.drawTest();
  const one = t[0];
  const spam = Array.from({ length: 12 }, () => ({
    questionId: one.id, optionId: one.options[one.correct].id,
  }));
  const r = await S.submitAttempt(A, spam, 500);
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
});

test('a skipped question is wrong, not ignored', { skip }, async () => {
  const t = B.drawTest();
  const r = await S.submitAttempt(A, t.map(q => ({ questionId: q.id, optionId: null })), 5000);
  assert.equal(r.correct, 0);
  assert.equal(r.total, 12, 'skipping shrank the denominator, which would inflate the ratio');
});

test('the breakdown carries the punchline for every question', { skip }, async () => {
  // The reveal is most of the joke; a result screen without it wastes the game.
  const t = B.drawTest();
  const r = await S.submitAttempt(A, allWrong(t), 9000);
  assert.equal(r.breakdown.length, 12);
  for (const b of r.breakdown) {
    assert.ok(b.reveal.length > 5, `${b.questionId} came back with no reveal`);
    assert.ok(b.correctText.length > 0);
    assert.equal(b.right, false);
  }
});

test('a preposterous duration is clamped rather than stored', { skip }, async () => {
  // Duration breaks ties on the board, so an unbounded one is a way to sit at
  // the top of every tie forever.
  const t = B.drawTest();
  const r = await S.submitAttempt(A, perfect(t), -5_000_000);
  assert.ok(r.durationMs >= 0, `stored ${r.durationMs}ms`);
});

// ── The board ─────────────────────────────────────────────────────────────────

test('the board ranks each player once, by their best', { skip }, async () => {
  /*
   * Ranking every attempt fills the board with whoever kept trying; ranking the
   * latest punishes somebody for playing again after a good run, which is
   * exactly the wrong incentive for a game meant to be replayed.
   */
  const t = B.drawTest();
  await S.submitAttempt(A, perfect(t), 20_000);
  await S.submitAttempt(A, allWrong(t), 20_000);
  await S.submitAttempt(A, allWrong(t), 20_000);

  const board = await S.getLeaderboard(null);
  const mine = board.filter(r => r.userId === A);
  assert.equal(mine.length, 1, 'one player appeared more than once');
  assert.equal(mine[0].correct, 12, 'the board showed the latest attempt rather than the best');
});

test('a faster run wins a tie', { skip }, async () => {
  const t = B.drawTest();
  await S.submitAttempt(A, perfect(t), 90_000);
  await S.submitAttempt(C, perfect(t), 30_000);

  const board = await S.getLeaderboard(null);
  const order = board.filter(r => r.userId.startsWith('dtu_')).map(r => r.userId);
  assert.deepEqual(order, [C, A], 'a tie was not broken on time');
  assert.equal(board[0].rank, 1);
});

test('the board is ordered and knows who is asking', { skip }, async () => {
  const t = B.drawTest();
  await S.submitAttempt(A, perfect(t), 40_000);
  await S.submitAttempt(C, allWrong(t), 10_000);

  const board = await S.getLeaderboard(A);
  const rows = board.filter(r => r.userId.startsWith('dtu_'));
  assert.ok(rows[0].correct >= rows[rows.length - 1].correct, 'the board is not sorted');
  assert.equal(rows.find(r => r.userId === A)!.isMe, true);
  assert.equal(rows.find(r => r.userId === C)!.isMe, false);
  assert.ok(rows[0].username.length > 0, 'the board has no names on it');
});

test('a rank is reported only for a run that became the best', { skip }, async () => {
  const t = B.drawTest();
  const good = await S.submitAttempt(A, perfect(t), 20_000);
  assert.equal(good.isBest, true);
  assert.ok(good.rank !== null && good.rank >= 1);

  const worse = await S.submitAttempt(A, allWrong(t), 20_000);
  assert.equal(worse.isBest, false);
  assert.equal(worse.rank, null, 'a worse run claimed a rank');
});

test('status reports plays, best and the questions to avoid next time', { skip }, async () => {
  const t = B.drawTest();
  await S.submitAttempt(A, perfect(t), 25_000);
  await S.submitAttempt(A, allWrong(t), 25_000);

  const s = await S.getStatus(A);
  assert.equal(s.plays, 2);
  assert.equal(s.best, 12);
  assert.equal(s.rank, 1);
  assert.equal(s.lastQuestionIds.length, 12, 'the last run left nothing to avoid');
  assert.equal(s.bankSize, B.BANK.length);
});

test('a player who has never played has a clean status', { skip }, async () => {
  const s = await S.getStatus(C);
  assert.equal(s.plays, 0);
  assert.equal(s.best, null);
  assert.equal(s.rank, null, 'somebody who never played was given a rank');
  assert.deepEqual(s.lastQuestionIds, []);
});

// ── Bands ─────────────────────────────────────────────────────────────────────

test('every score lands in a band, and the bands run the right way', { skip }, () => {
  const titles: string[] = [];
  for (let c = 0; c <= 12; c++) {
    const b = B.band(c, 12);
    assert.ok(b.title.length > 0 && b.note.length > 0, `${c}/12 has no band`);
    titles.push(b.title);
  }
  assert.notEqual(titles[0], titles[12], 'the best and worst scores read the same');
});
