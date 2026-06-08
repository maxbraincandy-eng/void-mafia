Void Mafia — Spectator Theater V2

Goal

Upgrade spectator mode into a polished “Theater Mode” experience.

Spectators should be able to watch games comfortably, react, and follow the match without interfering with gameplay.

Important:
Spectators must never affect active gameplay.
Spectators must not speak in voice.
Spectators must not vote.
Spectators must not nominate.
Spectators must not use role actions.
Spectators must not hear Mafia/Yakuza/Cult private radio.
Spectators must not see hidden roles before game over.

Do not break:

* gameplay
* rooms
* roles
* voice/WebRTC
* nominations
* tribunal voting
* waiting players
* admin/mod system
* gifts/coins
* profiles
* clans
* messages
* Google/Facebook login
* Railway deployment

Do not reset database.
Do not use destructive migrations.
Do not use prisma migrate reset.

⸻

A. Spectator Theater Mode

When a user joins as spectator, show a dedicated spectator UI.

Spectator UI should show:

* current phase
* day/night number
* timer
* alive players
* dead players
* nominations if phase allows public viewing
* tribunal candidates
* vote result if public
* morning announcement
* game over reveal after match ends

Spectator UI should feel like a theater/broadcast view, not like a player UI.

Use Void Mafia cyberpunk/neon style.

⸻

B. Spectator Role Restrictions

Server must strictly enforce:

Spectators cannot:

* speak in voice
* unmute mic
* use camera as active table participant
* vote
* nominate
* use foul/interrupt
* perform night actions
* receive a role
* count in win condition
* appear in active player grid/table
* hear Mafia Radio
* hear Yakuza Radio
* hear Cult private channel if added
* see hidden roles during active game

Spectators can:

* watch public game state
* listen to public voice if room setting allows
* read public announcements
* write in spectator chat if enabled
* react with spectator reactions
* see full role reveal after game over

⸻

C. Spectator List / Eye Menu

Keep the eye icon spectator menu.

Improve it:

* show spectator count
* show spectator names
* show avatar/initials
* show publicId
* show online status
* admin/mod shield if applicable

Spectators should only appear in this spectator menu, not in active player list.

⸻

D. Spectator Chat

Add optional spectator-only chat.

Rules:

* spectator chat is visible only to spectators and admins/mods
* active players cannot see spectator chat during active game
* spectator chat must not leak information to players
* spectators cannot send messages to active player chat during game unless room setting allows

Room setting:

* spectatorChatEnabled: true/false

Default:

* enabled for spectators only

Moderation:

* admin/mod can see spectator chat
* report message if needed
* mute abusive spectator if mute system exists

⸻

E. Spectator Reactions

Add spectator reactions.

Spectators can react with small non-invasive reactions:

Examples:

* 👀 Watch
* 🔥 Hype
* 💀 Dead
* 🕵️ Suspicious
* 👑 Boss
* ⚡ Shock

Important:
Reactions should not reveal information.
Reactions should not spam or distract players.

Default behavior:

* reactions visible only to spectators
* optional room setting: allow public spectator reactions after game over only

Rate limit:

* one reaction every few seconds per spectator

⸻

F. Game Broadcast Timeline

Spectators should see a public timeline of safe events:

During active game:

* phase changed
* nomination happened
* tribunal started
* player eliminated publicly
* night ended
* morning announcement

Do not show:

* Mafia target choices
* Sheriff checks
* Doctor protection
* hidden role actions
* private faction info

After game over:

* show full replay if Match Replay system exists
* reveal roles
* show full timeline

⸻

G. Spectator Voice Rules

If room setting allows spectators to listen:

* spectators can hear public discussion
* spectators cannot transmit audio
* spectators are always listen-only
* spectators cannot join active voice participant list
* spectators cannot appear as speaker
* spectators cannot use mic/camera controls as player
* spectators cannot hear private radios

If spectator tries to unmute:

* block client-side
* reject server-side
* show:
    “Spectators are listen-only.”

⸻

H. Spectator Join Flow

When game is active and user joins room:

