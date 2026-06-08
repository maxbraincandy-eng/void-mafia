# Void Mafia — Mod Control V2
## Advanced Admin / Moderator Control Center

## Goal

Upgrade the current Mod Control menu into a more complex, professional, real-time moderation dashboard.

Current status:
- Mod Control page exists.
- Dashboard tab exists.
- Rooms tab exists but only shows active rooms count / no rooms.
- Reports, Players, Broadcast tabs exist.
- Admin/mod role detection exists.
- But moderation actions are not deeply integrated into rooms/player profiles.

Required upgrade:
Admins and moderators should be able to monitor rooms, inspect players, send warnings, kick players, ban players, and review reports from a clean cyberpunk-style moderation interface.

---

## Important Safety Rules

Do not break:
- gameplay
- rooms
- roles
- voice/WebRTC
- spectators
- profiles
- messages
- friends
- clans
- gifts/coins/economy
- Google/Facebook login
- Railway deployment

Do not reset database.
Do not use destructive migrations.
Do not use `prisma migrate reset`.

Keep current Void Mafia neon/cyberpunk style.

---

## A. Permission System

Use existing roles:

- OWNER
- ADMIN
- MODERATOR
- SENIOR_MOD if implemented

Permissions:

OWNER:
- all moderation permissions
- economy permissions
- admin management if implemented

ADMIN:
- view all active rooms
- inspect players
- kick player from room
- ban player
- send warning
- resolve reports
- terminate room/game if needed
- send broadcast

MODERATOR:
- view reports
- send warning
- kick player from room if allowed
- temporary ban if allowed
- cannot touch coins/economy

Economy rule:
Admins/moderators must not be able to grant coins or edit gifts unless they are OWNER.

Server must enforce permissions.
Do not rely on UI hiding only.

---

## B. Admin Actions Inside Player Profile Popup

When an admin/mod opens a player profile popup from a room/game/lobby, show an extra moderation section.

Normal user popup actions:
- Send Message
- Add Friend
- Send Gift
- Report Player
- View Full Profile

Admin/mod extra actions:
- Send Warning
- Kick From Room
- Temporary Ban
- View Moderation History
- View Reports About Player

Owner/admin extra if allowed:
- Global Ban
- Remove Ban
- Force Disconnect
- End Player Session

Design:
- Admin actions should be separated visually from normal actions.
- Use danger/warning styling.
- Do not clutter the main profile.
- Use small shield/mod label.

Example:

MOD ACTIONS
- Warning
- Kick
- Ban
- History

Rules:
- Do not show mod actions to normal users.
- Do not allow admin/mod to punish OWNER.
- Lower-level moderators should not punish higher-level admins.
- Server validates rank hierarchy.

---

## C. Kick Player From Room

Admins should be able to kick a player from any room.

Entry points:
- player profile popup
- room player list
- Mod Control → Rooms tab
- Mod Control → Players tab
- report detail page

Kick flow:
1. Admin taps Kick
2. Modal opens:
   - target player
   - current room
   - reason field
   - confirmation button
3. Server validates admin permission
4. Player is removed from room/game
5. Player voice/WebRTC session is disconnected
6. Player receives message:
   “You were removed from the room by a moderator.”
7. Room updates for everyone
8. Action is logged in ModerationLog

Kick should not delete the user account.
Kick is room-specific.

If player is host:
- show stronger confirmation:
  “This player is host. Kicking may close or transfer the room.”
- preferred behavior:
  transfer host if possible, otherwise close room safely

---

## D. Warning System

Admins/mods should be able to send warnings.

Warning flow:
1. Admin taps Send Warning
2. Modal opens with warning categories:
   - Offensive language
   - Voice abuse
   - Spam
   - Game sabotage
   - Harassment
   - Inappropriate avatar/name
   - Bug abuse
   - Other
3. Optional message:
   “Please stop shouting in voice chat.”
4. Submit
5. Target player receives visible warning toast/modal

Player warning UI:
- prominent but not app-breaking
- cyberpunk danger/yellow styling
- text:
  “Moderator Warning”
  category
  message
  moderator name optional
- OK button

Warnings must be saved in database.

Warning fields:
- id
- targetUserId
- targetPublicId
- moderatorUserId
- moderatorPublicId
- category
- message
- roomCode optional
- matchId optional
- createdAt

Warnings should appear in player behavior/moderation history.

---

## E. Ban System

Add or improve ban system.

Ban types:
- room ban
- temporary global ban
- permanent global ban if OWNER/admin allowed
- voice mute if implemented

Ban duration options:
- 15 minutes
- 1 hour
- 6 hours
- 24 hours
- 7 days
- permanent, owner/admin only

Ban modal:
- target player
- duration
- reason
- scope:
  - current room
  - global
- confirm button

Server should block banned users:
- from joining room if room ban
- from using app/game if global ban
- from voice if voice mute

Ban must persist in Railway database.

Ban fields:
- id
- targetUserId
- targetPublicId
- issuedByUserId
- issuedByPublicId
- scope
- reason
- startsAt
- expiresAt
- active
- createdAt

---

## F. Mod Control — Rooms Tab

Improve Rooms tab.

It should show all active rooms in real time.

Each room card should show:
- room code
- room mode/space
- host name + publicId
- player count
- spectator count
- current phase
- day/night number
- voice status
- created time
- status: lobby / active game / ended
- report count in that room if available

