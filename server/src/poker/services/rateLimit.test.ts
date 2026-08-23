import { test } from 'node:test';
import { strict as assert } from 'assert';

import { RateLimiter, POKER_LIMITS } from './rateLimit.js';
import { ManualClock } from './clock.js';

test('a burst is allowed, a flood is not', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter(POKER_LIMITS, clock);

  const capacity = POKER_LIMITS.action!.capacity;
  for (let i = 0; i < capacity; i++) {
    assert.ok(limiter.take('p1', 'action'), `burst message ${i + 1} should pass`);
  }
  assert.equal(limiter.take('p1', 'action'), false, 'and then the bucket is empty');
});

test('the bucket refills at the stated rate, not faster', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter({ action: { capacity: 4, refillPerSecond: 2 } }, clock);

  while (limiter.take('p1', 'action')) { /* drain */ }

  clock.advance(499);
  assert.equal(limiter.take('p1', 'action'), false, 'half a token is not a token');

  clock.advance(2);
  assert.ok(limiter.take('p1', 'action'), 'one token, one message');
  assert.equal(limiter.take('p1', 'action'), false);

  clock.advance(10_000);
  let allowed = 0;
  while (limiter.take('p1', 'action')) allowed += 1;
  assert.equal(allowed, 4, 'and it never refills past capacity');
});

test('limits are per player and per action', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter(POKER_LIMITS, clock);

  while (limiter.take('p1', 'chat')) { /* drain p1's chat */ }

  assert.ok(limiter.take('p2', 'chat'), 'one player cannot mute another');
  assert.ok(limiter.take('p1', 'action'), 'and spamming chat does not stop them playing');
});

test('an unknown action fails closed', () => {
  const limiter = new RateLimiter(POKER_LIMITS, new ManualClock());
  assert.equal(limiter.take('p1', 'poker:secret_backdoor'), false);
});

test('retryAfter tells the client when to come back', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter({ chat: { capacity: 2, refillPerSecond: 0.5 } }, clock);

  while (limiter.take('p1', 'chat')) { /* drain */ }
  assert.equal(limiter.retryAfter('p1', 'chat'), 2, 'two seconds at half a token a second');

  clock.advance(2_000);
  assert.ok(limiter.take('p1', 'chat'), 'and the advice was correct');
});

test('idle buckets are swept, so a busy night is not a memory leak', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter(POKER_LIMITS, clock);

  for (let i = 0; i < 500; i++) limiter.take(`p${i}`, 'action');
  assert.equal(limiter.size, 500);

  clock.advance(120_000);
  limiter.take('trigger', 'action');
  assert.ok(limiter.size < 10, `expected the sweep to clear refilled buckets, ${limiter.size} left`);
});

test('a reconnect does not reset a limit', () => {
  const clock = new ManualClock();
  const limiter = new RateLimiter(POKER_LIMITS, clock);

  while (limiter.take('p1', 'action')) { /* drain */ }
  // The socket id changed, the profile did not — and the limiter is keyed on
  // the profile precisely so reconnecting is not a way round it.
  assert.equal(limiter.take('p1', 'action'), false);
});
