# Social Poker — running, testing, deploying

## 1. Running the tests

The engine has no I/O, so its tests need no database, no server and no network.
From `server/`:

```bash
npx tsx --test "src/poker/**/*.test.ts"      # or: npm run test:poker
```

Current output:

```
# tests 65
# pass 65
# fail 0
```

What the 65 cover:

| File | Tests | What they pin down |
|---|---|---|
| `engine/evaluator.test.ts` | 8 | every category, the wheel (A-2-3-4-5), best-5-of-7, kicker comparisons, tie detection, a randomised sweep asserting the ranking is a total order |
| `engine/pots.test.ts` | 10 | main/side pot construction, folded chips staying in the pot, uncallable bets, split pots, odd chips clockwise from the button, plus a 500-case sweep asserting chips in == chips out |
| `engine/state.test.ts` | 14 | blinds (full ring and heads-up), the big-blind option, min-raise, a short all-in not re-opening the betting, run-outs, uncontested pots, timeouts, and a 1000-hand random soak asserting every hand terminates, chips are conserved, and payouts equal the pot |
| `compliance.test.ts` | 4 | the shipped capabilities are social-only, the boot assertion throws on any money-shaped capability, the notice is editable but the facts are not, the economy provider throws on transfer and redeem |
| `services/tableService.test.ts` | 21 | seating and buy-in, the pre-deal pause, button rotation, replayed and out-of-turn actions, the action clock to the millisecond, disconnect grace and reconnect, rebuy rules, host-leave closing, hand histories, chip conservation over 40 hands, timer cleanup |
| `services/views.test.ts` | 8 | the information rule over 200 hands, card counts without faces, the seed withheld until settlement, observers, whose options are published, the mid-hand stack, lobby rows, private tables |

### The information test

`views.test.ts` asserts one sentence directly:

> a card belonging to seat X appears in the payload sent to viewer Y if and only
> if X === Y, or the hand has ended and X had to show.

It plays 200 hands of mixed folds, calls and raises across 25 seeds and checks
**every** state payload emitted along the way — not the final one, all of them,
because a leak on the turn that is gone by the river is still a leak. It counts
what it checked and fails if the sample is small or if no cards were ever sent,
so it cannot pass by vacuum.

It has been mutation-checked: allowing cards through on the river makes it fail.
Do that again after any change to `views.ts` — a test that guards a security
property is worth nothing until you have watched it fail.

### The clock

`ManualClock` makes the timers testable without waiting. A test advances to one
millisecond before the deadline and asserts the player still has the turn, then
advances two more and asserts they folded. Deadlines are read from the view
rather than recomputed in the test, so a clock that is *displayed* wrong fails
too, not just one that fires wrong.

The two sweeps are the important ones. Hand-written cases prove the cases
someone thought of; the soak runs a thousand random hands through the real state
machine and asserts three invariants that must hold for any hand of poker
whatsoever — it terminates, no chip is created or destroyed, and every chip in
the pot is paid to somebody. A rule bug that survives both is a rare thing.

Determinism: tests use `seededRandomness(seed)` (xorshift32) rather than the
CSPRNG, so a failure is reproducible from its seed. Production always uses
`cryptoRandomness`; `seededRandomness` is never reachable from a running table.

### Writing a new engine test

```ts
import { test } from 'node:test';
import { strict as assert } from 'assert';
import { startHand, applyAction } from './state.js';
import { seededRandomness } from './cards.js';

test('what must be true', () => {
  const hand = startHand({
    tableId: 't1', handId: 'h1', buttonSeat: 0,
    seats: [{ playerId: 'a', seat: 0, stack: 1000 }, { playerId: 'b', seat: 1, stack: 1000 }],
    blinds: { small: 10, big: 20, ante: 0 },
    rng: seededRandomness(42),
  });
  applyAction(hand, { playerId: 'a', type: 'call' });
  assert.equal(hand.street, 'PRE_FLOP');
});
```

Rule: a test asserts an outcome of the engine, never the shape of a payload. If
a test needs to know about sockets, it belongs in the integration suite, not
here.

## 2. Integration and load testing (stages 4 and 9)

The method already used across this repo for multiplayer changes, and what
poker will use:

```bash
# real Postgres, port 5433
chmod o+x /tmp/claude-0
su postgres -c "pg_ctl -D $SP/pgdata -o '-p 5433' -l $SP/pg.log start"

# real server
cd server && DATABASE_URL=postgres://postgres@localhost:5433/void PORT=4599 npx tsx src/index.ts

# real clients — socket.io-client, run from client/ for module resolution
cd client && node ../scripts/poker-e2e.mjs
```

Integration tests to be written with the socket layer (stage 4):

* six clients seat, play twenty hands, every client's view agrees with the
  server's hand history;
* a client that drops mid-hand and reconnects gets its own cards back and
  nobody else's;
* a client that replays a captured `poker:action` packet is rejected with
  `SEQ_MISMATCH` and the pot is unchanged;
