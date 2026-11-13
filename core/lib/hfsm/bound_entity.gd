class_name HfsmBoundEntity
extends RefCounted

## Base class for entities bound to FSM states.
## Registered by name via host entities map: { slot: { name: Script } }.
## HfsmBindingRegistry calls sync_hfsm on enter (same hook pattern as IScene).

var _hfsm: HFSM = null


func _init(_data: Dictionary = {}) -> void:
	pass


func sync_hfsm(hfsm: HFSM) -> void:
	_hfsm = hfsm


func on_event(_event_name: String, _data: Dictionary) -> void:
	pass


func deinit() -> void:
	_hfsm = null


func add_event(event_name: String, data: Dictionary = {}) -> void:
	if _hfsm:
		_hfsm.add_event(event_name, data)
