# Void Mafia Gift Send Flow Fix

## Goal

The Economy/Gift UI already exists and looks good, but the actual gift sending flow is incomplete.

Current issue:
- Gift catalog exists.
- Coins exist.
- Profile has “Gifts Received”.
- Economy Admin exists.
- But users cannot properly send gifts to other players.
- Gifts do not appear in the recipient profile after sending.
- “Gifts Received” stays empty.

Fix the gift sending flow end-to-end.

## Important Safety Rules

Do not redesign the whole app.
Do not reset the Railway database.
Do not use destructive migrations.
Do not use `prisma migrate reset`.
Do not break:
- users
- profiles
- avatars
- clans
- messages
- friends
- reports
- admin system
- owner permissions
- coins
- rooms
- roles
- voice/WebRTC
- Google/Facebook login
- Railway deployment

Use safe migrations only if absolutely needed.

## A. Add Send Gift Entry Points

Add a working **Send Gift** action in:

1. Player profile popup  
2. Full player profile page  
3. Room/lobby/game player popup  
4. Leaderboard player popup if available  
5. Private message conversation header if appropriate  

When opening another player’s profile/popup, show:

- Send Message
- Add Friend / Friends
- Send Gift
- Report Player
- View Full Profile

Rules:
- Do not show Send Gift on my own profile.
- Users cannot gift themselves.
- Only allow sending gift to valid existing users.

## B. Send Gift Modal

When pressing Send Gift:

- Open `SendGiftModal`.
- Load gift catalog from server.
- Show gift image/icon.
- Show gift name.
- Show rarity/stars.
- Show coin price.
- Show sender coin balance.
- Disable gifts the sender cannot afford.
- Allow optional short message.
- Confirm before sending.

Confirmation text:

```text
Send [GiftName] to [PlayerName] for [coinCost] coins?
