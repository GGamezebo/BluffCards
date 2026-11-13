class_name HfsmStateNode
extends RefCounted

var name: String
var parent: HfsmStateNode = null
var enter_events: Array[String] = []
var leave_events: Array[String] = []
var consume_events: Array[String] = []
var bindings: Dictionary = {}
## Optional host hint: { "id": String, "loading_screen": bool, "async_loading": bool, "on_event": String,
## "keep_loaded": bool, "preload": Array[String] }. Empty = no scene.
var scene: Dictionary = {}
var children: Dictionary = {}
var is_active: bool = false


func _init(
	p_name: String,
	p_parent: HfsmStateNode = null,
	p_enter_events: Array = [],
	p_leave_events: Array = [],
	p_consume_events: Array = [],
	p_bindings: Dictionary = {},
	p_scene: Dictionary = {}
) -> void:
	name = p_name
	parent = p_parent
	enter_events.assign(p_enter_events)
	leave_events.assign(p_leave_events)
	consume_events.assign(p_consume_events)
	bindings = p_bindings.duplicate()
	scene = p_scene.duplicate()


func has_scene() -> bool:
	return scene.has("id") and not str(scene.id).is_empty()


func active_children() -> Array[HfsmStateNode]:
	var result: Array[HfsmStateNode] = []
	var child_list: Array = children.values()
	child_list.reverse()
	for child in child_list:
		if child is HfsmStateNode and child.is_active:
			result.append(child)
	return result
