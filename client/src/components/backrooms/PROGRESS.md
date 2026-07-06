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
| **3** | ✅ **DONE (v311)** | Spatial voice: `backrooms:voice-*` WebRTC-mesh signaling, Web-Audio spatializer (distance rolloff + stereo pan + wall-muffle lowpass + hallway reverb) with `audio.volume` fallback, engine occlusion raycast, mic button, speaking → head-lamp pulse. |
| **4** | ⏳ next | Dynamic events + positional horror audio: light flicker, blackout, footsteps, whispers, heartbeat, buzzing, door slams. |
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

## Phase 3 — what shipped (v311)

- **Server** (`socket.ts`): `_backroomsVoice` map, `_leaveBackroomsVoice()`
  (also called from `_leaveBackrooms` + `disconnect`), handlers
  `backrooms:voice-join / leave / offer / answer / ice` relaying like the space
  voice mesh but scoped to instance membership.
- **webrtcService.ts**: two additive helpers — `setPeerVolume(peerId, v)` and
  `setPeerElementMuted(peerId, muted)`. No behaviour change for other modes.
- **spatialAudio.ts** (new): `BackroomsSpatial` — per-peer Web Audio chain
  (MediaStreamSource → lowpass → stereo panner → gain → destination, plus a
  send to a shared convolver reverb). Distance rolloff, angle-based pan, wall
  muffle (lowpass cutoff falls with occlusion), reverb wetter with
  distance/occlusion. Falls back to `audio.volume` if remote-stream Web Audio
  isn't supported — voice is never silent.
- **useBackroomsVoice.ts** (new): mesh voice session mirroring `useSpaceVoice`
  on the `backrooms:voice-*` channel, owning the spatializer. Exposes
  `joinVoice/leaveVoice/toggleMute` + `applyBackroomsSpatial(listener, peers)`.
- **engine.ts**: `getListener()`, `occlusionBetween()` (Liang–Barsky segment
  vs wall AABBs; only wall panels count), wall-tagged colliders,
  `setSpeaking()` → talking players' head-lamps pulse.
- **Backrooms.tsx**: mic button, spatial update folded into the 10Hz loop,
  voice status line, `leaveBackroomsVoice()` on world unmount.

Note: voice is a WebRTC **mesh** (O(n²)); fine for the 16-cap instances but a
LiveKit-SFU migration is a candidate for the Phase 7 perf pass.

## Phase 4 starting point (next session) — Dynamic events + horror audio

1. Server: a per-instance event scheduler (e.g. every ~45–90s pick an event),
   broadcast `backrooms:event { kind, seed, at }` to the instance so all
   clients run it in sync. Kinds: `flicker`, `blackout`, `ambient` (positional
   one-shot sound), later `void` (Phase 5).
2. Engine: event hooks — dim/kill the light pool + flashlight flicker for
   `flicker`/`blackout`; spawn positional WebAudio one-shots (footsteps,
   whispers, buzzing, door slam, metal scrape) via a small sample/synth bank;
   heartbeat bed during dangerous events.
3. Client HUD: subtle reaction (screen darken, grain bump) — keep it
   psychological, no cheap jumpscares.

Keep Phases 1–3 behaviour identical.
