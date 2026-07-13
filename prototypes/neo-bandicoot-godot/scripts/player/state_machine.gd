class_name StateMachine
extends Node
## A tiny, node-based finite state machine.
##
## Each child node that extends `PlayerState` is registered as a state, keyed by
## its (lower-cased) node name. States return the name of the next state from
## `physics_update()` — or "" to stay put. Adding a new state is just: drop a
## new PlayerState child in the Player scene. No central switch to edit.

@export var initial_state: NodePath

var states: Dictionary = {}       # name(lower) -> PlayerState
var current: PlayerState = null
var player: Player = null

func _ready() -> void:
	player = get_parent() as Player
	for child in get_children():
		if child is PlayerState:
			states[child.name.to_lower()] = child
			child.setup(player, self)
	# Pick the starting state.
	if initial_state and get_node_or_null(initial_state) is PlayerState:
		current = get_node(initial_state)
	elif not states.is_empty():
		current = states.values()[0]
	if current:
		current.enter()

## Called by Player each physics frame.
func physics_update(delta: float) -> void:
	if current == null:
		return
	var next := current.physics_update(delta)
	if next != "":
		transition_to(next)

func transition_to(next_name: String) -> void:
	var key := next_name.to_lower()
	if not states.has(key):
		push_warning("StateMachine: unknown state '%s'" % next_name)
		return
	current.exit()
	current = states[key]
	current.enter()
