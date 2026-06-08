# Void Mafia — Advanced Gift System V2
## Cyberpunk Mafia Gift Economy + Global Public Gift History

## Goal

Upgrade the current basic gift system into a richer, more social, more visual, cyberpunk-mafia-style system.

The new system must:
- keep the existing design language of Void Mafia
- preserve the current economy foundation
- preserve current users, profiles, clans, messages, reports, admin system, and role/game systems
- extend gifts into a deeper collectible / social prestige system
- make gifts globally visible in player profile statistics
- show publicly who gifted what to whom

This is not just a simple “send gift” fix.
This is a full Gift System V2.

---

## Core Product Vision

Gifts are not just items.
They are:
- status symbols
- collectible profile decorations
- public social interactions
- economy sinks for coins
- identity markers inside the mafia/cyberpunk world

The gift system should feel premium, dark, neon, collectible, and social.

---

## High-Level Requirements

Implement a more advanced gift system with:

1. Gift catalog with rarity and visual identity
2. Send gift flow from all relevant profile/player entry points
3. Public received gifts section on every player profile
4. Public sent gifts section on every player profile
5. Public gift history timeline showing who gifted what to whom
6. Gift detail modal with all senders / recipient history
7. Featured / pinned / favorite gifts on profile
8. Gift collections / counts / repeated gift stacking
9. Optional gift message
10. Realtime notification when a gift is received
11. Owner-only gift/economy controls
12. Global visibility in profile statistics

---

## Important Safety Rules

Do not redesign the whole app.
Do not break the existing Void Mafia aesthetic.
Do not remove current profile sections.

Do not reset the database.
Do not wipe Railway.
Do not use destructive migrations.
Do not use `prisma migrate reset`.

Do not break:
- user accounts
- avatars
- profiles
- clans
- friends
- messages
- reports
- admin system
- owner permissions
- rooms
- roles
- game logic
- WebRTC / voice
- Google/Facebook auth
- Railway deployment

Only add safe migrations if needed.

---

## Design Direction — Cyberpunk Mafia Aesthetic

All gift UI must match the existing Void Mafia design:

- dark navy / black base
- neon cyan / purple / magenta / gold accents
- rounded panels
- thin glowing borders
- futuristic mafia vibe
- premium collectible feel

Gift cards should feel like:
- black-market collectibles
- neon trophies
- underground prestige items

Use:
- rarity labels
- stars
- subtle glow by rarity
- hover / tap glow
- compact premium panels

Rarity visual language:
- Common: cool gray / silver
- Uncommon: cyan / green
- Rare: blue / violet
- Epic: purple / magenta
- Legendary: gold / amber
- Mythic / Exclusive: red-gold / animated neon border

---

## A. Gift Catalog V2

Each gift in the catalog should have:

- id
- key
- name
- description
- imageUrl / asset
- category
- rarity
- stars (1-5)
- coinPrice
- active
- limitedEdition boolean
- seasonalTag optional
- displayOrder
- animationStyle optional
- createdAt
- updatedAt

Example categories:
- Romantic
- Luxury
- Weapons
- Symbols
- Cyber
- Mafia
- Seasonal
- Clan-themed
- VIP / Limited

Example gifts:
- Skull
- Red Rose
- Dagger
- Crown
- Godfather Ring
- Neon Mask
- Encrypted Rose
- Blood Oath
- Black Card
- Digital Crown
- Ghost Orchid
- Cyber Katana
- Don’s Cigar
- Queen’s Veil
- Neon Frog Heart
- Golden Revolver

Catalog must support:
- browsing by category
- browsing by rarity
- browsing by price
- limited gifts
- active/inactive state

---

## B. Send Gift Entry Points

Users should be able to send gifts from:

1. player profile popup
2. full profile page
3. leaderboard player profile
4. room player popup
5. clan member profile popup if applicable
6. message conversation header / profile area if relevant

When opening another player's profile, the action buttons should include:
- Send Message
- Add Friend
- Send Gift
- Report Player
- View Full Profile

Rules:
- do not show Send Gift on my own profile
- users cannot gift themselves
- gifting only works to existing valid users

---

## C. Send Gift Modal

Create or upgrade `SendGiftModal`.

It must show:
- recipient avatar
- recipient name
- recipient public ID
- sender current coin balance
- gift catalog grid
- gift image
- gift name
- rarity
- star level
- price
- optional message input
- confirm button

Features:
- filter by category
- filter by rarity
- sort by price
- show only affordable gifts toggle
- preview selected gift larger
- disable gifts user cannot afford

Optional message:
- max 120 chars
- sanitized
- optional
- stored with the gift send record

Confirm text:
`Send [GiftName] to [PlayerName] for [coinCost] coins?`

On success:
- show toast
- close modal
- update sender coin balance
- update recipient profile gifts in realtime if open
- create public gift history entry

---

## D. Server-Side Gift Send Logic

Server must validate:
- sender authenticated
- receiver exists
- sender != receiver
- gift exists
- gift is active
- gift price comes from server, not client
- sender has enough coins
- optional message length valid
- data sanitized

