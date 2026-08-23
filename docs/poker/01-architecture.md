# Social Poker — architecture

Covers: architecture, folder structure, server design, the hand state machine,
the WebSocket protocol, the security and anti-cheat model, and the roadmap.
Database models are in `02-database.md`; running and deploying it is in
`03-testing-and-deployment.md`; the legal boundary is in
`10-future-economy.md` and `11-legal-compliance-checklist.md`.

## 0. What this is

Free-to-play **social** Texas Hold'em inside the existing void-mafia app. Table
chips are a gameplay counter with no monetary value, no redemption path and no
transfer between players. See `10-future-economy.md` — that boundary is a
design constraint here, not a footnote.

## 1. Stack, and why it is not Next.js

The brief said "React / Next.js". This product is a single existing
application: React 18 + Vite + Zustand on the client, Node + Express +
Socket.IO + PostgreSQL on the server, deployed as one service. Poker joins that
app — the same auth, the same socket, the same profile, the same friends and
invites — because a separate Next.js app would mean a second session system, a
second socket, and a second deployment for one game. The engine itself is
transport-agnostic TypeScript and would move to any host unchanged.

## 2. Folder structure

```
server/src/poker/
  engine/                  pure rules, no I/O, no network, no database
    cards.ts               deck, CSPRNG shuffle, shuffle commitment
    evaluator.ts           7-card hand evaluation, comparison, descriptions
    betting.ts             legal actions, min-raise, re-opening rules
    pots.ts                main/side pots, distribution, odd chips
    state.ts               the hand state machine
    *.test.ts              unit tests (excluded from the production build)
  compliance.ts            the configurable notice + the boot assertion
  services/
    types.ts               table, seat, config, event and history shapes
    clock.ts               time as a dependency: systemClock and ManualClock
    views.ts               per-viewer projection — the information policy
    tableService.ts        tables, seating, timers, the hand loop, reconnect
    rateLimit.ts           token buckets, per profile, per action
    *.test.ts              unit tests (excluded from the production build)
  poker.ts                 Socket.IO handlers — the only I/O layer
  poker.e2e.test.ts        real server, real clients, real payloads
server/src/future-economy/ interfaces only, disabled, imported by nothing
client/src/components/poker/  (next) table UI
docs/poker/                these documents
```

The dependency rule is one-directional and absolute: `engine` imports nothing
from `services` or the socket layer, and nothing outside `engine` decides a
rule. That is what makes the rules testable in milliseconds and what makes
"the client said so" impossible to express.

## 3. Server design

```
socket (poker.ts)          validates identity, rate-limits, routes actions
   │  action + playerId
   ▼
table service              owns tables, seats, timers, persistence, broadcast
   │  validated call
   ▼
engine (pure)              decides what happened
   │  new HandState
   ▼
view builder               per-viewer projection: your hole cards, nobody else's
```

* One authoritative `HandState` per table, in memory, owned by one process.
* Every mutation goes through `applyAction`, which validates before it touches a
  chip and throws `RuleError` otherwise.
* Broadcast is **per viewer**, never a shared object: a player receives their own
  hole cards and the public state. Opponents' cards are not sent, not even
  encrypted, not even "hidden by the UI" — they are not in the payload.
* Redis-ready: the engine state is a plain serialisable object and the table
  service is the only stateful piece, so moving tables to a Redis-backed store
  with one owner per table is a change to the service, not to the rules.

## 4. The hand state machine

```
WAITING ──(2+ seated, ready)──▶ STARTING
STARTING ──(deal, blinds)────▶ PRE_FLOP
PRE_FLOP ─(betting complete)─▶ FLOP ─▶ TURN ─▶ RIVER
   │                                              │
   └──(one player left)──┐        (betting done)──┘
                         ▼                        ▼
                    SETTLEMENT ◀──────────── SHOWDOWN
                         │
                         ▼
                      COMPLETE ──▶ next hand (button moves one seat)
```

Every transition happens inside `state.ts` as a function of the current state
plus one validated action. Notable rules encoded there:

* **Heads-up**: the button is the small blind and acts first pre-flop, last
  afterwards. Same code path as a full ring, not a special case.
* **Big blind option**: when everyone limps, the big blind may still raise.
* **Min-raise**: a raise must be at least the size of the last raise.
* **Short all-in does not re-open betting**: a player who has already called
  cannot re-raise because a short stack dribbled a few chips over the line.
* **Run-out**: once nobody can act, the board is dealt to five and the hand
  settles in one step.
* **Uncontested pots** are pushed without a showdown and without revealing
  anything.

## 5. WebSocket protocol

All events are namespaced `poker:` and carry an acknowledgement callback with
`{ ok, data }` or `{ ok: false, error }`.

Client → server (all implemented in `poker.ts`):

