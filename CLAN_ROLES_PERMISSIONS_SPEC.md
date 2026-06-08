Void Mafia — Clan Roles & Clan Room Permissions
Goal
Add clan-specific roles and permissions.
Clans should have internal hierarchy:
* Clan Owner / Leader
* Clan Admin
* Clan Moderator
* Clan Member
Clan Admins and Clan Moderators should have limited moderation powers only inside rooms created by their own clan.
Important: Clan roles are NOT global admin/mod roles. Clan Admin / Clan Moderator permissions apply only to clan-created rooms. They must not have global site moderation powers.
Do not reset database. Do not use destructive migrations. Do not use prisma migrate reset.
Do not break:
* gameplay
* rooms
* roles
* voice/WebRTC
* spectators
* waiting players
* profiles
* clans
* messages
* gifts/coins
* cosmetics
* ranked mode
* tournament mode
* notifications
* admin/mod system
* reports
* auth
* Railway deployment
Use safe migrations only.
 
⸻
 
A. Clan Roles
Add clan roles:
1. Clan Owner / Leader
* full control over clan
* can promote/demote members
* can remove members
* can assign Clan Admin
* can assign Clan Moderator
* can edit clan settings
* can manage clan-created rooms
* has highest clan authority
2. Clan Admin
* can manage clan members depending on owner settings
* can kick users from clan-created rooms
* can send warnings in clan-created rooms
* can mute voice in clan-created rooms if voice mute system exists
* can manage clan room settings if allowed
* cannot delete clan unless owner allows
* cannot override Clan Owner
3. Clan Moderator
* can warn users in clan-created rooms
* can kick users from clan-created rooms if allowed
* can report/manage room behavior inside clan-created rooms
* cannot promote/demote admins
* cannot edit core clan settings
* cannot remove Clan Owner/Admin unless permission allows
4. Clan Member
* normal member
* no moderation power
 
⸻
 
B. Clan Role Badges / Shields
Add visual badges next to nickname.
Clan Owner:
* crown shield or gold shield
* label: Clan Leader
Clan Admin:
* shield icon
* color: purple/gold or red/gold
* label: Clan Admin
Clan Moderator:
* shield icon
* color: cyan/blue or green/cyan
* label: Clan Moderator
Clan Member:
* no shield or small clan tag only
These badges should appear in:
* clan member list
* clan profile
* clan-created room lobby
* player popup inside clan-created room
* active game player list inside clan-created room
* room player list
* chat messages inside clan-created room, if not too cluttered
Important: Do not confuse clan shields with global admin/mod shields.
Global admin/mod shield:
* site-wide authority
* higher priority
Clan shield:
* clan-room authority only
* should be visually different from global admin shield
Example: Global Admin: green shield Clan Admin: purple/gold clan shield Clan Moderator: cyan/blue clan shield
 
⸻
 
C. Clan Room Definition
A room is a clan-created room if:
* created by clan owner/admin/member using clan room option
* room has clanId
* room is associated with that clan
Room should store:
* clanId optional
* clanName optional
* clanTag optional
* createdByClanMemberUserId
* clanRoom: boolean
Only rooms with matching clanId allow clan role permissions.
 
⸻
 
D. Permission Scope
Clan Admin / Clan Moderator powers apply only when:
* current user belongs to the same clan as the room
* room.clanId matches user.clanId
* user has clan role: owner/admin/moderator
* action is allowed by clan role
* target is not higher clan role unless allowed
Clan powers do NOT apply:
* in public non-clan rooms
* in other clans’ rooms
* in ranked/tournament rooms unless rules allow it
* outside rooms
* to global economy
* to global reports/admin system
* to global bans unless user is also global admin/mod
 
⸻
 
E. Clan Room Moderation Actions
Inside own clan-created room, Clan Admin / Clan Moderator can:
Clan Owner:
* warn player
* kick player from clan room
* mute player voice in clan room if supported
* ban user from clan rooms if implemented
* terminate clan room
* change clan room settings before game starts
* remove spectator from clan room
Clan Admin:
* warn player
* kick player from clan room
* mute player voice in clan room if supported
* remove spectator from clan room
* change some clan room settings if owner allows
Clan Moderator:
* warn player
* kick player from clan room if allowed
* mute voice if allowed
* remove spectator if allowed
Clan Member:
* no mod actions
All actions must be server-side validated.
 
⸻
 
F. Clan Warnings
Clan moderators/admins can send warnings inside clan rooms.
Warning should show to target: “Clan Moderator Warning” or “Clan Admin Warning”
Include:
* category
* message
* clan name/tag
* moderator name
Save warning in moderation log as clan-scoped warning.
Fields:
* id
* clanId
* roomCode
* targetUserId
* moderatorUserId
* moderatorClanRole
* category
* message
* createdAt
 
⸻
 
G. Clan Room Kick
Clan Admin/Moderator can kick a user from their clan-created room.
Rules:
* kick only removes user from current clan room
* does not globally ban user
* does not affect account
* disconnect voice/WebRTC from that room
* redirect user to lobby
* log action
Message to kicked user: “You were removed from this clan room by a clan moderator.”
Room message: “PlayerName was removed by clan moderation.”
 
⸻
 
H. Clan Room Ban / Block Optional
Add optional clan-room ban:
ClanRoomBan:
* id
* clanId
* targetUserId
* issuedByUserId
* reason
* expiresAt optional
* active
* createdAt
If user is clan-room banned:
* cannot join rooms created by that clan
* can still use site normally
* can still join other rooms unless globally banned
This is optional if too complex. If not implemented, mark as coming soon.
 
⸻
 
