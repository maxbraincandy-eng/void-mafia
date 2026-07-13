extends PlayerState
## Rising through the air (velocity.y < 0). Handles the double jump.

func enter() -> void:
	player.set_anim("jump")

func physics_update(delta: float) -> String:
	player.apply_gravity(delta)
	player.apply_horizontal(delta)

	# A buffered press mid-air spends the double jump — re-enter Jump to replay
	# the impulse/anim.
	if player.try_jump():
		return "jump"
	# Landed again already (very short hop onto a ledge).
	if player.is_on_floor():
		return "run" if player.get_move_axis() != 0.0 else "idle"
	# Apex reached → start falling.
	if player.velocity.y >= 0.0:
		return "fall"
	return ""
