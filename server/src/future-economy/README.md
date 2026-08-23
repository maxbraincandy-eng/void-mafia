# /future-economy — inactive by design

This directory contains **interfaces and documentation only**. Nothing in it is
imported by the poker engine, the socket layer, or any running code path. It
exists so that a future economy — if one is ever built, after legal review —
has a defined place to attach, and so that the boundary is visible in the
codebase rather than living in someone's memory.

## What the product is today

Free-to-play **social poker**. Table chips are a gameplay counter. They:

- have no monetary value and no exchange rate,
- cannot be bought, sold, deposited, withdrawn or cashed out,
- cannot be transferred between players,
- do not persist as a balance a player can accumulate and redeem,
- carry no prize, reward or entitlement of any kind outside the table.

There is no wallet model, no payment provider, no ledger of value, and no code
that converts a chip into anything else. Leaderboards rank **gameplay
statistics** — hands played, hands won, win rate, best pot, longest streak —
and confer status only.

## What must never be added here without legal sign-off first

Everything below is deliberately absent, and the interfaces in
`EconomyProvider.ts` are stubs that throw:

| Capability | Status |
|---|---|
| Deposit | not implemented |
| Withdrawal / cash-out | not implemented |
| Chip ↔ money conversion | not implemented |
| Player-to-player transfer | not implemented |
| Prizes with monetary value | not implemented |
| Payment provider integration | not implemented |
| Sportsbook / casino features | not implemented |

## The rule for whoever picks this up next

The poker engine (`src/poker/engine/*`) must remain ignorant of all of it. It
deals in integers called chips and knows nothing about where they came from or
whether they mean anything. If a future economy is approved, it attaches at the
**table seating boundary** — how many chips a seat starts with, and what happens
to the count when the player stands up — and nowhere else.

Concretely, the only two calls a future economy may ever make into the game are:

```
buyIn(playerId, tableId, amount)   → seat a player with `amount` chips
cashOutSeat(playerId, tableId)     → take the seat's remaining chips back
```

Both are gameplay operations today (`PokerTableService`), and both must stay
that way unless and until the checklist in
`docs/poker/11-legal-compliance-checklist.md` has been completed and signed off
by a qualified adviser in every jurisdiction the product is offered in.

Nothing in this repository should be read as legal advice, and nothing in it
asserts that the product is compliant anywhere. It is structured so that the
question can be asked and answered before any of the above is switched on.