I. Clan Role Management UI
Clan profile should have a Management tab for Clan Owner/Admin.
Clan Owner can:
* promote member to Clan Admin
* promote member to Clan Moderator
* demote member
* remove member
* transfer ownership, with confirmation
* set clan role permissions if advanced
Clan Admin can:
* promote/demote moderators only if owner allows
* remove regular members if allowed
Clan Moderator:
* cannot manage clan roles by default
UI:
* member list
* role dropdown
* shield preview
* confirm modal for promotions/demotions
 
⸻
 
J. Player Popup Inside Clan Room
When clicking player inside clan-created room:
If current viewer has clan moderation permission: show extra section:
Clan Moderation
* Send Clan Warning
* Kick From Clan Room
* Clan Room Ban, if implemented
* View Clan Room History
Only show this section when:
* current room is clan-created
* viewer has proper clan role
* viewer’s clanId matches room.clanId
Do not show in normal rooms.
 
⸻
 
K. More Menu Integration
Inside left top three-dots More menu, add Clan Room section if room is clan-created.
Show:
* clan name/tag
* clan room badge
* clan moderators online
* clan room rules
* clan room reports if available
For clan admins/mods:
* Clan Room Moderation
* Player List
* Warnings
* Kick Tools
* Room Settings if allowed
Keep main game screen clean.
 
⸻
 
L. Rank Hierarchy Protection
Prevent abuse.
Clan Moderator cannot punish:
* Clan Owner
* Clan Admin, unless owner explicitly allows
* Global Admin/Owner
Clan Admin cannot punish:
* Clan Owner
* Global Admin/Owner
Clan Owner cannot override global owner/admin protections if global system disallows it.
Global OWNER/ADMIN has priority over clan roles.
 
⸻
 
M. Database Models
Add/extend safely.
ClanMember:
* clanRole:  
    * owner
    * admin
    * moderator
    * member
* roleAssignedAt
* roleAssignedByUserId optional
Room:
* clanId optional
* clanRoom boolean
* clanTag optional
ClanModerationLog:
* id
* clanId
* roomCode
* actionType:  
    * clan_warning
    * clan_kick
    * clan_room_ban
    * clan_unban
    * clan_role_promote
    * clan_role_demote
* targetUserId optional
* moderatorUserId
* moderatorClanRole
* reason optional
* metadataJson optional
* createdAt
Optional: ClanRoomBan:
* id
* clanId
* targetUserId
* issuedByUserId
* reason
* expiresAt optional
* active
* createdAt
Do not wipe existing clan members.
Existing clan owners should be automatically assigned clanRole = owner. Existing clan members should be assigned clanRole = member.
 
⸻
 
N. API / Socket Events
Add or fix:
Clan role management:
* clan:roles:list
* clan:roles:updateMemberRole
* clan:roles:transferOwnership
Clan room moderation:
* clanRoom:warn
* clanRoom:kick
* clanRoom:ban
* clanRoom:unban
* clanRoom:getModerationLog
Server to client:
* clan:memberRoleUpdated
* clanRoom:warningReceived
* clanRoom:kicked
* clanRoom:moderationLogUpdated
* room:update
Server must validate:
* same clan
* correct clan role
* room belongs to clan
* rank hierarchy
* global owner/admin protection
 
⸻
 
O. UI Design
Use Void Mafia clan style.
Clan Owner badge:
* gold crown shield
Clan Admin badge:
* purple/gold shield
Clan Moderator badge:
* cyan/blue shield
Badges should be small and readable. Do not clutter names too much. Use tooltip/tap label: “Clan Admin” “Clan Moderator”
 
⸻
 
P. Testing Checklist
Test:
1. Existing clan owner Expected:
* has clan owner role
* gold clan shield visible
2. Clan owner promotes member to admin Expected:
* member becomes Clan Admin
* admin shield appears
3. Clan owner promotes member to moderator Expected:
* moderator shield appears
4. Clan Admin in clan-created room Expected:
* can warn/kick according to permissions
5. Clan Moderator in clan-created room Expected:
* can use allowed clan moderation tools
6. Clan Moderator in normal public room Expected:
* no clan mod powers
7. Clan Admin in another clan’s room Expected:
* no clan mod powers
8. Normal clan member Expected:
* no moderation tools
9. Clan kick Expected:
* target removed from room
* voice/WebRTC disconnected
* action logged
10. Global admin/owner Expected:
* cannot be punished by lower clan role
11. Redeploy Expected:
* clan roles persist
 
⸻
 
Q. Final Verification
After implementation:
* run server typecheck
* run client build/typecheck
* run safe migration if needed
* confirm no destructive migration
* deploy green on Railway
* test production
* summarize changed files
* summarize database changes
* summarize clan role permissions
* summarize badge colors/icons
* summarize limitations
 
⸻
 
R. Branch / Merge / Deploy
Work on branch:
feature/clan-roles-permissions
After build/typecheck pass:
1. commit and push
2. create PR into main
3. do not merge if build fails
4. do not merge if migration is destructive
5. merge only after confirmation
6. deploy main to Railway
7. verify production on https://voidmafia.one




___


I added CLAN_ROLES_PERMISSIONS_SPEC.md.

Please implement clan roles and clan-room-only permissions.

Important:
Clan Admin and Clan Moderator are NOT global admins.
Their powers only apply inside rooms created by their own clan.

Add:
- Clan Owner / Clan Admin / Clan Moderator / Clan Member roles
- different small shield badges near nickname
- clan role management in clan profile
- clan-room-only warning/kick tools
- clan moderation section in player popup only inside clan-created rooms
- clan room section in the left top three-dots More menu
- server-side permission validation
- clan moderation logs

Do not reset database.
Do not use destructive migrations.
Do not break existing clans, rooms, gameplay, profiles, admin, gifts, coins, auth, voice, or deployment.

Before coding, summarize what files you will change.
After build/typecheck pass, commit and push to feature/clan-roles-permissions.
