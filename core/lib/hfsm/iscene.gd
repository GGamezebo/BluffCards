class_name IScene
extends Node

## Base for HFSM-mounted Godot scenes (`scene: { id, ... }` on a state).
## Scene id comes from JSON + host paths map.
## HfsmSceneRegistry calls initialize / deinit / on_event.

var _hfsm: HFSM = null

func _ready() -> void:
	if _is_isolated_run():
		initialize(_default_data())

func sync_hfsm(hfsm: HFSM) -> void:
	_hfsm = hfsm

func initialize(_data: Dictionary) -> void:
	pass

func deinit() -> void:
	_hfsm = null

func on_event(_event_name: String, _data: Dictionary) -> void:
	pass

func _is_isolated_run() -> bool:
	return get_tree().current_scene == self

func _default_data() -> Dictionary:
	return {}
	
func add_event(event_name: String, data: Dictionary = {}) -> void:
	if _hfsm:
		_hfsm.add_event(event_name, data)
		
func _get_deapth() -> int:
	return _hfsm.get_active_path().size() if _hfsm else 0
