# Social Poker — database models

Conventions follow the rest of this codebase (`server/src/db.ts`): `TEXT`
primary keys holding application-generated ids, `BIGINT` epoch milliseconds for
time, `INTEGER` 0/1 for booleans, `TEXT` holding JSON where a column is a
document rather than a queryable field. Every statement is
`CREATE TABLE IF NOT EXISTS`, run at boot, additive only.

## 0. The model that does not exist

There is **no wallet table**, no balance table, no ledger, no transaction table,
no payment table, no payout table. This is not an omission to be filled in
later by whoever needs one; it is the structural half of the promise the notice
makes. Chips live in `poker_player_sessions.stack` while a player is seated and
in `poker_hands.result` as history. They are not an asset, so nothing models
them as one. See `10-future-economy.md`.

The app already has a `coin_transactions` table for the existing social-app
coins. Poker does not read it, does not write it, and does not convert between
poker chips and app coins — the two are deliberately unconnected.

## 1. Entity map

```
players (existing)
   │ 1
   │                                  poker_tables
   │                                       │ 1
   │            ┌──────────────────────────┤
   │ n          │ n                        │ n
poker_player_sessions ──┐            poker_sessions ── n ── poker_hands
   │                    │                                        │ n
   │                    └────────────────────────────────────────┘
   │ n                                                   poker_hand_players
poker_stats (1 per player)
poker_leaderboard (materialised, 1 per player per period)
poker_achievements (n per player)
poker_audit_log (append only)
```

| Brief's name | Table here | Why |
|---|---|---|
| User | `players` (existing) | poker reuses the app's identity, it does not fork it |
| PokerTable | `poker_tables` | a table's configuration and lifetime |
| PokerSession | `poker_sessions` | one continuous run of hands at a table |
| PokerHand | `poker_hands` | one immutable hand history |
| PlayerSession | `poker_player_sessions` | one player's stay in one seat |
| Achievement | `poker_achievements` (+ existing `achievements`) | cosmetic only |
| LeaderboardEntry | `poker_leaderboard` + `poker_stats` | gameplay statistics only |
| AuditLog | `poker_audit_log` | append-only security record |
| ~~Wallet~~ | — | deliberately absent, see §0 |

## 2. Schema

### 2.1 `poker_tables`

A table's identity and rules. Rows persist after the table closes so that hand
histories keep a resolvable parent.

```sql
CREATE TABLE IF NOT EXISTS poker_tables (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,      -- short join code
  name            TEXT NOT NULL,
  host_id         TEXT NOT NULL,             -- players.id
  max_seats       INTEGER NOT NULL DEFAULT 6,
  small_blind     INTEGER NOT NULL,
  big_blind       INTEGER NOT NULL,
  ante            INTEGER NOT NULL DEFAULT 0,
  buy_in          INTEGER NOT NULL,          -- gameplay chips granted on sitting
  action_seconds  INTEGER NOT NULL DEFAULT 25,
  is_private      INTEGER NOT NULL DEFAULT 0,
  password_hash   TEXT,                      -- null unless private+protected
  status          TEXT NOT NULL DEFAULT 'open',  -- open | playing | closed
  created_at      BIGINT NOT NULL,
  closed_at       BIGINT
);
CREATE INDEX IF NOT EXISTS idx_poker_tables_status ON poker_tables(status);
```

`buy_in` is the number of gameplay chips a seat starts with. It is a game
setting like a blind level, not a purchase — nothing is spent to acquire it.

### 2.2 `poker_sessions`

One continuous run of hands at a table. A new session starts when a table goes
from empty to playing; it ends when the table closes or empties. It is the unit
leaderboards and "biggest pot tonight" aggregate over.

```sql
CREATE TABLE IF NOT EXISTS poker_sessions (
  id           TEXT PRIMARY KEY,
  table_id     TEXT NOT NULL,
  started_at   BIGINT NOT NULL,
  ended_at     BIGINT,
  hands_played INTEGER NOT NULL DEFAULT 0,
  peak_players INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poker_sessions_table ON poker_sessions(table_id);
```

### 2.3 `poker_player_sessions`

One player's stay in one seat. Written when they sit, updated as hands settle,
closed when they stand. `stack` is the live chip count and it is the **only**
place chips exist while a hand is not in progress.

```sql
CREATE TABLE IF NOT EXISTS poker_player_sessions (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  table_id      TEXT NOT NULL,
  player_id     TEXT NOT NULL,
  seat          INTEGER NOT NULL,
  buy_in        INTEGER NOT NULL,
  stack         INTEGER NOT NULL,
  hands_played  INTEGER NOT NULL DEFAULT 0,
  hands_won     INTEGER NOT NULL DEFAULT 0,
  joined_at     BIGINT NOT NULL,
  left_at       BIGINT
);
CREATE INDEX IF NOT EXISTS idx_poker_psessions_player ON poker_player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_poker_psessions_session ON poker_player_sessions(session_id);
```

