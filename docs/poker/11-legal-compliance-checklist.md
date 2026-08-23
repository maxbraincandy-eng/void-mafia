# Social Poker — legal & compliance checklist

**This document is not legal advice and it does not assert that the product is
legally compliant anywhere.** It is a record of what the software does and does
not do, written so that a qualified adviser can be asked a precise question and
give a precise answer. Whether the product may lawfully be offered in any given
jurisdiction is a determination only such an adviser can make.

It is referenced from `server/src/poker/compliance.ts` and
`server/src/future-economy/README.md`, and the boot assertion names it in its
error message.

## Part A — statements of fact about the shipped software

Each row is a factual claim about the code, checkable by reading the file named.
They are facts, not aspirations; if one of them ever stops being true, this
document is wrong and must be changed in the same commit.

| # | Statement | Verified in |
|---|---|---|
| A1 | No real-money wagering exists. No code path accepts a stake with monetary value. | absence of any payment code in `server/src/poker/**` |
| A2 | No deposit mechanism exists. | `CURRENT_CAPABILITIES.deposit === false`, no payment provider |
| A3 | No withdrawal or cash-out mechanism exists. | `CURRENT_CAPABILITIES.withdrawal === false` |
| A4 | Chips cannot be exchanged for money, crypto, goods or anything else. | `redeemCurrency()` throws `EconomyDisabledError` |
| A5 | Chips cannot be transferred between players. | `transferCurrency()` throws `EconomyDisabledError` |
| A6 | Chips have no cash value, and the type system says so. | `cashValue(): CashValue` where `type CashValue = null` |
| A7 | No reward of any kind is tied to a game outcome. | no prize code; achievements are cosmetic (`02-database.md` §2.8) |
| A8 | No wallet, balance ledger or financial model exists in the database. | `02-database.md` §0 |
| A9 | Chips do not persist as an accumulating balance. | `DisabledEconomyProvider` has no storage; stacks live in `poker_player_sessions` and are discarded on standing |
| A10 | Leaderboards rank gameplay statistics only, never chips held. | `02-database.md` §2.7, `metric` domain |
| A11 | No sportsbook, casino or betting functionality exists. | no such module |
| A12 | Poker chips are not connected to the app's existing coin system. | poker code does not read or write `coin_transactions` |
| A13 | Enabling any money-shaped capability stops the server at boot. | `assertSocialOnly()`, tested in `compliance.test.ts` |
| A14 | The product does not describe its shuffle as provably fair. | `01-architecture.md` §6, `10-future-economy.md` §6 |
| A15 | Game outcomes cannot be altered by an administrator. | no write path exists; `02-database.md` §4 |
| A16 | Hand histories are immutable once written. | written once at settlement, never updated (`02-database.md` §2.4) |

Automated coverage: A2–A6 and A13 are asserted by `compliance.test.ts`. The
rest are structural and are checked by review, which is why each names the file
that carries it.

## Part B — the terminology rule

The UI must not use, in any language: "bet for real money", "win cash", "cash
out", "jackpot", "casino", "sportsbook", "real money poker", "deposit",
"withdrawal", or their Georgian equivalents.

It uses instead: **Play**, **Join Table**, **Practice**, **Play Chips**,
**Social Poker**, **Private Table**, **Friends**, **Leaderboard** — and in
Georgian: თამაში, მაგიდაზე შესვლა, ვარჯიში, სათამაშო ჩიპები, სოციალური პოკერი,
დახურული მაგიდა, მეგობრები, რეიტინგი.

"Bet"/"raise"/"call"/"fold" as in-hand action labels are the rules of Hold'em
and are unavoidable; they describe a move in a card game, not a wager of value,
and they sit next to a notice that says so. Everything framing the product —
lobby, marketing, store, notifications — uses the social vocabulary.

**To check before a release:** grep the client for the forbidden list, in both
languages, including copy inside images and push-notification templates.

## Part C — the notice

Configured in `server/src/poker/compliance.ts`, shown in the lobby (short form)
and on the rules screen (long form).

Current default (Georgian), long form, in translation:

> This is free social poker. The chips used at the table are a game element
> only: they have no monetary value, cannot be bought, cannot be sold back,
> cannot be transferred between players, and cannot be exchanged for money or
> any other asset of value. Winning in the game does not mean a monetary or
> other material reward. Rankings are based on gameplay statistics only.

The text is editable without a rebuild. The facts it describes
(`complianceFacts()`) are computed from the capability flags, not written by
hand, so the notice cannot drift away from what the software does.

The notice does **not** state that the product is legal, licensed, approved or
compliant. It states what the product does. That distinction is deliberate and
must survive editing.

## Part D — questions for the adviser

These are the things the code cannot answer. Put them, with this document
attached, to counsel qualified in each jurisdiction the product is offered in.

1. Given Part A, does this product fall within the definition of gambling,
   gaming, or a game of chance in this jurisdiction? Does the presence of skill,
   or the absence of consideration, change that?
2. Does offering free chips with no purchase path, no persistence and no
   redemption avoid "consideration" here? Does watching an ad, or an app
   subscription that includes other features, reintroduce it?
3. Is a minimum age required, and if so what is it and how must it be verified?
   The product currently states none (`minimumAge: null`).
4. Are there advertising or platform-store rules (Apple, Google) that apply to
   a social-casino-adjacent product even without money, and what disclosures do
   they require?
5. Does ranking players publicly by gameplay statistics create any exposure
   here?
6. What data-protection obligations attach to hand histories and the audit log,
   and are the retention periods in `02-database.md` §3 acceptable?
7. What would need to change if a paid cosmetic (a card back, a table felt) were
   sold — noting that it would not affect gameplay or chips?
8. If a future economy were ever considered, which of the ten items in
   `10-future-economy.md` §5 apply here, and what else?

## Part E — the gate

Before any of `transfer`, `redeem`, `deposit` or `withdrawal` is set to `true`:

- [ ] Part D answered in writing, per jurisdiction, by a qualified adviser
- [ ] Regulatory category determined and any required licence obtained
- [ ] Age verification implemented to the standard that category requires
- [ ] KYC/AML, sanctions screening and source-of-funds handling in place
- [ ] Payment provider onboarded with full disclosure of the product
- [ ] Responsible-play controls shipped: limits, self-exclusion, reality checks
- [ ] Tax treatment determined for anything a player receives
- [ ] `compliance.ts` rewritten deliberately, as its own reviewed change
- [ ] Player-facing terms rewritten and re-accepted
- [ ] Part A of this document rewritten, since most of it would become false

Until every box is ticked, `assertSocialOnly()` stays as it is and the server
refuses to start with any of those flags on. That refusal is the point: the
product cannot cross this line by accident, only by a deliberate change that
someone has to make on purpose and defend in review.

## Part F — review log

| Date | Reviewer | Scope | Outcome |
|---|---|---|---|
| — | — | initial implementation | not yet reviewed by counsel |

This table is empty because no legal review has taken place. That is a fact
about the current state of the product and it should be read as one.
