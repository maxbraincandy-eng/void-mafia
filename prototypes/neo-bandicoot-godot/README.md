# Neo Bandicoot Odyssey

A 2D action platformer prototype (Godot 4.3, GDScript). Built in phases.

## Phase 1 — Player controller + state machine ✅

### How to run
1. Open **Godot 4.3**, click **Import**, and select this folder's `project.godot`.
2. Press **F5** (or the Play button). `scenes/Main.tscn` is the main scene.

### Controls
- **Move:** A / D or Left / Right
- **Jump / Double jump:** Space / W / Up
- (Also defined for later phases: Attack = J/X, Slide = Shift, Crouch = S/Down)

Inputs use **physical** key positions, so WASD works on any keyboard layout.

### What Phase 1 includes
- `CharacterBody2D` player with acceleration/friction ground movement and
  weaker air steering.
- Gravity with a terminal fall speed.
- Jump, **double jump**, **coyote time** (jump just after leaving a ledge),
  **jump buffering** (press just before landing), and **variable jump height**
  (release early = shorter hop).
- A modular, node-based **state machine**: Idle / Run / Jump / Fall. Each state
  is its own script; adding one is just dropping a `PlayerState` child into the
  Player scene.
- The character is a placeholder (orange polygons). It **tints per state** so
  you can see state changes; real animations plug into `Player.set_anim()`
  later via an `AnimatedSprite2D`.

### Project layout
```
res://
├── project.godot          # config + input map
├── icon.svg
├── scenes/
│   ├── Main.tscn          # Phase-1 test arena (ground + platforms)
│   ├── player/Player.tscn # the player scene
│   ├── levels/  enemies/  ui/   (later phases)
├── scripts/
│   ├── player/
│   │   ├── player.gd            # physics: movement, gravity, jump, timers
│   │   ├── state_machine.gd     # the FSM
│   │   └── states/
│   │       ├── player_state.gd  # base state
│   │       ├── idle_state.gd
│   │       ├── run_state.gd
│   │       ├── jump_state.gd
│   │       └── fall_state.gd
│   ├── enemies/  systems/  ui/  (later phases)
└── assets/
    ├── sprites/  backgrounds/
    └── audio/   (placeholder slot list in audio/README.md)
```

### Try these in the test arena
- Walk off the left ledge and jump a hair late → **coyote time**.
- Reach the highest platform (`P4`) → needs the **double jump**.
- Tap vs. hold jump → **variable height**.
- Hold jump before landing → the jump still fires (**buffering**).

## Next phases
2. Basic test level · 3. Camera + collectibles · 4. Boxes + enemies ·
5. Multiple levels · 6. UI + save system · 7. Mobile controls + export.