When a player stands up, `stack` is recorded and discarded. It is not credited
anywhere. That is the cash-out boundary described in
`server/src/future-economy/README.md`, and it is a dead end on purpose.

### 2.4 `poker_hands` — immutable history

The audit record of one hand. Written once, at settlement, in a single
statement. **Never updated and never deleted by application code.** The board,
the actions and the result are stored as JSON documents because they are read
back whole (replay, dispute review) and never queried field-by-field.

```sql
CREATE TABLE IF NOT EXISTS poker_hands (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  table_id       TEXT NOT NULL,
  hand_no        INTEGER NOT NULL,          -- 1-based within the session
  button_seat    INTEGER NOT NULL,
  small_blind    INTEGER NOT NULL,
  big_blind      INTEGER NOT NULL,
  ante           INTEGER NOT NULL DEFAULT 0,
  board          TEXT NOT NULL,             -- JSON: ["As","Kd",...]
  actions        TEXT NOT NULL,             -- JSON: ActionRecord[] from state.ts
  result         TEXT NOT NULL,             -- JSON: pots, payouts, shown hands
  pot_total      INTEGER NOT NULL,
  deck_hash      TEXT NOT NULL,             -- shuffle commitment published pre-deal
  deck_seed      TEXT NOT NULL,             -- revealed after settlement
  deck_order     TEXT NOT NULL,             -- JSON: the full 52-card order
  started_at     BIGINT NOT NULL,
  ended_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poker_hands_session ON poker_hands(session_id, hand_no);
CREATE INDEX IF NOT EXISTS idx_poker_hands_table ON poker_hands(table_id, ended_at DESC);
```

`deck_hash` is `sha256(seed : clientEntropy : order)` published before the deal;
`deck_seed` and `deck_order` are written after settlement so anyone holding the
pre-deal hash can check the deck was not re-ordered mid-hand. `Deck.verify()`
in `engine/cards.ts` performs exactly that check, and the same caveat as
everywhere else applies: this proves the server did not change its mind, it is
**not** a provably-fair scheme and must not be described as one.

Immutability is enforced by convention plus a database grant in deployments
that use a restricted role:

```sql
REVOKE UPDATE, DELETE ON poker_hands FROM app_role;   -- optional hardening
```

### 2.5 `poker_hand_players`

The per-seat slice of a hand, normalised out of `poker_hands.result` so that
"show me this player's last 50 hands" is one index scan instead of a JSON
crawl. It is derived data — `poker_hands` remains the source of truth.

```sql
CREATE TABLE IF NOT EXISTS poker_hand_players (
  hand_id     TEXT NOT NULL,
  player_id   TEXT NOT NULL,
  seat        INTEGER NOT NULL,
  hole_cards  TEXT NOT NULL,               -- JSON: ["Ah","Kh"]
  contributed INTEGER NOT NULL,
  won         INTEGER NOT NULL DEFAULT 0,  -- chips won from all pots
  net         INTEGER NOT NULL,            -- won - contributed
  showed      INTEGER NOT NULL DEFAULT 0,
  hand_rank   TEXT,                        -- e.g. "Flush, ace high", null if folded
  PRIMARY KEY (hand_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_hand_players_player ON poker_hand_players(player_id);
```

Hole cards are stored **only after the hand has ended**. Nothing reads this
table while a hand is live, and the socket layer has no query path to it — a
live table's cards exist only in memory, in the one process that owns the hand.

### 2.6 `poker_stats` — lifetime gameplay statistics

One row per player, updated at settlement. Every column is a count of something
that happened in a game. There is nothing here with a value.

```sql
CREATE TABLE IF NOT EXISTS poker_stats (
  player_id      TEXT PRIMARY KEY,
  hands_played   INTEGER NOT NULL DEFAULT 0,
  hands_won      INTEGER NOT NULL DEFAULT 0,
  showdowns_won  INTEGER NOT NULL DEFAULT 0,
  biggest_pot    INTEGER NOT NULL DEFAULT 0,
  best_hand_rank INTEGER NOT NULL DEFAULT 0,   -- HandCategory ordinal
  best_hand_text TEXT,
  sessions       INTEGER NOT NULL DEFAULT 0,
  time_played_ms BIGINT NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  vpip_hands     INTEGER NOT NULL DEFAULT 0,   -- hands voluntarily entered
  updated_at     BIGINT NOT NULL
);
```

### 2.7 `poker_leaderboard`

Materialised rankings per period, rebuilt on a schedule rather than computed on
every lobby open. Ranked on gameplay statistics — never on chips held, because
a chip count is not an achievement and ranking by it would make chips feel like
a score to accumulate.

