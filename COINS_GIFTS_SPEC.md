# Void Mafia Coins & Collectible Gifts System

Implement Phase 1 only.

Important:
- Do not add real-money payments yet.
- Do not add Stripe, App Store payments, or Google Play billing yet.
- Do not reset the Railway database.
- Do not use destructive migrations.
- Do not break users, profiles, clans, messages, friends, reports, avatars, roles, rooms, voice, WebRTC, admin panel, Google/Facebook login, or deployment.

Core rule:
Only OWNER users can control the economy.

OWNER can:
- grant coins
- remove coins
- view all coin transactions
- create/edit/deactivate gifts
- change gift prices
- refund coins

ADMIN/MODERATOR cannot:
- grant coins
- remove coins
- edit gift catalog
- change gift prices
- create premium gifts
- manipulate economy

Use OWNER_PUBLIC_IDS / OWNER_USER_IDS from Railway variables.

Add:
1. Coin wallet
2. Coin transaction ledger
3. Daily reward
4. Gift catalog
5. Send gift flow
6. Profile gift gallery
7. Gift detail page showing senders
8. Realtime gift notification
9. Owner-only economy admin panel

All coin and gift actions must be server-side validated and stored in Railway database.

Gift profile UI should look like premium collectible gifts:
- gifts visible on full profile
- gift image/icon gallery
- tap gift opens detail page
- detail page shows gift image, rarity/stars, sender list, sender avatar/name/date
- clicking sender opens sender profile

Do not implement blockchain/NFT yet.
Use NFT-style only visually: rarity, stars, collectible gallery.