Show choice:

* Join as Waiting Player
* Join as Spectator

If they choose spectator:

* add to spectator list
* open spectator theater view
* no role assigned
* no active player slot used

If spectators disabled:

* hide spectator option
* show “Spectators are disabled in this room.”

If spectator limit reached:

* show “Spectator limit reached.”

⸻

I. Spectator UI Layout

Spectator theater screen should include:

Top:

* room code
* phase
* timer
* spectator badge
* eye icon count

Main:

* alive players grid/list
* dead players section
* public phase message

Side/bottom:

* spectator chat
* reactions
* public event timeline

Mobile:

* tabs or collapsible panels:
    * Watch
    * Chat
    * Timeline
    * Spectators

Do not clutter player game UI.

⸻

J. Admin/Moderator Spectator Powers

Admins/moderators can join any room as moderator spectator.

Mod spectator should:

* be hidden or marked as admin depending on policy
* not affect player count
* not receive role
* not speak unless admin broadcast/mod function allows
* see moderation controls if allowed
* still not hear Mafia/Yakuza private radio unless owner-only debug mode is explicitly implemented

Default:
Admins/mods should not hear private radios to preserve game integrity.

⸻

K. Game Over Spectator Reveal

After game over:

Spectators can see:

* all roles
* winner
* match replay
* awards
* newspaper recap
* full public game summary

Spectators can then:

* join next round as waiting player if room allows
* stay spectator
* leave room

⸻

L. Server State

Use clear participant type:

* active_player
* waiting_player
* spectator
* eliminated_player/dead active player

Spectator state must survive refresh/reconnect.

If spectator reconnects:

* restore spectator status
* do not convert to player
* do not duplicate user

⸻

M. API / Socket Events

Add or verify:

Client to server:

* spectator:join
* spectator:leave
* spectator:chatMessage
* spectator:reaction
* spectator:getList

Server to client:

* spectator:listUpdated
* spectator:chatMessage
* spectator:reaction
* spectator:theaterState
* spectator:eventTimelineUpdated

Validation:

* spectator chat only if enabled
* reaction rate limit
* no spectator voice transmit
* no private radio access

⸻

N. Room Settings

Add spectator settings:

* allowSpectators
* maxSpectators
* spectatorChatEnabled
* spectatorsCanHearPublicVoice
* spectatorReactionsEnabled

Default:

* allowSpectators: true
* maxSpectators: 20
* spectatorChatEnabled: true
* spectatorsCanHearPublicVoice: true
* spectatorReactionsEnabled: true

Private room settings should still apply.

⸻

O. Testing Checklist

Test:

1. Join as spectator before game starts
    Expected:

* appears in spectator list
* not player list
* cannot ready as player

2. Join as spectator after game starts
    Expected:

* theater mode opens
* no role assigned
* no voting/action buttons

3. Spectator voice
    Expected:

* can listen if allowed
* cannot speak
* cannot hear Mafia/Yakuza radio

4. Spectator chat
    Expected:

* spectators can chat with spectators
* active players do not see spectator chat

5. Spectator reactions
    Expected:

* reactions work
* rate limited
* do not affect gameplay

6. Game over
    Expected:

* spectators see full reveal and replay

7. Refresh/reconnect
    Expected:

* spectator remains spectator
* no duplicate user

8. Spectators disabled
    Expected:

* spectator join blocked

9. Admin/mod spectator
    Expected:

* can monitor room
* does not affect gameplay

⸻

P. Final Verification

After implementation:

* run server typecheck
* run client build/typecheck
* run safe migration if needed
* confirm no destructive migration
* deploy green on Railway
* test production
* summarize changed files
* summarize spectator rules
* summarize new UI/components
* summarize limitations

⸻

Q. Branch / Merge / Deploy

Work on branch:

feature/spectator-theater-v2

After build/typecheck pass:

1. commit and push
2. create PR into main
3. do not merge if build fails
4. do not merge if migration is destructive
5. merge only after confirmation
6. deploy main to Railway
7. verify production on https://voidmafia.one
