class_name HfsmStateTree
extends RefCounted

var root: HfsmStateNode
var map_states: Dictionary = {}


func _init(p_root: HfsmStateNode) -> void:
	root = p_root
	map_states.clear()
	_index(root)


static func validate_unique_names(p_root: HfsmStateNode) -> String:
	var seen: Dictionary = {}
	return _validate_index(p_root, seen)


static func _validate_index(node: HfsmStateNode, seen: Dictionary) -> String:
	if node.name in seen:
		return "Duplicate state name '%s'" % node.name
	seen[node.name] = true
	for child in node.children.values():
		if child is HfsmStateNode:
			var err := _validate_index(child, seen)
			if err != "":
				return err
	return ""


func _index(node: HfsmStateNode) -> void:
	if node.name in map_states:
		push_error("Duplicate state name '%s'" % node.name)
		assert(false, "Duplicate state name '%s'" % node.name)
	map_states[node.name] = node
	for child in node.children.values():
		if child is HfsmStateNode:
			_index(child)


func reset() -> void:
	for node in map_states.values():
		if node is HfsmStateNode:
			node.is_active = false
	root.is_active = true


func active_path() -> Array[String]:
	var path: Array[String] = []
	_walk(root, path)
	return path


func _walk(node: HfsmStateNode, path: Array[String]) -> void:
	if not node.is_active:
		return
	path.append(node.name)
	for child in node.children.values():
		if child is HfsmStateNode:
			_walk(child, path)
