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
| **2** | ⏳ next | Multiplayer presence: `backrooms:*` socket handlers, shared world seed, other players as avatars, instance list. |
| **3** | ⏳ | Spatial voice: reuse LiveKit/mesh (`useSpaceVoice` pattern) with distance attenuation + wall muffling (lowpass) + hallway echo. |
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

## Phase 2 starting point (next session)

1. Server: add `backrooms:*` handlers in `server/src/socket.ts`, mirroring the
   `space:*` room pattern (`join`, `move`/`player-moved`, `player-joined/left`,
   instance list). Reuse the existing space room bookkeeping helpers.
2. World seed: pass a per-instance `seed` into `BackroomsEngine` and fold it
   into `hash3` so every player in an instance sees the same maze.
3. Client: broadcast local position (throttled ~10Hz) and render remote
   players as simple lit capsules + name sprites in the engine (add a
   `setRemotePlayers()` method).
4. Games tab: turn the single "შესვლა" button into an instance list
   (create/join), like the other games' match lists.

Keep Phase 1 behaviour identical for the single-player/solo path.
