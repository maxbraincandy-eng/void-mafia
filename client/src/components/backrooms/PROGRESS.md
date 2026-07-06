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
| **4** | ✅ **DONE (v312)** | Dynamic events + positional horror audio: server per-instance scheduler broadcasting synced `backrooms:event`; flicker + blackout (emergency lighting + heartbeat + red wash), procedural positional one-shots (footstep/whisper/buzz/scrape/scream/vent/rumble/slam) anchored near random players. |
| **5** | ⏳ next | **VOID IS COMING / ვოიდი მოდის** cinematic global event: warning text, darkening, bass, whispers, black fog swallowing corridors, caught players teleport-scatter respawn (server-coordinated). |
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

## Phase 4 — what shipped (v312)

- **Server** (`socket.ts`): `_backroomsEventTimers` + `_ensureBackroomsEvents` /
  `_scheduleBackroomsEvent` — per-instance loop firing every ~20–45s. Weighted:
  ~62% positional `ambient` sound anchored near a random player (shared world
  coords), ~22% `flicker`, ~8% `blackout`. Started on join, torn down when the
  instance empties.
- **engine.ts**: `triggerEvent()`, `updateEventLighting()` (flicker stutter /
  blackout emergency lighting via the pooled lights + ambient + ceiling
  emissive), a procedural `synth()` sound bank (footstep, whisper, buzz, slam,
  scrape, scream, vent, rumble) played through a distance/pan `playPositional()`
  graph, and a `startHeartbeat()`/`thump()` bed during blackouts. `HudState.event`
  reports the active event; `resumeAudio()` for gesture-gated AudioContext.
- **Backrooms.tsx**: `backrooms:event` listener → `engine.triggerEvent`; subtle
  blackout (red emergency wash + "საგანგებო განათება") and flicker overlays;
  `resumeAudio()` on first touch/mouse. Added `vm-br-emergency` keyframe.

## Phase 5 starting point (next session) — VOID IS COMING / ვოიდი მოდის

1. Server: extend the scheduler with a rarer `void` event (or a separate longer
   timer). Broadcast in stages so it's cinematic and synced:
   `void_warning` → (after ~20s) `void_sweep` → per-player `void_teleport`.
2. Engine: on `void_warning` build tension — screen darkens, deep bass rises,
   whispers, lights destabilise. On `void_sweep` grow a black fog (drop
   `FogExp2` density hard + darken) "swallowing" corridors.
3. Server picks who gets caught (e.g. players still moving / not in a safe spot,
   or random subset) and issues `void_teleport { seed-safe new x,z }` so caught
   players respawn elsewhere in the instance — groups get scattered. Update the
   engine to accept an external teleport (set `pos`, force `rebuildWindow`).
4. Big centered cinematic text overlay: **VOID IS COMING** / **ვოიდი მოდის!**

Keep Phases 1–4 behaviour identical.
