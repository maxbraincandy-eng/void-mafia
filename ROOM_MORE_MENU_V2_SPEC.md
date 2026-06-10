Void Mafia — Room More Menu V2

Goal

Improve the existing top-left three-dots / More menu inside rooms and game screens.

The More menu should become the main control center for room-related actions.

Important:
Do not clutter the main game screen.
Do not add too many buttons directly on the table/game UI.
Put secondary actions inside the left top More menu.

Do not break:

* gameplay
* room lifecycle
* voice/WebRTC
* roles
* spectators
* waiting players
* gifts/coins
* admin/mod
* profiles
* notifications
* ranked
* clans
* auth
* Railway deployment

Do not reset database.
Do not use destructive migrations.

⸻

A. More Menu Placement

Keep the More menu button:

* top-left corner
* three dots / hamburger / options icon
* visible in:
    * room lobby
    * active game
    * game over screen
    * waiting player view
    * spectator theater view

It should be mobile-friendly and easy to tap.

⸻

B. Menu Sections

Organize the More menu into clean sections.

Suggested sections:

1. Room
2. Voice
3. Spectators
4. Invite / Share
5. Settings
6. Player Tools
7. Admin / Mod, only for admins/mods
8. Danger Zone

Use collapsible sections if menu becomes long.

⸻

C. Room Section

Show:

* room code
* copy room code
* copy room invite link
* room mode: casual/ranked
* room theme
* player count
* spectator count
* room status: lobby / active / game over

Actions:

* Copy Room Code
* Copy Invite Link
* Share Room

If game is active:

* invite link should open join choice:
    * Join as Waiting Player
    * Join as Spectator

⸻

D. Voice Section

Show:

* voice status
* connected / disconnected
* mic status
* camera status
* reset connection button
* join/leave voice if needed

Actions:

* Join Voice
* Leave Voice
* Reset Connection
* Toggle Mic
* Toggle Camera

Important:
Do not let spectators speak.
Do not let dead players speak.
Do not let waiting players speak as active players.
Respect server voice permissions.

⸻

E. Spectators Section

Show:

* eye icon
* spectator count
* spectator list
* spectator names
* spectator avatars
* publicId
* online status

If no spectators:
“No spectators”

Actions:

* host/admin can remove spectator if moderation allows
* normal users only view

Spectators should not appear in active player list.

⸻

F. Invite / Share Section

Add invite and referral actions here.

Show:

* Copy Room Invite Link
* Invite Friend to Room
* Share Room
* Copy My Referral Link
* Invite to Void Mafia

If user is in a clan and has permission:

* Invite to Clan

Rules:

* room invite link should not expose room password
* if room is private/passworded, invitee still needs password unless invite-token system exists
* referral rewards must be server-side validated

⸻

G. Settings Section

Add Settings inside this More menu.

For all users:

* notification settings shortcut
* sound/music settings
* theme preference if user-level theme exists
* language setting if implemented
* accessibility/reduced motion if implemented

For host only before game starts:

* room settings
* timer settings
* role presets
* spectator settings
* voice required setting
* room theme
* private/password room settings
* ranked/casual rules

For active game:

* host can view settings but cannot change critical settings unless safe

⸻

H. Player Tools Section

Show shortcuts:

* Player List
* Waiting Players
* Dead Players
* Role Guide
* Game Rules
* Current Roles Enabled
* Phase Flow / Help

Current Roles Enabled:

* show roles enabled in this room
* do not reveal assigned secret roles
* only show role setup/list

Example:
Enabled Roles:

* Mafia x2
* Sheriff x1
* Doctor x1
* Citizen x5
* Yakuza x1
* Shogun x1

⸻

I. Notifications Shortcut

Add Notifications shortcut inside More menu.

Show:

* notification bell
* unread count
* open Notifications Center

This is useful if active game top bar is too crowded.

⸻

J. Gifts / Profile Shortcut

Optional shortcuts:

* Open My Profile
* Open Gifts
* Open Store
* Open Daily Missions
* Open Achievements

Only include if not too cluttered.
If too many, put them under “My Account”.

⸻

K. Admin / Mod Section

Only visible to admins/mods.

Show:

* Mod Control
* Reports
* Room Reports
* Active Room Players
* Warn Player
* Kick Player
* Ban Player
* Broadcast to Room
* Terminate Game
* Terminate Room

Admins/mods should be able to see:

* who is in current room
* waiting players
* spectators
* reports from this room
* moderation actions

All actions must be server-side validated.
Do not rely on UI hiding only.

⸻

L. Danger Zone

Danger/destructive actions should be separated at the bottom.

For all users:

* Leave Room

For host:

* Leave Room / Close Room warning
* Terminate Game
* Close Room

Rules:

* regular Leave Room requires confirmation
* host Leave Room requires stronger confirmation:
    “You are the host. Leaving will close the room for everyone.”
* Terminate Game returns room to lobby but does not delete room
* Close Room deletes/terminates room

⸻

M. UI Design

Design:

* dark glassmorphism panel
* Void Mafia neon/cyberpunk style
* section headers
* icons
* large touch-friendly rows
* no cramped buttons
* destructive actions red
* settings neutral/cyan
* admin tools green/yellow/red

Mobile:

* bottom sheet preferred
* full-height scroll if needed
* safe-area padding
* close button
* no horizontal overflow

⸻

N. Testing Checklist

Test:

1. Open More menu in lobby
    Expected:

* room, voice, spectators, invite, settings, leave actions visible

2. Open More menu during active game
    Expected:

* critical game actions not hidden
* settings visible but unsafe changes disabled

3. Host opens More menu
    Expected:

* host tools visible

4. Normal player opens More menu
    Expected:

* no admin/host-only actions

5. Admin opens More menu
    Expected:

* admin/mod section visible

6. Spectator opens More menu
    Expected:

* spectator-safe controls only

7. Invite link
    Expected:

* copies correctly
* active game invite shows Waiting Player / Spectator choice

8. Leave room
    Expected:

* confirmation appears
* host warning works correctly

9. Mobile
    Expected:

* menu scrolls cleanly
* buttons easy to tap

⸻

O. Final Verification

After implementation:

* run server typecheck
* run client build/typecheck
* deploy green
* test production
* summarize changed files
* summarize menu sections added
* summarize permission rules
* list limitations

____


Also improve the existing top-left three-dots More menu.

Put secondary room/game actions there instead of cluttering the main screen.

Add sections:
- Room
- Voice
- Spectators
- Invite / Share
- Settings
- Player Tools
- Notifications
- Admin / Mod, only for admins/mods
- Danger Zone

Important:
Invite links, room settings, spectator list, enabled roles, notifications, reset connection, leave room, terminate game, and mod controls should be accessible from this More menu where appropriate.

Do not break gameplay or voice.
Do not reset database.
Server must still validate host/admin permissions.