* a client that sends an action out of turn is rejected with `OUT_OF_TURN`;
* a client that raises to a number larger than its stack has the raise capped,
  not honoured;
* a hand where the payload of every socket is captured and asserted to contain
  no card belonging to another seat, on every street.

That last one is the test that matters most: it is the automated version of
"the client cannot see what it should not see", and it should run on every
change to the view builder.

Load testing (stage 9): N headless clients over M tables, measuring action
round-trip latency, memory per live table, and broadcast fan-out. The target
that matters is per-table memory, since tables live in process memory and one
process owns them all until the Redis-backed store in §3 exists.

## 3. Deployment

Poker ships inside the existing single Railway service. There is no separate
process, port, database or build.

The repository commits its build output (`server/dist`, `client/dist`) and the
Nixpacks build phase is a no-op, so deploying is: build locally, verify the
artifact, commit, push.

```bash
# 1. bump the version so the deploy is observable
#    client/src/version.ts and CLIENT_BUILD in server/src/index.ts

# 2. build
cd client && npm run build
cd ../server && npx tsc

# 3. verify the compiled output is complete and consistent
node server/scripts/check-dist.mjs

# 4. commit and push (branch, then main)
git add -A && git commit -m "..." && git push -u origin <branch>

# 5. confirm the deploy actually went out
curl -s https://voidmafia.one/api/version
```

`src/**/*.test.ts` is excluded in `server/tsconfig.json`, so test files never
reach `dist` and `node:test` never has to exist in production.

### Boot order

`assertSocialOnly()` runs at boot, before any poker route or socket handler is
registered. If any money-shaped capability has been enabled it throws and the
process does not start. A misconfigured deploy fails visibly instead of serving
a "no monetary value" notice over code that contradicts it.

### Rollout

Poker is behind a feature flag, default **off** (`POKER_ENABLED`, and a row in
the existing `app_settings` table so it can be flipped without a deploy). Off
means the lobby entry is absent, the socket handlers are not registered, and the
tables are not created. Turning it on is one setting; turning it off during an
incident is the same setting, and live tables close cleanly rather than
vanishing mid-hand.

## 4. Security risks, per module

Stated per the brief. These are the risks I would actually raise in review, not
a checklist.

**`engine/cards.ts`** — the shuffle. Risk: someone swaps `crypto.randomInt` for
`Math.random` during a refactor because it is faster and the tests still pass,
since a seeded generator is a legitimate test path. Mitigation: `seededRandomness`
is named for what it is, production constructs `Deck` with the default, and the
commitment hash gives an after-the-fact record. Residual risk: a
`Math.random` deck would still produce a valid commitment. The real defence is
review, so this file is small and reads in one sitting.

**`engine/evaluator.ts`** — a wrong winner is the worst bug this product can
have, and it is silent. Mitigation: exhaustive category tests plus a randomised
total-order sweep. Residual: a category boundary nobody tested. It is
deterministic and pure, so any reported hand can be replayed exactly.

**`engine/pots.ts`** — chip creation. A side-pot bug that pays out more than
went in inflates a stack from nothing. Mitigation: the 500-case conservation
sweep, and the same assertion inside the 1000-hand soak.

**`engine/state.ts`** — the whole security model rests on `applyAction` being
the only mutation. Risk: a later service reaches in and edits `HandState`
directly because it is a plain object. Mitigation: the dependency rule in
`01-architecture.md`, and review. This is the thing to watch in code review
above everything else.

**`compliance.ts` / `future-economy/`** — risk: someone flips a capability to
`true` to unblock a feature. Mitigation: the boot assertion turns that into a
crash rather than a quiet change, and the error message names the checklist.

**`services/tableService.ts`** — risks: an action accepted for the wrong hand,
a replayed packet counted twice, a timer firing into a closed table, a seat held
forever by a socket that will never return. Mitigations: `handId` and
`actionSeq` are both checked before the engine is asked anything, every timer is
registered per table and cleared on close and on shutdown (asserted by a test),
and the disconnect grace period releases a seat on a clock rather than on a
client's say-so. Residual risk: tables live in one process's memory, so a
restart drops live tables — acceptable while a hand is free, and the reason the
state is a plain serialisable object.

**`services/views.ts`** — the information policy. Risk: a future field added to
`SeatView` that happens to carry something private, since the leak test only
knows about `cards`. Mitigation: keep the policy in the one small
`maySeeCards` function, and extend the test whenever the view grows.

**Socket layer (stage 4, not yet written)** — the largest surface: information
leakage through the view builder, action replay, out-of-turn actions, chat
abuse, rate-limit exhaustion, and reconnect identity confusion. The controls are
in `01-architecture.md` §6 and the tests that prove them are listed in §2 above.
Until those tests exist, this layer is unproven and should not be enabled in
production.

**Persistence (stage 5)** — risk: hole cards written before a hand ends, or an
admin query path that can read a live hand. Mitigation: `poker_hand_players` is
written only at settlement, and there is no admin read path to in-memory state.
