# VOID MAFIA

Cyberpunk neon social deduction game (Mafia/Werewolf variant) built with a React + TypeScript client and a Node.js + Socket.IO server.

## Overview

- Real-time multiplayer game rooms with automated phase engine (night / day / voting / speech)
- 11 roles across Town, Mafia, and Neutral factions
- In-game voice chat via WebRTC
- Player profiles, stats, clans, and a global leaderboard
- Full Moderator / Admin system with ban, mute, warn, kick, and report management

---

## Running Locally

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install

```bash
npm install
```

This installs dependencies for the root workspace and both `server` and `client` packages.

### Development (hot reload)

```bash
npm run dev
```

Starts both the server (port 3000 by default) and the Vite dev server for the client concurrently.

### Production Build

```bash
npm run build
npm start
```

`npm start` runs `server/dist/index.js` with `NODE_ENV=production`.

---

## Environment Variables

Create a `.env` file in the repo root (or set these in your hosting provider):

Production requires `AUTH_SESSION_SECRET` to be a random value at least 32 characters long.
When PostgreSQL uses a private or custom certificate authority, set `DATABASE_SSL_CA` to its PEM certificate.

| Variable | Required | Description |
|---|---|---|
| `AUTH_SESSION_SECRET` | Production | Random signing secret, at least 32 characters |
| `DATABASE_SSL_CA` | If needed | PEM CA certificate for a private PostgreSQL TLS certificate |

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |
| `MODERATOR_IDS` | No | Comma-separated profile IDs granted `moderator` level |
| `SENIOR_MOD_IDS` | No | Comma-separated profile IDs granted `senior_moderator` level |
| `ADMIN_IDS` | No | Comma-separated profile IDs granted `admin` level |
| `OWNER_IDS` | No | Comma-separated profile IDs granted `owner` level |

Example `.env`:

```env
PORT=3000
NODE_ENV=development
MODERATOR_IDS=abc123,def456
SENIOR_MOD_IDS=ghi789
ADMIN_IDS=jkl000
OWNER_IDS=mno111
```

---

## Account Security Upgrade

Socket sign-in now requires a server-signed session token. Existing accounts with email or OAuth sign-in can recover access by signing in again. Legacy guest-only profiles did not have a secret proving ownership, so the server will not accept their old client-stored IDs as credentials. Those database rows are retained, but their profile data cannot be safely attached to a new guest account automatically.

---

## Moderator System

### Room Host vs. App Moderator

| | Room Host | App Moderator |
|---|---|---|
| Scope | A single game room | The entire application |
| Assigned by | Creating the room | Server env vars (MODERATOR_IDS etc.) |
| Can kick players? | Yes, from their room only | Yes, from any room |
| Can ban/mute? | No | Yes |
| Sees mod dashboard? | No | Yes (bottom nav "MOD" tab) |

### Moderator Levels

Levels form a hierarchy. Higher levels can do everything lower levels can.

| Level | Env Var | Permissions |
|---|---|---|
| `moderator` | `MODERATOR_IDS` | Kick, warn, mute, view reports |
| `senior_moderator` | `SENIOR_MOD_IDS` | All above + ban (up to 12 h), resolve reports |
| `admin` | `ADMIN_IDS` | All above + long bans, view mod logs |
| `owner` | `OWNER_IDS` | All actions without restriction |

### How to Assign a Moderator

1. Find the player's Profile ID from the **Mod Dashboard → Players tab**. Each player row shows their truncated ID. You can also search by username.
2. Add the ID to the appropriate env var (e.g., `MODERATOR_IDS=<id>`).
3. Restart the server. The player will see their mod badge on next login.

### Available Moderation Actions

| Action | Socket Event | Notes |
|---|---|---|
| Warn | `mod:warn` | Sends a warning overlay to the player |
| Mute | `mod:mute` | Prevents player from sending chat; duration required |
| Ban | `mod:ban` | Disconnects and prevents re-entry; duration required |
| Kick | `mod:kick_player` | Removes player from their current room |
| Unban | `mod:unban` | Removes an active ban |
| Unmute | `mod:unmute` | Removes an active mute |
| Resolve Report | `mod:resolve_report` | Marks report as resolved or rejected |

All events are server-authoritative — clients cannot bypass them.

### Mod Dashboard

Accessible from the bottom navigation bar when logged in as a moderator.

Tabs:
- **Reports** — player-submitted reports; resolve or reject them, or warn the reported player directly
- **Rooms** — list of all active game rooms
- **Players** — all online players; search by name or ID; warn/mute/ban/kick/unban/unmute
- **Logs** — full audit trail of all moderation actions

### Player Notifications

When a moderation action targets a player, they receive an overlay:

- **Warning** — dismissible overlay showing reason and moderator name
- **Mute** — dismissible overlay showing reason and expiry time
- **Ban** — non-dismissible overlay; player is disconnected from their room

### Current Limitations

- All data (players, bans, mutes, reports, logs) is stored **in-memory** and resets on server restart. There is no persistent database in this version.
- Moderator assignments are static (env vars); there is no UI to promote/demote mods at runtime.
- Ban/mute expiry is enforced on connection attempt, but the server must be running continuously for timers to work correctly.

---

## Folder Structure

```
.
├── client/          # Vite + React + TypeScript frontend
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── store/       # Zustand stores
│       ├── types/       # Client-side mirror of server types
│       └── lib/         # Socket.IO client setup
├── server/          # Node.js + Socket.IO backend
│   └── src/
│       ├── services/    # Game, moderation, player, room logic
│       ├── socket.ts    # All socket event handlers
│       └── types/       # Shared server types
└── package.json     # npm workspaces root
```
