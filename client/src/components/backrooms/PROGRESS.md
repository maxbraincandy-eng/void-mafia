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
| **5** | ✅ **DONE (v313)** | **VOID IS COMING / ვოიდი მოდის** staged event: server sequence (`void_warning` → `void_sweep` → per-player `void_teleport` → `void_end`), cinematic red pulsing text, tension darkening + deep bass + whispers, black fog swallowing corridors, whole-instance scatter-teleport. |
| **6** | ✅ **DONE (v314)** | Rare discoveries: deterministic special regions (red halls, black room, server room, silent library, cafeteria, flooded rooms) via greyscale textures + per-instance colour + signature props + flood water; scattered readable clue notes with an interact button + note reader; region-discovery label. |
| **7** | ⏳ next | Post-processing polish (bloom, film grain, chromatic aberration, camera shake), LOD/occlusion culling, social gestures (wave/point/flashlight signals), mobile FPS tuning, dynamic shadows. |

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

## Phase 5 — what shipped (v313)

- **Server** (`socket.ts`): `_backroomsVoidTimers` + `_ensureBackroomsVoid` /
  `_scheduleBackroomsVoid` (first Void ~70–120s after first join, then
  ~150–270s) + `_runVoidEvent`: emits `void_warning` → (20s) `void_sweep` →
  (3.2s) per-player `void_teleport { x, z }` scattering EVERY player to a random
  distant cell centre (updates server `p.x/z`) → (4.2s) `void_end`. Each stage
  guards on instance still being populated. `BACKROOMS_CELL` matches the client.
- **engine.ts**: `voidPhase` state, `startVoidWarning()` (heartbeat + deep dual
  sub-bass + drifting whispers), `voidTeleport()` (moves `pos`, forces window
  rebuild), `updateVoid(dt)` easing a `voidLevel` that darkens all lights and
  ramps `FogExp2` density to 0.55 (black fog swallows the corridors) + swells
  the bass, `endVoid()` restore. `HudState.voidPhase` reported.
- **Backrooms.tsx**: cinematic overlay — pulsing red **VOID IS COMING /
  ვოიდი მოდის!** during `warning`, heavy black veil during `sweep`.
  `vm-void-pulse` keyframe.

Note: every player is scattered each Void (guaranteed "everyone's lost"
drama). A future tweak could let players evade the Void (e.g. reach a safe
room) instead of always being caught.

## Phase 6 — what shipped (v314)

- **engine.ts**: `RegionType` + `PALETTES` + `regionTypeFor()` (coarse `REGION`
  blocks, ~10% special via `hash3(regionX,regionZ,seed)`). Textures are now
  greyscale so walls/pillars recolour per-region via `instanceColor`
  (`setColorAt`), and floor/ceiling/fog lerp toward the region palette in
  `updateRegion()` (which also multiplies a per-region light factor → dark black
  room, etc.). Signature props via a new `propMesh` InstancedMesh (library
  shelves / cafeteria tables / server racks) and a `water` plane for flooded
  rooms. Clues: `clueAt()`/`noteFor()`, a `clueMesh` of glowing notes, and
  `readClue()` + `nearClue`. `HudState` gains `region` + `nearClue`.
- **Backrooms.tsx**: interact button (✋, appears when `nearClue`) → paper-style
  note reader overlay; subtle region-discovery label (`REGION_NAMES`).

## Phase 7 starting point (next session) — Polish + performance

1. Post-processing: bloom on the ceiling panels/clues, film grain, subtle
   chromatic aberration, camera shake during blackout/void. Either
   `EffectComposer` (adds to the chunk) or cheap fullscreen shader/CSS passes.
2. Perf: cap `setPixelRatio` more aggressively on low-end, consider fewer window
   cells on small screens, verify InstancedMesh counts; add a simple FPS guard.
3. Social gestures: wave / point / flashlight-signal (blink) — broadcast a
   `backrooms:gesture` and show it on remote avatars.
4. Cleanups: guarantee spawn-cell connectivity (avoid the ~0.8% sealed spawn);
   track the Void sequence's inner timers so an empty→refill can't fire a stale
   stage (see Phase 5 note); optional dynamic shadow from the flashlight.

Keep Phases 1–6 behaviour identical.
