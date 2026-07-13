extends PlayerState
## Standing still on the ground.

func enter() -> void:
	player.set_anim("idle")

func physics_update(delta: float) -> String:
	player.apply_gravity(delta)
	player.apply_horizontal(delta)

	if not player.is_on_floor():
		return "fall"
	if player.try_jump():
		return "jump"
	if player.get_move_axis() != 0.0:
		return "run"
	return ""
