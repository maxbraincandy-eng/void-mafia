# Premium Worlds — flagship 3D social spaces

A new, **modular** 3D social-world system, entirely separate from the classic
2D Virtual Spaces (which are untouched). First world: **Beach Camp 3D**.

Multi-session build. Each phase ships independently functional; existing
features must never break.

## Phase plan

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **1 — Engine + Character + Camera + Beach Camp** | ✅ **DONE (v320)** | Modular `WorldEngine` (third-person orbit camera w/ collision, character controller, adaptive perf, positional ambient audio) rendering any `WorldDef`; animated `Avatar` (idle/walk/run/sit/wave) coloured from the player's identity; full **Beach Camp 3D** scene; sit interaction; lobby + games-card + App wiring. **Single-player, walkable.** |
| **2 — Character polish** | ⏳ | Run dust, footprints in sand, better blending, more emotes (dance). |
| **3 — Camera polish** | ⏳ | Full raycast camera collision vs meshes, shoulder offset, auto-frame. |
| **4 — Beach Camp depth** | ⏳ | More scenery, night wildlife, tide, fireflies, real bloom (EffectComposer, perf-gated). |
| **5 — Voice & social (multiplayer)** | ✅ **DONE (v321)** | `world:*` socket presence (one shared instance per world), remote avatars reusing `Avatar` + nameplates, seat claim/sync (no double-sitting), wave broadcast, and spatial voice via a `world:voice-*` mesh feeding the shared `spatialAudio` spatializer. Mic button + speaking indicators + live player count. |
| **6 — UI & HUD** | ✅ **DONE (v322)** | Slide-out player list (colour swatch + speaking dot), tap-title to open; settings panel (render auto/high/low + shadows toggle, persisted); 3D speaking ring at speakers' feet; auto-hide stays up while a panel is open. |
| **7 — Optimization** | ✅ **DONE (v325)** | Instanced rocks / driftwood / fire stones / beach plants (merged grass tuft) — cut ~140 meshes to 4 InstancedMeshes; smaller ocean mesh (60×40→44×26) with a shared `perf.reduced` flag that throttles wave-normal recompute under load. |
| **8 — Additional worlds** | ⏳ | Cyber Lounge / Skyline Terrace / Yacht / Mountain Cabin (registry already stubs them). |
| **9 — Interactive objects** | ✅ **DONE (v326)** | Networked emote wheel (wave/dance/clap/heart/laugh with floating emoji), a generic `addInteractable` system, campfire toss (spark flare, shared), and a shore fireworks launcher (rockets + colour bursts over the ocean, shared). |
| **10 — Polish & bug fixes** | ⏳ | Device testing, final tuning. |

## Architecture

- `worlds/types.ts` — `WorldDef` + `WorldContext` (the world-author API) + colliders/seats/ambient.
- `worlds/engine.ts` — `WorldEngine`: generic, renders any `WorldDef`. Third-person camera (orbit via swipe, ground-clamp + collider pull-in), camera-relative movement with cylinder-collision, seat sit/stand, positional ambient audio (ocean/fire/wind/night synths), adaptive pixel ratio + shadow-drop under load.
- `worlds/avatar.ts` — `Avatar`: blocky humanoid with pivoted limbs, procedural idle/walk/run/sit/wave; coloured from `vs_bodyColor`/`vs_glowColor` (reuses the classic identity) + glow aura + blob shadow.
- `worlds/beachCamp.ts` — the Beach Camp `WorldDef`: gradient sky + stars + moon + drifting clouds, dune sand (PBR), animated moonlit ocean + foam, campfire (additive flame, dynamic light, embers, sparks, smoke), 8 seats (logs/stumps/cushions/rocks), palms (sway), rocks/driftwood/plants/lanterns, catenary string lights, **DB Both** carved driftwood sign, air motes.
- `worlds/registry.ts` — `PREMIUM_WORLDS` list (Beach Camp live; 4 'soon' stubs). Add a world = new `WorldDef` + one entry.
- `worlds/PremiumWorlds.tsx` — lazy overlay: world-selection lobby → 3D `World` (canvas + auto-hiding HUD: joystick, swipe-camera, tap-to-interact, sit/stand, wave). Immersive fullscreen+landscape on entry (Android).
- Wiring: `App.tsx` `premiumOpen` → lazy `<PremiumWorlds>`; `GamesPage`/`GamesTab` pass `onOpenPremium`; a "Premium Worlds ✨" card at the top of the Games list.

Bundling: Three.js is now a shared `three.module` chunk loaded on demand by both Premium Worlds and Backrooms; the main app bundle is unaffected.

