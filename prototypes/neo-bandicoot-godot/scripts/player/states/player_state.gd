class_name PlayerState
extends Node
## Base class for every player state. Subclasses override the hooks they need.
##
## Contract: `physics_update()` returns the NAME of the state to switch to, or
## "" to remain in the current state. Keeping transitions as return values (not
## direct machine calls) makes each state self-contained and easy to test.

var player: Player = null
var machine: StateMachine = null

func setup(p: Player, m: StateMachine) -> void:
	player = p
	machine = m

## Called once when this state becomes active.
func enter() -> void:
	pass

## Called once when leaving this state.
func exit() -> void:
	pass

## Called every physics frame while active. Return next state name or "".
func physics_update(_delta: float) -> String:
	return ""
