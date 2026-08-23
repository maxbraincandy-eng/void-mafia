import { test } from 'node:test';
import { strict as assert } from 'assert';
import { parseCards } from './cards.js';
import { evaluate5, evaluateBest, compareHands, HandCategory, describeHand } from './evaluator.js';

const v = (text: string) => evaluateBest(parseCards(text));

test('every category is recognised', () => {
  assert.equal(v('As Ks Qs Js Ts').category, HandCategory.RoyalFlush);
  assert.equal(v('9h 8h 7h 6h 5h').category, HandCategory.StraightFlush);
  assert.equal(v('7c 7d 7h 7s 2c').category, HandCategory.FourOfAKind);
  assert.equal(v('Kc Kd Kh 4s 4c').category, HandCategory.FullHouse);
  assert.equal(v('Ad Jd 9d 6d 3d').category, HandCategory.Flush);
  assert.equal(v('9c 8d 7h 6s 5c').category, HandCategory.Straight);
  assert.equal(v('Qc Qd Qh 8s 3c').category, HandCategory.ThreeOfAKind);
  assert.equal(v('Jc Jd 5h 5s 9c').category, HandCategory.TwoPair);
  assert.equal(v('Tc Td 8h 5s 2c').category, HandCategory.OnePair);
  assert.equal(v('Ac Jd 8h 5s 2c').category, HandCategory.HighCard);
});

test('the wheel is a straight, and the smallest one', () => {
  const wheel = v('Ac 2d 3h 4s 5c');
  assert.equal(wheel.category, HandCategory.Straight);
  assert.equal(wheel.ranks[0], 5, 'the ace plays low, so the five is the high card');
  assert.ok(compareHands(v('6c 5d 4h 3s 2c'), wheel) > 0, 'six-high beats the wheel');
  const steelWheel = v('Ah 2h 3h 4h 5h');
  assert.equal(steelWheel.category, HandCategory.StraightFlush);
  assert.ok(compareHands(v('6h 5h 4h 3h 2h'), steelWheel) > 0);
});

test('kickers decide when the made hand is identical', () => {
  assert.ok(compareHands(v('Ac Ad Kh 7s 2c'), v('Ac Ad Qh 7s 2c')) > 0, 'king kicker beats queen');
  assert.ok(compareHands(v('9c 9d 8h 8s Ac'), v('9c 9d 8h 8s Kc')) > 0, 'two pair, ace kicker');
  assert.equal(compareHands(v('Ac Ad Kh 7s 2c'), v('Ah As Kd 7c 2h')), 0, 'same hand, different suits, tie');
});

test('the best five of seven are found even when they are not the obvious five', () => {
  // Two pair on the board plus a bigger pair in hand: the best hand is the
  // higher two pair with the ace kicker, not the three pairs.
  const value = v('As Ah 9c 9d 4s 4h 2c');
  assert.equal(value.category, HandCategory.TwoPair);
  assert.deepEqual(value.ranks, [14, 9, 4]);

  // A flush that uses only one hole card.
  const flush = v('Kd 2c 9d 7d 5d 3d Ah');
  assert.equal(flush.category, HandCategory.Flush);
  assert.deepEqual(flush.ranks, [13, 9, 7, 5, 3]);

  // A straight that runs through the board, with a higher one available.
  const straight = v('Ts 9h 8c 7d 6s 2c 3h');
  assert.equal(straight.category, HandCategory.Straight);
  assert.equal(straight.ranks[0], 10);
});

test('a full house is read as trips over pair, and beats a flush', () => {
  const boat = v('Kc Kd Kh 4s 4c 2h 3d');
  assert.equal(boat.category, HandCategory.FullHouse);
  assert.deepEqual(boat.ranks, [13, 4]);
  assert.ok(compareHands(boat, v('Ad Jd 9d 6d 3d 2c 4h')) > 0);
  // Two sets on board: the higher trips must be chosen, with the other as pair.
  const twoSets = v('9c 9d 9h 5s 5c 5d 2h');
  assert.deepEqual(twoSets.ranks, [9, 5]);
});

test('category order is total and matches the rules', () => {
  const ladder = [
    'Ac Jd 8h 5s 2c',   // high card
    'Tc Td 8h 5s 2c',   // pair
    'Jc Jd 5h 5s 9c',   // two pair
    'Qc Qd Qh 8s 3c',   // trips
    '9c 8d 7h 6s 5c',   // straight
    'Ad Jd 9d 6d 3d',   // flush
    'Kc Kd Kh 4s 4c',   // full house
    '7c 7d 7h 7s 2c',   // quads
    '9h 8h 7h 6h 5h',   // straight flush
    'As Ks Qs Js Ts',   // royal
  ].map(v);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(compareHands(ladder[i]!, ladder[i - 1]!) > 0, `${describeHand(ladder[i]!)} must beat ${describeHand(ladder[i - 1]!)}`);
  }
});

test('evaluate5 rejects anything that is not five cards', () => {
  assert.throws(() => evaluate5(parseCards('As Ks Qs Js')), /five/);
});

test('descriptions read like a person announcing the hand', () => {
  assert.equal(describeHand(v('Kc Kd Kh 4s 4c')), 'Full House, kings full of fours');
  assert.equal(describeHand(v('As Ks Qs Js Ts')), 'Royal Flush');
  assert.equal(describeHand(v('Jc Jd 5h 5s 9c')), 'Two Pair, jacks and fives');
  assert.equal(describeHand(v('6c 6d 2h 5s 9c')), 'One Pair, sixes');
});
