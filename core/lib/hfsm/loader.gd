class_name HfsmLoader
extends RefCounted

## Entity registry: { slot_name: { entity_name: Script } }


static func _failed(result: Dictionary) -> bool:
	return result.get("error", "") != ""


static func try_load_tree(source: Variant) -> Dictionary:
	var data: Dictionary
	if source is Dictionary:
		data = source
	elif source is String:
		var path := String(source)
		if not FileAccess.file_exists(path):
			return {"tree": null, "error": "File not found: %s" % path}
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			return {"tree": null, "error": "Cannot open file: %s" % path}
		var parsed = JSON.parse_string(file.get_as_text())
		if parsed == null:
			return {"tree": null, "error": "Invalid JSON in: %s" % path}
		if not parsed is Dictionary:
			return {"tree": null, "error": "Config root must be an object"}
		data = parsed
	else:
		return {"tree": null, "error": "Source must be a Dictionary or file path"}

	if data.size() != 1:
		return {"tree": null, "error": "Config must contain exactly one root state"}

	var keys := data.keys()
	var root_name: String = str(keys[0])
	if root_name.is_empty():
		return {"tree": null, "error": "Root state name must be a non-empty string"}

	var root_data = data[root_name]
	var parse_err := _parse_state(root_name, root_data, null)
	if _failed(parse_err):
		return {"tree": null, "error": parse_err.error}
	var root: HfsmStateNode = parse_err.node
	var dup_err := HfsmStateTree.validate_unique_names(root)
	if dup_err != "":
		return {"tree": null, "error": dup_err}
	return {"tree": HfsmStateTree.new(root), "error": ""}


static func load_tree(source: Variant) -> HfsmStateTree:
	var result := try_load_tree(source)
	if result.error != "":
		assert(false, result.error)
	return result.tree


static func _parse_event_list(raw: Variant, state_name: String, field_name: String) -> Dictionary:
	if not raw is Array:
		return {
			"error": "State '%s' field '%s' must be a list" % [state_name, field_name]
		}
	var patterns: Array[String] = []
	for item in raw:
		if not item is String:
			return {
				"error": (
					"State '%s' field '%s' must contain strings"
					% [state_name, field_name]
				)
			}
		var err := HfsmUtils.validate_event_pattern(item, state_name, field_name)
		if err != "":
			return {"error": err}
		patterns.append(item)
	return {"events": patterns, "error": ""}


static func _parse_bindings(data: Dictionary, state_name: String) -> Dictionary:
	var bindings: Dictionary = {}
	for key in data.keys():
		if key in HfsmConsts.STATE_RESERVED_KEYS:
			continue
		var value = data[key]
		if not value is String:
			return {
				"error": (
					"State '%s' binding '%s' must be a string"
					% [state_name, key]
				)
			}
		if String(value).is_empty():
			return {
				"error": "State '%s' binding '%s' must not be empty" % [state_name, key]
			}
		bindings[key] = value
	return {"bindings": bindings, "error": ""}


static func _parse_scene(raw: Variant, state_name: String) -> Dictionary:
	if raw == null:
		return {"scene": {}, "error": ""}
	if not raw is Dictionary:
		return {
			"error": "State '%s' field 'scene' must be an object" % state_name
		}
	var scene_data: Dictionary = raw
	if not scene_data.has("id") or not scene_data.id is String:
		return {
			"error": "State '%s' scene.id must be a non-empty string" % state_name
		}
	var scene_id := String(scene_data.id)
	if scene_id.is_empty():
		return {
			"error": "State '%s' scene.id must be a non-empty string" % state_name
		}
	var loading_screen := false
	if scene_data.has("loading_screen"):
		if not scene_data.loading_screen is bool:
			return {
				"error": "State '%s' scene.loading_screen must be a bool" % state_name
			}
		loading_screen = scene_data.loading_screen
	var async_loading := true
	if scene_data.has("async_loading"):
		if not scene_data.async_loading is bool:
			return {
				"error": "State '%s' scene.async_loading must be a bool" % state_name
			}
		async_loading = scene_data.async_loading
	var on_event := ""
	if scene_data.has("on_event"):
		if not scene_data.on_event is String:
			return {
				"error": "State '%s' scene.on_event must be a string" % state_name
			}
		on_event = String(scene_data.on_event).strip_edges()
	var keep_loaded := false
	if scene_data.has("keep_loaded"):
		if not scene_data.keep_loaded is bool:
			return {
				"error": "State '%s' scene.keep_loaded must be a bool" % state_name
			}
		keep_loaded = scene_data.keep_loaded
	var preload_ids: Array[String] = []
	if scene_data.has("preload"):
		if not scene_data["preload"] is Array:
			return {
				"error": "State '%s' scene.preload must be a list of scene ids" % state_name
			}
		for item in scene_data["preload"]:
			if not item is String or String(item).is_empty():
				return {
					"error": (
						"State '%s' scene.preload must contain non-empty strings"
						% state_name
					)
				}
			preload_ids.append(item)
	var scene_out := {
		"id": scene_id,
		"loading_screen": loading_screen,
		"async_loading": async_loading,
		"on_event": on_event,
		"keep_loaded": keep_loaded,
		"preload": preload_ids,
	}
	return {"scene": scene_out, "error": ""}


static func _parse_state(
	name: String,
	data: Variant,
	parent: HfsmStateNode
) -> Dictionary:
	if not data is Dictionary:
		return {"error": "State '%s' must be an object" % name}

	var enter_events: Array[String]
	if "enter" in data:
		var enter_result := _parse_event_list(data.enter, name, "enter")
		if _failed(enter_result):
			return {"error": enter_result.error}
		enter_events = enter_result.events
	else:
		enter_events = [HfsmConsts.SYS_ENTER]

	var leave_events: Array[String] = []
	if "leave" in data:
		var leave_result := _parse_event_list(data.leave, name, "leave")
		if _failed(leave_result):
			return {"error": leave_result.error}
		leave_events = leave_result.events

	var consume_events: Array[String] = []
	if "consume" in data:
		var consume_result := _parse_event_list(data.consume, name, "consume")
		if _failed(consume_result):
			return {"error": consume_result.error}
		consume_events = consume_result.events

	var scene_result := _parse_scene(data.get("scene"), name)
	if _failed(scene_result):
		return {"error": scene_result.error}

	var bindings_result := _parse_bindings(data, name)
	if _failed(bindings_result):
		return {"error": bindings_result.error}

	var node := HfsmStateNode.new(
		name,
		parent,
		enter_events,
		leave_events,
		consume_events,
		bindings_result.bindings,
		scene_result.scene
	)

	var states = data.get("states", {})
	if not states is Dictionary:
		return {"error": "State '%s' field 'states' must be an object" % name}

	for child_name in states.keys():
		var child_result := _parse_state(str(child_name), states[child_name], node)
		if _failed(child_result):
			return {"error": child_result.error}
		node.children[child_name] = child_result.node

	return {"node": node, "error": ""}