**Nothing in the classic 2D Virtual Spaces (`components/space/*`) was modified.**

## Phase 5 — what shipped (v321) — multiplayer + spatial voice

- **Server** (`socket.ts`): `WorldPlayer` state, `_worlds` (one shared instance
  per world id) + `_worldVoice` maps, `_leaveWorld`/`_leaveWorldVoice` (wired
  into disconnect). Handlers `world:list / join / move / leave / wave` +
  `world:voice-{join,leave,offer,answer,ice}`. `world:move` also does seat claim
  (only free seats; releases on stand) so two players can't share a seat.
- **engine.ts**: `getNetState()`, `getListener()`, `setSpeaking()`,
  `setRemotePlayers()` (reuses `Avatar` for peers, canvas nameplates, smoothed
  interpolation, seated posture at the seat's height), `remoteWave()`; local
  seat picker skips occupied seats; HUD player count = 1 + remotes.
- **useWorldVoice.ts** (new): mesh voice on `world:voice-*` reusing the shared
  `BackroomsSpatial` spatializer; `applyWorldSpatial()` driven from the loop.
- **PremiumWorlds.tsx**: joins on enter (name + identity colours), streams
  state ~12Hz, pushes remotes to the engine, mic button + speaking → nameplate
  pulse, wave broadcasts to everyone, live player count + voice indicator.

Reused verbatim: `WebRTCSession` and `components/backrooms/spatialAudio.ts`.
Classic 2D Virtual Spaces remain untouched.

## Phase 6 — what shipped (v322) — UI & HUD

- **engine.ts**: `setQuality('auto'|'high'|'low')` (auto = adaptive; high/low pin
  pixel ratio) and `setShadows(bool)` (recompiles materials, respected by the
  under-load auto-drop); a green **speaking ring** at each remote's feet toggled
  by the speaking set.
- **PremiumWorlds.tsx**: tap the world chip → **player list** panel (self + peers,
  colour swatch, live speaking dot + 🎙️); ⚙️ → **settings** panel (render tier +
  shadows, persisted to `vw_quality`, applied live); auto-hide HUD now stays up
  while any panel is open (`showUI`).

## Phase 7 — what shipped (v325) — Optimization

- **Instancing** (`beachCamp.ts`): rocks (14), driftwood (6), campfire stone
  ring (9) and beach plants (24 × a 5-blade merged **grass tuft**) are now four
  `InstancedMesh`es instead of ~140 individual meshes — a big draw-call + shadow
  cost cut. Plants keep a gentle per-instance sway (24 matrix writes/frame).
- **Merge helper**: `mergeGeos()` bakes cones into one tuft geometry (no
  three/examples dependency).
- **Ocean**: segment count 60×40 → 44×26; a shared `WorldContext.perf.reduced`
  flag (set by the engine when quality is `low` or adaptive pixel ratio drops
  below 0.95) throttles the costly `computeVertexNormals()` to every 3rd frame
  under load.

## Phase 9 — what shipped (v326) — interactive objects

- **avatar.ts**: emote system — `emote('wave'|'dance'|'clap'|'heart'|'laugh')`
  with procedural per-kind animation + a floating emoji above the head.
- **Interactable framework**: `WorldInteractable` + `ctx.addInteractable({ id,
  x, z, r, label, effect })`. The engine surfaces the nearest object's label as
  the interact prompt, runs `effect()` locally on tap, and — via `onInteract` →
  `world:interact` → `triggerInteract()` — replays it for everyone. `effect`
  must be replayable.
- **engine.ts**: `localEmote`/`remoteEmote`, `triggerInteract`, nearest-object
  detection, interact() picks the closer of seat vs object.
- **beachCamp.ts**: campfire **toss** (spark shower + light flare) and a shore
  **fireworks launcher** (rising rocket → radial colour burst + flash over the
  ocean, pooled particles).
- **Server**: `world:emote` + `world:interact` relays. **UI**: 😀 emote wheel;
  interact button shows the object glyph (🔥/🎆/🪑).

## Phase 8 starting point (next) — Additional worlds

The registry already stubs Cyber Lounge / Skyline Terrace / Yacht / Mountain
Cabin. Implement one as a proof of the modular system: a new `WorldDef` in
`worlds/<name>.ts` (sky, ground, colliders, seats, ambient, props) + flip its
registry entry `status: 'soon' → 'live'`. Everything else (engine, controls,
multiplayer, voice, HUD) is reused for free. Server: add the id to `WORLD_IDS`.
