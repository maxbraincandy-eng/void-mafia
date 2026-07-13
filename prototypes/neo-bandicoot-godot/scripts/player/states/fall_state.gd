extends PlayerState
## Falling (velocity.y >= 0, airborne). Coyote jump / double jump still allowed.

func enter() -> void:
	player.set_anim("fall")

func physics_update(delta: float) -> String:
	player.apply_gravity(delta)
	player.apply_horizontal(delta)

	# try_jump() covers both the coyote-time ground jump and the double jump.
	if player.try_jump():
		return "jump"
	if player.is_on_floor():
		return "run" if player.get_move_axis() != 0.0 else "idle"
	return ""
