# Character Creator — 3D avatar system

A premium, **data-driven** avatar creator. A player designs a stylized 3D
character that becomes their identity across the app.

## Honest scope note

The reference art is **authored-asset AAA** quality (sculpted morph-target
heads, hair cards, PBR clothing meshes). That fidelity needs professionally
made 3D assets that cannot be generated procedurally in code, and this repo/
environment can't download external assets (CSP). So this system uses a
**procedural stylized model** built from primitives — clean, lit, expressive,
and recognizable, but not photoreal. The architecture is deliberately built so
**authored GLTF asset packs can replace any sub-builder later** (hair/clothing/
accessory packs) without touching the UI or the spec.

## Phase 1 — DONE (v328)

- `spec.ts` — serializable `CharacterSpec` + **catalogs** (skin tones, hair/eye/
  cloth/makeup colours, hair/beard/top/bottom/shoe/glasses/hat styles, builds).
  All options are pure data → future packs are data-only. `load/saveSpec`
  (localStorage `vm_character`, also syncs the classic `vs_bodyColor`/`vs_glowColor`
  so 3D worlds inherit the look), `worldAppearance()` helper.
- `model.ts` — `buildCharacter(spec)`: procedural stylized humanoid with body
  proportions per build/height/gender, skin material, a face (eyes with iris/
  pupil + **blink**, brows, nose, mouth, optional eyelashes/eyeshadow/blush/
  lipstick), 10 hairstyles, 5 beards, clothing (5 tops / 4 bottoms / 3 shoes)
  with sleeve/leg coverage logic, glasses, hats, an identity glow ring, and an
  idle **breathing + sway** updater. Modular sub-builders (`buildHair`, etc.).
- `preview.ts` — `CreatorPreview`: a Three.js photo studio (three-point
  lighting, soft shadow, dark gradient backdrop, ACES tone mapping), drag-orbit
  + pinch/scroll zoom, face-focus, live model rebuild on spec change.
- `CharacterCreator.tsx` — premium dark **glassmorphism** UI: gender toggle,
  🎲 randomize, category rail (Body / Skin / Hair / Face / Style / Clothing /
  Accessories), instant-apply option grids, live rotating preview, save.
- Wiring: lazy overlay in `App.tsx`, a Games-tab "ავატარის შექმნა" card, and a
  one-time first-run prompt (`vm_char_prompted`).

## Remaining phases (future)

- **P2 — Face depth**: jaw/chin/cheek/nose/lip micro-sliders (needs morphs or
  parametric head geometry), freckles/beauty marks, more eye shapes.
- **P3 — Cosmetics**: tattoos (neck/arm/hand/chest decals), piercings,
  necklaces/chains/earrings/rings/bracelets/watches, gradient/highlight hair.
- **P4 — Asset packs**: swap procedural sub-builders for authored GLTF hair/
  clothing meshes + PBR textures (the spec/catalog layer already supports it).
- **P5 — Use everywhere**: ✅ **3D DONE (v329)** — the Premium Worlds now render
  the player's actual created character (rigged for walk/run/sit + all emotes),
  and the full `CharacterSpec` is transmitted to peers so everyone sees each
  other's real avatar. ⏳ remaining: 2D portrait render for profile/chat/friends
  thumbnails (offscreen render of the model → data URL).

## P5 — what shipped (v329)

- **model.ts** is now the single avatar source: `buildCharacter()` returns a
  pose-driven rig (`setPose(speed, sitting)` + `emote(kind)` + idle
  breathing/blink) with a floating emote emoji. Both the creator preview and
  the worlds use it.
- **worlds/avatar.ts** is a thin wrapper over the character model (accepts a
  `CharacterSpec` or the legacy `{bodyColor,glowColor}`), keeping the engine's
  Avatar interface (`group/state/update/emote/wave/dispose`).
- **engine.ts / PremiumWorlds.tsx**: build local + remote avatars from specs;
  `world:join` now sends the compact `spec`.
- **server**: `WorldPlayer.spec` (bounded to ~2KB) stored + broadcast in the
  player list and `player-joined`.

Remaining P5: 2D portraits. Classic 2D Virtual Spaces + Backrooms are untouched
(they keep their own avatars).
