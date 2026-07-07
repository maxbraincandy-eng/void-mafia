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
| **6 — UI & HUD** | ⏳ | Player list, voice indicators, refined auto-hide, settings (quality). |
| **7 — Optimization** | ⏳ | LOD, instancing for foliage, texture sizing, frustum culling audit, quality tiers. |
| **8 — Additional worlds** | ⏳ | Cyber Lounge / Skyline Terrace / Yacht / Mountain Cabin (registry already stubs them). |
| **9 — Interactive objects** | ⏳ | Sit variations, campfire toss, lanterns, mini-games, world props. |
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

## Phase 6 starting point (next) — UI & HUD

1. Slide-out player list (avatars + names + speaking dots) from the top bar.
2. Per-nameplate speaking ring in 3D (already have the pulse; add a colour ring).
3. Quality settings (shadows on/off, render scale) persisted to localStorage.
4. Refine auto-hide (don't hide while the interact/voice panel is relevant).
