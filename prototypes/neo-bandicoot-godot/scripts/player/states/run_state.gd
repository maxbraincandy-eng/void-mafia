extends PlayerState
## Moving along the ground.

func enter() -> void:
	player.set_anim("run")

func physics_update(delta: float) -> String:
	player.apply_gravity(delta)
	player.apply_horizontal(delta)

	if not player.is_on_floor():
		return "fall"
	if player.try_jump():
		return "jump"
	# No input and nearly stopped → idle.
	if player.get_move_axis() == 0.0 and absf(player.velocity.x) < 5.0:
		return "idle"
	return ""
