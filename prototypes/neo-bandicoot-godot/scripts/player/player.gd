class_name Player
extends CharacterBody2D
## Neo Bandicoot — the player character.
##
## This node owns the *physics* (velocity, gravity, jump math, timers). The
## StateMachine child owns *behaviour* (which anim plays, which transitions are
## allowed). States call the helper methods below rather than touching velocity
## directly, so the feel stays consistent everywhere.

# ── Horizontal movement ─────────────────────────────────────────────────
@export_group("Movement")
@export var max_speed: float = 220.0          # top running speed (px/s)
@export var acceleration: float = 1600.0      # ground accel toward max_speed
@export var friction: float = 2000.0          # ground decel toward 0
@export var air_acceleration: float = 1000.0  # weaker steering while airborne

# ── Vertical movement ───────────────────────────────────────────────────
@export_group("Jump")
@export var jump_velocity: float = -430.0         # first (ground) jump impulse
@export var double_jump_velocity: float = -380.0  # air jump impulse
@export var max_jumps: int = 2                    # 1 = no double jump, 2 = double
@export var gravity: float = 1200.0
@export var max_fall_speed: float = 720.0
## Releasing jump early cuts upward velocity → short taps = short hops.
@export_range(0.0, 1.0) var jump_cut_multiplier: float = 0.45

# ── "Game feel" assists ─────────────────────────────────────────────────
@export_group("Assist")
## Grace window to still jump just after walking off a ledge.
@export var coyote_time: float = 0.10
## Remember a jump press slightly before landing so it isn't dropped.
@export var jump_buffer_time: float = 0.12

# ── Runtime state ───────────────────────────────────────────────────────
var jumps_left: int = 0
var facing: int = 1                # 1 = right, -1 = left
var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0

@onready var state_machine: StateMachine = $StateMachine
@onready var placeholder: Node2D = $Placeholder   # swap for AnimatedSprite2D later

# ── Main loop ───────────────────────────────────────────────────────────
func _physics_process(delta: float) -> void:
	_update_timers(delta)
	state_machine.physics_update(delta)   # state applies gravity/horizontal/jump
	move_and_slide()

func _unhandled_input(event: InputEvent) -> void:
	# Buffer the jump press so it survives a few frames before landing.
	if event.is_action_pressed("jump"):
		_jump_buffer_timer = jump_buffer_time
	# Variable jump height: let go early → cut the rise short.
	if event.is_action_released("jump") and velocity.y < 0.0:
		velocity.y *= jump_cut_multiplier

# ── Movement helpers (called by states) ─────────────────────────────────
func get_move_axis() -> float:
	return Input.get_axis("move_left", "move_right")

func apply_gravity(delta: float) -> void:
	velocity.y = minf(velocity.y + gravity * delta, max_fall_speed)

func apply_horizontal(delta: float) -> void:
	var axis := get_move_axis()
	if axis != 0.0:
		var accel := acceleration if is_on_floor() else air_acceleration
		velocity.x = move_toward(velocity.x, axis * max_speed, accel * delta)
		_set_facing(int(signf(axis)))
	else:
		velocity.x = move_toward(velocity.x, 0.0, friction * delta)

## Attempts a jump if one is buffered. Returns true if it fired (so a state can
## transition to Jump). Handles ground jump, coyote jump, and double jump.
func try_jump() -> bool:
	if _jump_buffer_timer <= 0.0:
		return false
	var grounded := is_on_floor() or _coyote_timer > 0.0
	if grounded:
		_do_jump(jump_velocity)
		return true
	elif jumps_left > 0:
		_do_jump(double_jump_velocity)
		return true
	return false

func _do_jump(vel: float) -> void:
	velocity.y = vel
	jumps_left = maxi(jumps_left - 1, 0)
	_jump_buffer_timer = 0.0
	_coyote_timer = 0.0

# ── Facing / placeholder animation ──────────────────────────────────────
func _set_facing(dir: int) -> void:
	if dir == 0 or dir == facing:
		return
	facing = dir
	placeholder.scale.x = absf(placeholder.scale.x) * facing

## Phase 1 has no art yet, so we just tint the placeholder per state and print
## the state. In a later phase this becomes `$AnimatedSprite2D.play(anim)`.
func set_anim(anim: String) -> void:
	match anim:
		"idle": placeholder.modulate = Color(1.0, 0.55, 0.15)   # orange
		"run":  placeholder.modulate = Color(1.0, 0.72, 0.25)   # lighter
		"jump": placeholder.modulate = Color(1.0, 0.9, 0.35)    # yellow
		"fall": placeholder.modulate = Color(1.0, 0.4, 0.2)     # red-orange
		_:      placeholder.modulate = Color.WHITE

# ── Timers ──────────────────────────────────────────────────────────────
func _update_timers(delta: float) -> void:
	if is_on_floor():
		_coyote_timer = coyote_time
		jumps_left = max_jumps
	else:
		var had_coyote := _coyote_timer > 0.0
		_coyote_timer = maxf(_coyote_timer - delta, 0.0)
		# Walked off a ledge WITHOUT jumping and the grace expired → forfeit the
		# grounded jump but keep the air jump(s), so a fall gives one double jump.
		if had_coyote and _coyote_timer == 0.0 and jumps_left == max_jumps:
			jumps_left = max_jumps - 1
	_jump_buffer_timer = maxf(_jump_buffer_timer - delta, 0.0)