Must use atomic transaction:

1. load sender balance
2. validate gift and receiver
3. deduct coins
4. create coin transaction record
5. create user gift record
6. update sender profile stats
7. update receiver profile stats
8. create public gift feed entry
9. emit realtime notification to receiver
10. emit sender success response

If any step fails:
- no coins are lost
- no partial gift record remains

---

## E. Public Gift Visibility Requirements

This is a core requirement.

Every player profile must show gift data publicly.

### 1. Gifts Received
Public section visible to everyone:
- gift image
- gift name
- total count received
- rarity
- latest sender
- latest received date

### 2. Gifts Sent
Public section visible to everyone:
- gifts the player has sent to others
- recipient name
- gift name
- sent date
- count

### 3. Public Gift Timeline
A dedicated profile section:
- who gifted what to whom
- newest first
- visible to anyone viewing the profile

Examples:
- `Max sent Crown to Salius`
- `Salius sent Red Rose to Sara`
- `Gyu sent Dagger to guest3828`

Each row shows:
- sender avatar + name + publicId
- receiver avatar + name + publicId
- gift icon
- gift name
- optional message preview
- timestamp

### 4. Global Gift Counters
On every profile add public stats:
- Total gifts received
- Total gifts sent
- Total coins spent on gifts
- Most received gift
- Most sent gift
- Legendary gifts received
- Unique gifts collected

---

## F. Profile Upgrade — Gift Sections

Upgrade the player profile page to include:

### Profile Header Additions
- featured gifts row (top 3)
- rarest gift badge
- collector badge if applicable

### New Profile Sections
1. Featured Gifts
2. Gifts Received
3. Gifts Sent
4. Public Gift Timeline
5. Gift Collection Stats

### Featured Gifts
Players can pin up to 3 gifts to display prominently.
Pinned gifts show near the top of profile.

Rules:
- only owner of profile can pin/unpin their gifts
- pinned gifts are visual showcase items only
- not consumed

### Gifts Received Section
Display cards with:
- gift image
- gift name
- count
- rarity
- last sender
- last received date

Tap gift -> open gift detail modal

### Gifts Sent Section
Display cards or list:
- gift image
- recipient
- sent date
- count
- total spent on that gift

### Public Gift Timeline
List-style feed with sender/receiver relation
This should be globally visible.

### Gift Collection Stats
Show:
- Total gifts received
- Total unique gifts
- Total legendary gifts
- Total gifts sent
- Coins spent on gifting
- Most received gift
- Most sent gift

---

## G. Gift Detail Modal / Page

When tapping a gift from a profile:
open gift detail modal/page.

It should show:
- large gift image
- gift name
- description
- rarity
- star rating
- category
- total received count
- full sender list
- sender avatars
- sender names
- sender publicIds
- sent dates
- optional messages
- if repeated, grouped or shown chronologically

If the gift appears in `Gifts Sent`, show recipients similarly.

Click sender/recipient -> open that profile.

---

## H. Public Feed / Social Layer

Add a new optional public/global feed component:

### Gift Feed
A global feed showing recent gift activity:
- `Max sent Crown to Salius`
- `Sara sent Rose to Max`
- `guest3828 sent Skull to tester`

This can appear:
- in profile timeline
- optionally in a separate social page later

For now, the main requirement is profile-level global visibility.

---

## I. Repeated Gifts / Stacking

If the same gift is sent multiple times:

Profile should support:
- stack count
- total received count
- total sent count

Example:
- Crown x4
- Red Rose x12

Gift detail page should still show all individual senders and timestamps.

---

## J. Notifications / Realtime

When a user receives a gift:
- show toast notification
- update profile gift section
- update coin balance for sender
- update public gift timeline if visible

Toast example:
`You received Crown from Max`

Optional richer notification:
- gift icon
- sender avatar
- “View Gift” action

Socket / realtime events:
- `gifts:sent`
- `gifts:received`
- `gifts:timelineUpdated`
- `gifts:profileUpdated`
- `coins:balanceUpdated`

---

## K. Economy & Permissions

Keep strict security.

### Owner Only
Only the owner can:
- create/edit/delete/activate/deactivate gifts
- change gift prices
- grant coins
- deduct coins
- create limited/seasonal gifts
- inspect all economy transactions
- refund or revoke gifts if a support action is needed

### Admins / Moderators
Admins and moderators must NOT be able to:
- grant coins
- deduct coins
- edit gift catalog
- change gift prices
- create gifts
- delete gifts
- manipulate balances

They may only:
- view public gift information
- moderate abuse reports if gift messages are abused
- optionally review flagged gift messages if that moderation flow exists

Server must enforce owner-only permissions.
UI hiding is not enough.

---

## L. Database / Models

Inspect existing models first and extend safely.

Use safe migrations only if needed.

### GiftCatalog
- id
- key
- name
- description
- imageUrl
- category
- rarity
- stars
- coinPrice
- active
- limitedEdition
- seasonalTag optional
- displayOrder
- animationStyle optional
- createdAt
- updatedAt

