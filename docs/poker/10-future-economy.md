# Social Poker — the future economy integration spec

This document describes a module that **is not implemented and is not
enabled**. It exists so that the boundary between the game and anything with
value is written down while the game is being built, rather than reconstructed
later by someone reading the engine and guessing.

Nothing here is legal advice, and nothing here asserts that the product is
compliant in any jurisdiction. See `11-legal-compliance-checklist.md`.

## 1. What ships today

| | |
|---|---|
| Product | free-to-play social poker inside the void-mafia app |
| Chips | a gameplay counter, granted on sitting, discarded on standing |
| Cash value of a chip | none — `EconomyProvider.cashValue()` returns `null`, and the type is `null` |
| Deposit | not implemented |
| Withdrawal / cash-out | not implemented |
| Chip ↔ money conversion | not implemented |
| Player-to-player transfer | not implemented, `transferCurrency()` throws |
| Redemption for goods, prizes or status with value | not implemented, `redeemCurrency()` throws |
| Prizes tied to game outcome | none |
| Wallet, balance ledger, payment provider | no model, no table, no code |
| Leaderboards | gameplay statistics only — hands played, hands won, win rate, biggest pot, best hand |
| Achievements | cosmetic badges only |

The code that states this: `server/src/future-economy/EconomyProvider.ts`
(`CURRENT_CAPABILITIES`, `DisabledEconomyProvider`) and
`server/src/poker/compliance.ts` (`complianceFacts`, `assertSocialOnly`).

## 2. The two enforcement mechanisms

**Structural.** The absence is structural, not cosmetic. There is no wallet
table (`02-database.md` §0), no ledger, no payment integration, and no function
anywhere that converts a chip into anything else. A chip cannot leak value
because there is nothing on the other side of the boundary to leak into.

**Assertive.** `assertSocialOnly()` runs at boot. If `transfer`, `redeem`,
`deposit` or `withdrawal` is ever set to `true`, the process refuses to start
and the error names this checklist. The point is that the product must never be
able to serve a "chips have no monetary value" notice while running code that
makes that untrue. The failure mode being designed against is not somebody
deliberately building a casino — it is somebody wiring a chip to something with
value in a hurry and nobody noticing for six months.

## 3. Where a future economy would attach

Exactly two calls, at the table seating boundary and nowhere else:

```ts
buyIn(playerId, tableId, amount)   // seat a player with `amount` chips
cashOutSeat(playerId, tableId)     // take the seat's remaining chips back
```

Both are gameplay operations today. `buyIn` grants chips from nothing;
`cashOutSeat` discards them to nothing. If an economy were ever approved, those
two functions are where it would be sourced and sunk — and that is the entire
integration surface.

The engine (`src/poker/engine/*`) must remain ignorant of it. It deals in
integers called chips and knows nothing about where they came from or whether
they mean anything. That ignorance is what keeps the rules testable in
milliseconds and what makes it impossible for a money feature to change a game
outcome: the code that decides who wins cannot see the code that decides what a
chip is worth.

## 4. The interface, if it is ever built

```ts
interface EconomyProvider {
  getBalance(playerId): Promise<number>;
  addGameplayCurrency(playerId, amount, reason): Promise<number>;
  spendGameplayCurrency(playerId, amount, reason): Promise<number>;
  transferCurrency(from, to, amount): Promise<never>;   // DISABLED
  redeemCurrency(playerId, amount): Promise<never>;     // DISABLED
  cashValue(): null;                                    // type is `null`, not `number | null`
}
```

`cashValue()` returning the type `null` rather than `number | null` is
deliberate: a future economy cannot satisfy this interface by returning a
number, it has to change the type, which makes it a visible edit in review
rather than a value that quietly becomes non-zero.

## 5. What would have to happen first

Every one of these, before a single line of the module is written:

1. Legal review in **every** jurisdiction the product is offered in, not just
   the operator's own. Social casino, sweepstakes and real-money gaming are
   drawn differently in each one, and a feature that is a promotion in one place
   is a licensable gambling activity in another.
2. A written determination of which regulatory category the changed product
   falls into, and what licence, if any, it requires.
3. Age verification appropriate to that category — not a self-declared
   birthdate.
4. KYC/AML if money moves, including sanctions screening and source-of-funds
   handling.
5. Payment provider due diligence; most acquirers treat gaming as high risk and
   will ask what has been answered in 1–4.
6. Responsible-play controls: deposit limits, session limits, self-exclusion,
   reality checks.
7. Tax treatment of anything a player receives.
8. A rewrite of `compliance.ts` — the notice, the facts, and the boot assertion
   — done deliberately, as its own change, reviewed on its own.
9. A rewrite of the player-facing terms.
10. Completion and sign-off of `11-legal-compliance-checklist.md`.

If any of these is unfinished, the answer is no, and the boot assertion keeps
saying no on the product's behalf.

## 6. Things that look harmless and are not

Written down because these are the ways a social product drifts across the line
without anyone deciding to cross it:

* **A persistent, accumulating chip balance.** The moment chips survive a
  session and grow, players start to feel they own them. That feeling is what
  regulators and payment providers respond to. Today chips exist only while a
  player is seated, on purpose.
* **Selling chips for money**, even framed as "buying time" or "unlocking a
  table". That is a deposit.
* **Gifting chips between players.** That is a transfer, and it creates an
  off-platform resale market whether or not the product intends one.
* **Ranking the leaderboard by chips held.** It turns the counter into a score
  worth hoarding and it is the first step towards the two items above. Rank on
  hands won and win rate instead.
* **A prize for a tournament**, including merchandise, subscription time or
  in-app goods with a purchase price. Any of these is a reward tied to a game
  outcome.
* **Gambling vocabulary in the UI.** "Bet", "cash out", "jackpot", "casino",
  "real money", "deposit", "withdrawal" — the words shape what the product is
  understood to be, by players and by everyone reviewing it. Use "Play", "Join
  Table", "Practice", "Play Chips", "Social Poker", "Private Table", "Friends",
  "Leaderboard".
* **Describing the shuffle as "provably fair".** The commit-reveal in
  `engine/cards.ts` proves the server did not re-order a deck mid-hand. It is
  not a provably-fair scheme in the regulatory sense — the player contributes no
  entropy and verifies nothing at deal time — and calling it one would be a
  claim the code does not support.