| Event | Payload | Notes |
|---|---|---|
| `poker:list` | — | open tables + the compliance notice and its facts |
| `poker:create` | `{ name, maxSeats, smallBlind, bigBlind, ante, buyIn, actionSeconds, handIntervalSeconds, isPrivate, password? }` | returns your table view |
| `poker:join` | `{ code, password?, name? }` | watch, or rejoin a seat you hold |
| `poker:sit` | `{ tableId, seat, name? }` | take a seat; the stack comes from the table config |
| `poker:sit_out` | `{ tableId, out }` | takes effect from the next deal |
| `poker:rebuy` | `{ tableId }` | free, only when busted, never mid-hand |
| `poker:leave` | `{ tableId }` | stand up; folds any live hand |
| `poker:action` | `{ tableId, handId, actionSeq, type, amount? }` | fold/check/call/raise/allIn |
| `poker:resume` | — | re-attach after a reconnect, get authoritative state |
| `poker:chat` | `{ tableId, text }` | rate-limited, table members only |

Every one acknowledges with `{ ok: true, data }` or `{ ok: false, error: CODE }`.
Error codes are stable strings — `AUTH_REQUIRED`, `RATE_LIMITED:<seconds>`,
`SEQ_MISMATCH`, `HAND_MISMATCH`, `OUT_OF_TURN`, `NOT_SEATED`, `NOT_AT_TABLE`,
`BAD_ACTION`, `SEAT_TAKEN`, `BAD_PASSWORD`, `NO_TABLE`, `INTERNAL` — because a
client has to be able to tell "try again" from "you are not allowed".

Server → client:

| Event | Payload |
|---|---|
| `poker:state` | per-viewer table + hand view (see §3) — the main channel |
| `poker:hand_start` | hand id, hand number, button, and the deck commitment |
| `poker:settlement` | pots, payouts, shown hands, new stacks, the revealed seed |
| `poker:closed` | the table has closed, and why |
| `poker:chat` | a table message |
| `poker:list_update` | the lobby list changed |
| `poker:error` | a rejected action, with its code |

`poker:state` carries everything the table renders, so a client that misses an
event is corrected by the next one rather than drifting. Streets and individual
actions are not separate events: `hand.board` and `hand.lastAction` in the state
say what changed, and one authoritative message is easier to reason about than
five partial ones that must be applied in order.

`actionSeq` is the client's copy of the server's action counter. The server
rejects an action whose `actionSeq` is not the current one — that is what makes
a duplicated or replayed packet a no-op instead of a second bet.

## 6. Security model

The rule: **the client is an input device and a renderer, nothing else.**

Never trusted, and therefore never read from the client: cards, chip counts,
pot size, winner, whose turn it is, timers, table state, legal actions.

Enforced server-side:

* **Identity** — every action is attributed to the authenticated profile on the
  socket, not to an id in the payload.
* **Turn** — an action from anyone but the acting seat is rejected (`OUT_OF_TURN`).
* **Legality** — `validateAction` re-derives the legal set from the hand state.
* **Amounts** — a raise is a target total; the server computes the delta and
  caps it at the stack. A client cannot spend chips it does not have.
* **Sequence** — `actionSeq` blocks duplicates and replays.
* **Rate limiting** — token buckets per profile per action (`rateLimit.ts`),
  keyed on identity so reconnecting is not a way round a limit.
* **Timers** — held on the server; a timeout checks if free, otherwise folds.
* **Information** — hole cards are only ever in the payload of the player who
  holds them, and at showdown only for players who must show.
* **Randomness** — `crypto.randomInt` and Fisher–Yates, server-side, per hand.
* **Payload hygiene** — every number is floored and bounded, every string is
  trimmed and truncated, at the socket boundary. `Infinity` is not a blind and a
  500-character table name is 40 characters by the time anything sees it.
* **Authentication** — poker refuses anonymous sockets outright. A seat, a hand
  history and a leaderboard row all need an identity that survives a reconnect,
  and `socket.id` is not one.
* **Audit** — every hand produces an immutable history record (§`02-database.md`)
  and every rejected action is logged with its code.

Anti-cheat beyond the protocol:

* Same-account collusion is prevented structurally (one seat per account).
* Multi-account collusion is detectable, not preventable: hand histories are
  stored with action sequences precisely so it can be reviewed. The admin panel
  surfaces suspicious patterns; it has **no** ability to change a result.
* The shuffle commitment (`sha256(seed : order)` published before the deal,
  seed revealed after) proves the deck was not re-ordered mid-hand. It is
  **not** a provably-fair scheme in the regulatory sense — the player
  contributes no entropy — and the product must not claim that it is.

## 7. Roadmap

| Stage | Contents | State |
|---|---|---|
| 1 | Engine: cards, evaluator, betting, pots, state machine, 36 tests | **done** |
| 2 | Compliance config + disabled economy interfaces | **done** |
| 3 | Table service + per-viewer views: seating, buy-in, timers, hand loop, reconnect, 29 tests | **done** |
| 4 | Socket layer + rate limits + hostile-payload handling, 17 tests | **done** |
| 5 | Persistence: tables, sessions, hands, stats (schema in `02`) | next |
| 6 | Client: lobby, responsive table, cards/chips/animations | next |
| 7 | Leaderboards, profile stats, achievements | next |
| 8 | Admin panel: live tables, hand histories, reports | next |
| 9 | Load and security test suites | next |

Nothing in stages 3–9 changes stage 1: the rules are settled and tested, and
every later layer is transport, storage or pixels around them.
