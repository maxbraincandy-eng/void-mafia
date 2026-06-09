# Void Mafia Expansion Roadmap
## Premium Social Mafia Platform Upgrade

## Goal

Turn Void Mafia from a simple Mafia game into a full premium social Mafia platform with:
- VIP status
- profile frames
- role card skins
- player titles
- achievements V2
- daily missions
- match replay
- Mafia newspaper
- clan wars
- ranked mode
- custom room themes
- advanced host tools
- spectator theater
- role-specific tools

Important:
Do not implement everything in one huge risky change.
Implement in phases.
Each phase must be stable before moving to the next.

Do not reset database.
Do not use destructive migrations.
Do not use prisma migrate reset.
Do not break current gameplay, rooms, roles, voice, WebRTC, profiles, clans, gifts, coins, admin, messages, reports, Google/Facebook login, or Railway deployment.

Use safe migrations only.

---

# Phase 1 — Cosmetic Identity System

Implement first because it improves the app visually and connects naturally with coins/gifts.

Add:
1. Profile Frames
2. Avatar Borders
3. Player Titles
4. Role Card Skins
5. Profile Badge Showcase

## Profile Frames

Players can unlock/select profile frames.

Examples:
- Cyber Don Frame
- Neon Sheriff Frame
- Blood Moon Frame
- Golden Mafia Frame
- Void Crown Frame
- Cult Ritual Frame
- Yakuza Shadow Frame

Frames should appear:
- profile page
- player popup
- room player cards
- leaderboard
- chat/avatar display
- gift sender list

## Player Titles

Players can equip titles.

Examples:
- The Godfather
- Silent Killer
- City Sheriff
- Void Citizen
- Night Owl
- Clan Boss
- The Betrayer
- Doctor of Death
- Shadow Shogun
- Cult Prophet

Titles appear under name or near profile header.

## Role Card Skins

Players can unlock role card visual skins.

Examples:
- Classic Mafia
- Neon Mafia
- Golden Don
- Cyber Sheriff
- Void Doctor
- Cult Ritual
- Yakuza Noir
- Shogun Shadow

Role card skin must not change role logic.
Only visual.

## Safety

Do not touch game rules.
Do not reveal hidden roles.
Do not break current role cards.

---

# Phase 2 — Achievement System V2 + Daily Missions

Add deeper achievement progression.

## Achievements

Examples:
- Win 10 games as Mafia
- Save 5 players as Doctor
- Catch Mafia as Sheriff
- Survive 10 nights
- Win without speaking
- Get eliminated first 5 times
- Send 10 gifts
- Receive legendary gift
- Create a clan
- Win clan war
- Win as Yakuza
- Win as Shogun
- Win as Cult Leader

Achievements should give:
- XP
- coins
- titles
- frames
- badges

## Daily Missions

Examples:
- Play 1 game
- Send 1 gift
- Win as Town
- Vote correctly once
- Survive one night
- Join voice
- Send one message
- Report toxic behavior if needed

Rewards:
- coins
- XP
- mission streak
- achievement progress

Daily missions reset every 24 hours.

Server-side validation required.
No client-side fake rewards.

---

# Phase 3 — Match Replay + Mafia Newspaper

After each completed match, create a cinematic game recap.

## Match Replay Timeline

Show:
- Day/Night sequence
- nominations
- votes
- deaths
- saves
- investigations
- role reveals after game end
- winner
- MVP

Example:
Night 1: Mafia killed Nika
Day 1: Max nominated Giorgi
Tribunal: Giorgi eliminated
Night 2: Doctor saved Max
Final: Mafia won

## Mafia Newspaper

Generate a fun newspaper-style recap:

VOID TIMES
“Mafia strikes again in Room A7K92”
“Sheriff failed to detect the Don”
“Doctor saved the wrong target”
“MVP: Max”

Should be shareable as text first.
Image generation/share card can be later.

Do not expose hidden roles before game ends.

---

# Phase 4 — MVP / End Game Awards

After match ends, show awards:

- MVP
- Best Liar
- Best Detective
- Best Survivor
- Most Suspicious
- Silent Killer
- Worst Vote
- Clutch Doctor
- Most Chaotic
- Best Nomination
- Best Mafia Play

Awards should be calculated from match events where possible.
If data is missing, keep it simple and avoid fake claims.

Awards can give XP/coins later.

---

# Phase 5 — Clan Wars + Seasons

Upgrade clans into competitive systems.

Add:
- clan season
- clan points
- clan leaderboard
- clan war history
- clan achievements
- clan trophies
- clan gifts
- clan vault
- clan role permissions

Clan wars:
- clan vs clan match history
- clan win/loss
- clan seasonal ranking
- trophies shown on clan profile

Do not break existing clan data.

---

# Phase 6 — Ranked Mode

Add separate Ranked mode.

Ranked rules:
- stricter disconnect penalty
- stats count toward rank
- Elo/rating system
- no fake/abandoned games counted
- stricter anti-abuse

Ranks:
- Bronze
- Silver
- Gold
- Platinum
- Diamond
- Godfather
- Void Don

Ranked and casual should be separate.
Do not force all rooms to be ranked.

---

# Phase 7 — Custom Room Themes + Host Tools V2

Add host customization.

Host settings:
- timers
- enable/disable roles
- private room password
- spectators allowed
- voice required
- ranked/unranked
- minimum account level
- kick from lobby
- max spectators
- allow/disallow gifts in room
- allow/disallow chat

Room themes:
- Neon City
- Mafia Mansion
- Rainy Alley
- Cult Basement
- Police Station
- Void Chamber
- Cyber Casino
- Yakuza Rooftop

Themes are visual only.
Do not break game logic.

---

# Phase 8 — Spectator Theater

Upgrade spectator experience.

Spectators should have:
- theater mode
- spectator list
- spectator-only chat
- reactions
- no speaking
- no private mafia/yakuza radio
- after game ends, reveal all roles

Spectator chat must never leak to active players if hidden.

---

# Phase 9 — Role-Specific Interfaces

Add special UI for roles.

## Sheriff Case File
Sheriff sees:
- checked players
- results
- notes
- suspect list

## Mafia Secret Board
Mafia sees:
- team members
- selected targets
- mafia vote target
- private radio button
- night plan

## Doctor Protection Log
Doctor sees:
- previous protected players
- cannot protect same player twice if rule exists
- save history after game if public

## Yakuza / Shogun Board
Yakuza and Shogun see each other.
Yakuza can select kill.
Shogun supports Yakuza win condition.

Do not leak role UI to wrong players.

---

# Phase 10 — Shareable Profile Cards

Allow users to share profile cards.

Profile card includes:
- avatar
- name
- publicId
- level
- win rate
- clan
- rank
- rarest gift
- title
- frame

First version can be an in-app card.
Image export can be later.

---

# Implementation Rules

1. Work phase by phase.
2. One feature branch per major phase.
3. Use spec files for each phase.
4. Do not merge to main until:
   - server typecheck passes
   - client build/typecheck passes
   - database migration is safe
   - Railway deploy is green
5. Do not reset database.
6. Do not break existing systems.

Recommended branch order:

- feature/cosmetic-identity-system
- feature/achievements-daily-missions
- feature/match-replay-newspaper
- feature/clan-wars-seasons
- feature/ranked-mode
- feature/room-themes-host-tools
- feature/spectator-theater
- feature/role-specific-ui

---

# First Task

Start with Phase 1 only:

Cosmetic Identity System:
- profile frames
- avatar borders
- player titles
- role card skins
- profile badge showcase

Do not implement all phases at once.