```sql
CREATE TABLE IF NOT EXISTS poker_leaderboard (
  period      TEXT NOT NULL,          -- 'daily' | 'weekly' | 'all_time'
  period_key  TEXT NOT NULL,          -- '2026-08-23' | '2026-W34' | 'all'
  metric      TEXT NOT NULL,          -- 'hands_won' | 'win_rate' | 'biggest_pot' | 'best_hand'
  player_id   TEXT NOT NULL,
  value       BIGINT NOT NULL,
  rank        INTEGER NOT NULL,
  computed_at BIGINT NOT NULL,
  PRIMARY KEY (period, period_key, metric, player_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_lb_rank ON poker_leaderboard(period, period_key, metric, rank);
```

`win_rate` is only ranked for players above a minimum hand count (config, 100 by
default), otherwise the board is a list of people who won their only hand.

### 2.8 `poker_achievements`

Cosmetic badges. Awarded for gameplay events, worth nothing, exchangeable for
nothing.

```sql
CREATE TABLE IF NOT EXISTS poker_achievements (
  player_id  TEXT NOT NULL,
  key        TEXT NOT NULL,
  earned_at  BIGINT NOT NULL,
  context    TEXT,                    -- JSON: the hand that earned it
  PRIMARY KEY (player_id, key)
);
```

Seed set (all cosmetic):

| key | Earned by |
|---|---|
| `first_hand` | Play a hand |
| `royal` | Make a royal flush |
| `quads` | Make four of a kind |
| `full_house_showdown` | Win a showdown with a full house |
| `river_rat` | Win a hand you were behind on the turn |
| `iron_seat` | Play 100 hands in one session |
| `table_host` | Host a table that plays 50 hands |
| `steady` | Win 5 hands in a row |
| `century` | Play 100 hands |
| `student` | Read the rules screen (yes, really) |

### 2.9 `poker_audit_log` — append only

Security record. Every rejected action, every admin read, every table
configuration change. Never updated.

```sql
CREATE TABLE IF NOT EXISTS poker_audit_log (
  id         TEXT PRIMARY KEY,
  at         BIGINT NOT NULL,
  actor_id   TEXT,                    -- players.id, null for system
  actor_kind TEXT NOT NULL,           -- 'player' | 'admin' | 'system'
  event      TEXT NOT NULL,           -- 'action_rejected' | 'rate_limited' | ...
  table_id   TEXT,
  hand_id    TEXT,
  detail     TEXT NOT NULL DEFAULT '{}',   -- JSON
  ip_hash    TEXT                     -- sha256(ip + server salt), never the raw IP
);
CREATE INDEX IF NOT EXISTS idx_poker_audit_at ON poker_audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_audit_actor ON poker_audit_log(actor_id, at DESC);
```

Events written: `action_rejected` (with the `RuleError` code), `out_of_turn`,
`seq_mismatch`, `rate_limited`, `chat_blocked`, `table_created`,
`table_config_changed`, `table_closed`, `seat_taken`, `seat_left`,
`timeout_fold`, `admin_view_hand`, `admin_view_table`, `compliance_changed`.

Note what is **not** in that list: there is no event for changing a result,
because there is no code path that changes a result. See §4.

## 3. Retention

| Table | Retention | Reason |
|---|---|---|
| `poker_hands`, `poker_hand_players` | 90 days rolling | dispute review; long enough to investigate, short enough not to hoard |
| `poker_audit_log` | 180 days rolling | security review |
| `poker_sessions`, `poker_player_sessions` | 90 days | aggregate into stats, then drop |
| `poker_stats`, `poker_achievements`, `poker_leaderboard` | indefinite | the player's own record |

Deletion is a scheduled job over a date range, and it is the **only** delete
permitted against `poker_hands`. A player exercising a data-deletion request
has their `player_id` nulled in `poker_hand_players` rather than the hand rows
removed, because a hand history with one seat missing is no longer a record of
what happened at the table for the other five players.

## 4. What the admin panel can and cannot do

Reads: live tables, seat lists, hand histories, audit log, reports, aggregate
statistics.

Writes: close a table, kick a player from a seat, mute chat, ban an account,
edit the compliance notice text.

**No** write path exists, at any layer, to: change a card, change a board,
change a winner, change a pot, change a stack, insert a hand, edit a hand,
delete a hand, or replay a settled hand with a different outcome. The engine
exposes no such function — outcomes are produced only by `applyAction` running
forward over a dealt deck — so this is not a permission check that could be
misconfigured, it is a function that was never written.

## 5. Migration order

`initializeDatabase()` runs these after the existing tables, in this order:
`poker_tables` → `poker_sessions` → `poker_player_sessions` → `poker_hands` →
`poker_hand_players` → `poker_stats` → `poker_leaderboard` →
`poker_achievements` → `poker_audit_log`. No foreign key constraints, matching
the rest of this schema, which keeps boot order flexible and mirrors the
existing conventions in `db.ts`.