Room actions:
- View Room
- View Players
- Join as Moderator Spectator
- Send Room Warning
- Terminate Room, admin/owner only
- Refresh

When tapping a room:
open room detail panel.

Room detail panel:
- room info
- player list
- spectator list
- reports from this room
- active punishments
- kick/warn/ban buttons per player

Important:
Admins should be able to see who is in which room.

---

## G. Mod Control — Players Tab

Improve Players tab.

Show all online players and optionally recently active players.

Each player row:
- avatar
- name
- publicId
- online/offline
- current room code if any
- role: user/admin/mod/owner
- active status
- report count
- warning count
- ban status

Filters:
- online
- in room
- reported
- banned
- admins/mods
- search by name/publicId

Actions:
- View Profile
- Send Warning
- Kick From Room
- Ban
- View History
- View Reports

---

## H. Mod Control — Reports Tab

Improve Reports tab.

Tabs:
- Open
- Reviewing
- Resolved
- Dismissed

Report card:
- target player
- reporter
- category
- description
- room code
- match id
- time
- status

Actions:
- View Target Profile
- View Reporter Profile
- Send Warning
- Kick
- Ban
- Mark Reviewing
- Resolve
- Dismiss
- Add Moderator Note

Reports should update in real time.

---

## I. Mod Control — Broadcast Tab

Broadcast tab should allow admin/owner to send announcements.

Broadcast targets:
- all online users
- all users in active rooms
- specific room
- only lobby users

Message:
- title
- body
- severity:
  - info
  - warning
  - danger
  - system

Broadcast appears as:
- toast
- top banner
- room system message if room-targeted

Only admin/owner can broadcast.
Moderators may be disabled from global broadcast.

---

## J. Moderation Logs

Every moderation action must be logged.

ModerationLog:
- id
- actionType:
  - warning
  - kick
  - ban
  - unban
  - room_terminate
  - report_resolve
  - broadcast
  - force_disconnect
- targetUserId optional
- targetPublicId optional
- moderatorUserId
- moderatorPublicId
- roomCode optional
- matchId optional
- reason optional
- metadataJson optional
- createdAt

Admin/mod history should show:
- warnings
- kicks
- bans
- reports
- moderator notes

Normal users should not see private admin notes.

---

## K. Realtime Events

Add or fix events:

Client to server:
- mod:dashboard
- mod:rooms:list
- mod:room:details
- mod:players:list
- mod:warn
- mod:kick
- mod:ban
- mod:unban
- mod:reports:list
- mod:reports:updateStatus
- mod:broadcast

Server to client:
- mod:dashboardUpdated
- mod:roomsUpdated
- mod:playerUpdated
- mod:reportCreated
- mod:reportUpdated
- mod:warningReceived
- mod:kicked
- mod:banned
- mod:broadcastReceived

Only authorized admins/mods should receive mod events.
Normal users should not subscribe to admin data.

---

## L. Player-Facing Behavior

When a player is warned:
- show modal/toast:
  “Moderator Warning”
- include reason/message
- OK button

When kicked:
- remove them from room
- disconnect voice/WebRTC
- redirect to lobby
- show:
  “You were removed from the room by a moderator.”

When banned:
- redirect to lobby or blocked page
- show ban reason and expiration time

---

## M. Room/Game Integration

Moderation must not break active game state.

If a player is kicked during active game:
- mark player as removed
- remove from voice
- remove from active table
- if alive, handle as removed/dead depending on current game rules
- update room state
- check win condition if needed
- log action

If spectator is kicked:
- remove spectator only
- do not affect game state

If host is kicked:
- transfer host if possible
- otherwise close room safely
- log action

---

## N. UI Design

Keep current neon green Mod Control aesthetic.

Improve layout:
- cards
- tabs
- clear action buttons
- mobile-first
- no horizontal overflow
- easy touch targets
- danger actions require confirmation

Admin action colors:
- warning: yellow/orange
- kick: red/orange
- ban: red
- resolve: green
- info: cyan

---

## O. Testing Checklist

Test:

1. Admin opens player profile in room
Expected:
- normal actions appear
- mod actions appear separately
- kick/warn/ban buttons visible

2. Normal user opens same popup
Expected:
- no mod actions visible

3. Admin sends warning
Expected:
- target receives warning UI
- warning saved to DB
- warning appears in moderation history

4. Admin kicks player
Expected:
- player removed from room
- voice/WebRTC disconnected
- room updates
- action logged

5. Rooms tab
Expected:
- active rooms list appears
- each room shows players
- admin can kick/warn from room detail

6. Players tab
Expected:
- online players visible
- current room visible
- search works
- actions work

7. Reports tab
Expected:
- reports appear
- admin can resolve/warn/kick/ban from report

8. Permission check
Expected:
- normal user cannot call mod APIs
- lower moderator cannot punish owner/admin if hierarchy disallows

9. Redeploy
Expected:
- moderation logs, bans, warnings persist

---

## P. Final Verification

After implementation:
- run server typecheck
- run client build/typecheck
- run safe migration if needed
- deploy green on Railway
- test production
- summarize changed files
- summarize new database tables
- summarize new mod events
- summarize permission rules

Important:
Admins/mods need real power from inside player popup and from the Mod Control page:
- see who is in which room
- warn
- kick
- ban
- review reports
- log all actions
