# Backrooms — 3D Horror Multiplayer Mode

A new game category in Void Mafia: an endless procedural liminal-space world
with first-person exploration, spatial voice, dynamic horror events, and the
signature **VOID IS COMING / ვოიდი მოდის** event.

This is an intentionally large, multi-session build. **Do not implement
everything at once.** Each phase must be independently functional and must not
break existing systems.

## Phase plan

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **1** | ✅ **DONE (v309)** | 3D foundation: Three.js first-person engine, procedural endless world, mobile + desktop controls, flashlight/battery, fog + lights + textures, ambient audio, minimal HUD. Single-player. |
| **2** | ✅ **DONE (v310)** | Multiplayer presence: `backrooms:*` socket handlers, per-instance shared world seed, instance lobby, remote players rendered as murky capsules + name sprites + head-lamp, ~10Hz position sync with client-side interpolation. |
| **3** | ⏳ next | Spatial voice: reuse LiveKit/mesh (`useSpaceVoice` pattern) with distance attenuation + wall muffling (lowpass) + hallway echo. |
| **4** | ⏳ | Dynamic events + positional horror audio: light flicker, blackout, footsteps, whispers, heartbeat, buzzing, door slams. |
| **5** | ⏳ | **VOID IS COMING / ვოიდი მოდის** cinematic global event: warning text, darkening, bass, whispers, black fog swallowing corridors, caught players teleport-scatter respawn (server-coordinated). |
| **6** | ⏳ | Rare discoveries (cafeteria, red halls, silent library, server room, mirror hallway, endless staircase, black room) + environmental clues/notes. |
| **7** | ⏳ | Post-processing polish (bloom, film grain, chromatic aberration, camera shake), LOD/occlusion culling, social gestures (wave/point/flashlight signals), mobile FPS tuning, dynamic shadows. |

## Architecture / integration points

- **Entry:** card in `client/src/components/community/GamesTab.tsx` →
  `onOpenBackrooms` → `GamesPage` → `App.tsx` `backroomsOpen` state → lazy
  `<Backrooms>` overlay (mirrors the VirtualSpace `spaceOpen` pattern).
- **Engine:** `client/src/components/backrooms/engine.ts` — `BackroomsEngine`
  class. Owns Three.js scene, render loop, world treadmill, collision,
  flashlight, ambient audio. React never touches WebGL directly.
- **UI/input:** `client/src/components/backrooms/Backrooms.tsx` — canvas + HUD
  + joystick/swipe/keyboard, feeds `engine.input` and reads `engine.onHud`.
- **3D lib:** `three` (rev 160) + `@types/three`, **lazy-loaded** → separate
  `Backrooms-*.js` chunk (~121KB gzip). Keep it that way.

### World model (engine.ts)
Infinite lattice of pillars spaced `CELL` (6m) apart with deterministic
(`hash3`) maze wall panels between neighbours. A window of `WINDOW` (8) cells
around the player is drawn with two `InstancedMesh`es (pillars, walls) and
recentred when the player crosses a cell (`rebuildWindow`). Collision uses the
same window's AABB list (`moveWithCollision`, circle-vs-AABB slide).

## Phase 2 — what shipped (v310)

- **Server** (`server/src/socket.ts`): `BackroomsPlayer`/`BackroomsInstance`
  types, `_backrooms` (instanceId→players) + `_backroomsMeta` maps, 3 seeded
  persistent public instances, `_leaveBackrooms()` wired into `disconnect`,
  and handlers `backrooms:list` / `backrooms:join` / `backrooms:move` /
  `backrooms:leave` (broadcasting `player-joined/left/moved`). All via
  `as any` casts — no `types/index.ts` changes.
- **engine.ts**: `worldSeed` folded into `hash3` (per-instance maze),
  `getNetState()`, `setRemotePlayers()` with murky capsule + name sprite +
  head-lamp avatars, smoothed interpolation (`updateRemotes`), safe cell-center
  spawn with jitter.
- **Backrooms.tsx**: split into `Lobby` (instance list) → `World` (join +
  socket wiring + 10Hz `backrooms:move` emit + remote push straight to engine,
  never React state). Back-to-lobby (🚪) and close (✕) both emit `leave`.

## Phase 3 starting point (next session) — Spatial voice

1. Study `client/src/hooks/useSpaceVoice.ts` + `useLivekitVoice.ts` for the
   existing proximity-voice model (LiveKit tracks + WebRTC mesh fallback).
2. Add a voice room per Backrooms instance. Attenuate each remote peer's gain
   by 3D distance (use engine local pos vs remote pos — expose a
   `getPeerDistance(socketId)` or feed positions to the voice layer).
3. Muffle through walls: a `BiquadFilter` lowpass whose cutoff drops when a
   wall AABB sits between listener and speaker (raycast the collider list).
4. Hallway echo: a shared `ConvolverNode`/feedback-delay send, wetter at range.
5. Wire a mic toggle button into the World HUD.

Do NOT touch existing voice hooks' behaviour for other modes — add a
Backrooms-specific hook/path.

Keep Phase 1/2 behaviour identical.