### UserGift
Represents an actual gift send event.

- id
- senderUserId
- senderPublicId
- senderName
- senderAvatarUrl optional
- receiverUserId
- receiverPublicId
- receiverName
- receiverAvatarUrl optional
- giftCatalogId
- giftKey
- giftName
- giftImageUrl
- giftCategory
- giftRarity
- giftStars
- coinCost
- message optional
- createdAt

### GiftProfileSummary (optional derived table or computed query)
Can be computed or cached:
- userId
- totalReceived
- totalSent
- totalSpentOnGifts
- uniqueGiftTypesReceived
- uniqueGiftTypesSent
- legendaryReceivedCount
- pinnedGiftIds

### CoinTransaction
If already exists, extend if needed:
- id
- userId
- publicId
- type
- amount
- balanceBefore
- balanceAfter
- relatedUserId optional
- relatedGiftSendId optional
- note optional
- createdAt

### GiftMessageModeration (optional only if needed)
- id
- userGiftId
- flagged
- reviewedBy
- reviewStatus
- createdAt

---

## M. API / Socket / Query Requirements

Add or fix endpoints/events:

### Read
- `gifts:getCatalog`
- `gifts:getProfileReceived`
- `gifts:getProfileSent`
- `gifts:getProfileTimeline`
- `gifts:getGiftDetails`
- `gifts:getProfileGiftStats`
- `coins:getBalance`

### Write
- `gifts:send`
- `gifts:pinProfileGift`
- `gifts:unpinProfileGift`

### Realtime
- `gifts:received`
- `gifts:sent`
- `gifts:profileUpdated`
- `gifts:timelineUpdated`
- `coins:balanceUpdated`

Do not leak private internal fields.
Only expose what is needed.

---

## N. UI Components to Add or Upgrade

Potential components:

- `SendGiftModal`
- `GiftCatalogGrid`
- `GiftCard`
- `GiftRarityBadge`
- `GiftProfileSection`
- `GiftTimelineList`
- `GiftTimelineRow`
- `GiftStatsPanel`
- `GiftDetailModal`
- `PinnedGiftsStrip`
- `ProfileGiftCollectionCard`
- `GiftNotificationToast`

Keep components modular.
Do not rewrite unrelated pages.

---

## O. Public Profile Data Requirements

When opening any player profile, all viewers should be able to see:

- public ID
- name
- avatar
- normal profile stats
- gifts received
- gifts sent
- public gift timeline
- pinned gifts
- total gifts stats

This is important:
**everyone should be able to see who gifted what to whom** from the profile statistics / profile sections.

---

## P. Performance Considerations

Do not make the profile page too heavy.

Use:
- pagination or limited initial load for long timelines
- lazy loading for gift detail sender lists
- compact queries
- indexed queries for senderUserId / receiverUserId / createdAt
- summary/aggregate queries where appropriate

Suggested initial load:
- featured gifts
- top 8 received gifts
- top 8 sent gifts
- latest 20 timeline events

Then “View More” / pagination.

---

## Q. Abuse / Safety Rules

Prevent abuse:
- no self gifting
- no negative coin bugs
- no client-side price spoofing
- no inactive gift sending
- optional gift message length max 120
- sanitize messages
- rate limit repeated send requests
- prevent duplicate double-submit on rapid clicks

---

## R. Testing Checklist

Test with at least two or three users.

### Scenario 1
- User A has coins
- User A sends Crown to User B
- User A coins decrease correctly
- CoinTransaction is created
- UserGift is created
- User B profile shows Crown in Gifts Received
- User A profile shows Crown in Gifts Sent
- User B public timeline shows Max sent Crown to User B
- User A public timeline shows Max sent Crown to User B

### Scenario 2
- User A sends same gift multiple times
- Gift stacks correctly
- total count increases
- detail modal shows full sender history

### Scenario 3
- User B pins received gift
- gift appears in featured/pinned section

### Scenario 4
- another player opens User B profile
- can see received gifts
- can see sent gifts
- can see who sent the gifts
- can see timestamps

### Scenario 5
- insufficient coins blocks sending
- self gift blocked
- inactive gift blocked

### Scenario 6
- owner can edit catalog
- normal admin cannot
- moderator cannot
- server enforces this

---

## S. Final Output Required

After implementation:
- run server typecheck
- run client build/typecheck
- run safe migration if needed
- confirm no destructive migration
- deploy green on Railway
- test production on `https://voidmafia.one`

Then summarize:
1. changed files
2. new components
3. database changes
4. API/socket changes
5. how public gift visibility works
6. how owner-only economy protection works

---

## T. Branch / Merge / Deploy

Work on the current feature branch.

After implementation is complete:
1. commit and push all changes
2. create PR into `main`
3. if build/typecheck is green and no destructive migration is used, merge into `main`
4. deploy merged `main` to Railway
5. verify both client and server deploy successfully
6. verify production gift system works

Important:
- do not merge if build fails
- do not merge if migration is destructive
- do not reset the database
- do not wipe Railway data
