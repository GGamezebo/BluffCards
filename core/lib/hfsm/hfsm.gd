class_name HFSM
extends RefCounted

var tree: HfsmStateTree
var history: Array[String] = []

var _bindings: HfsmBindingRegistry
var _scenes: HfsmSceneRegistry = null
var _pending: Array[HfsmEvent] = []


## entities: { slot: { entity_name: Script } }
## scene_config (optional): {
##   host: Node,
##   paths: { id: "res://...tscn" },
##   loading_screen: PackedScene,  # ready resource from the host (e.g. editor export), held for the session
##   min_load_time: float,
## }
func _init(
	p_tree: HfsmStateTree,
	entities: Dictionary = {},
	scene_config: Dictionary = {}
) -> void:
	tree = p_tree
	_bindings = HfsmBindingRegistry.new(entities)
	_bindings.set_hfsm(self)
	_setup_scenes(scene_config)
	reset()


func _setup_scenes(scene_config: Dictionary) -> void:
	if scene_config.is_empty():
		return
	var host: Node = scene_config.get("host")
	if host == null:
		push_error("[HFSM] scene_config.host (Node) is required when configuring scenes")
		assert(false)
		return
	var paths: Dictionary = scene_config.get("paths", {})
	_scenes = HfsmSceneRegistry.new()
	_scenes.setup(
		self,
		host,
		paths,
		scene_config.get("loading_screen"),
		float(scene_config.get("min_load_time", 0.0))
	)


func reset() -> void:
	history.clear()
	_pending.clear()
	var all_states: Array = []
	for node in tree.map_states.values():
		all_states.append(node)
	if _scenes:
		_scenes.on_reset_all(all_states)
	_bindings.on_reset_all(all_states)
	tree.reset()
	_bindings.on_enter(tree.root, {})
	if _scenes:
		_scenes.on_enter(tree.root, {})
	_propagate_sys_enter(tree.root)


func clear() -> void:
	if _scenes:
		_scenes.clear()
		_scenes = null
	_bindings.clear()


func add_event(event_name: String, data: Dictionary = {}) -> bool:
	_pending.append(HfsmEvent.new(event_name, data))
	return _run()


func get_active_path() -> Array[String]:
	return tree.active_path()


## Deepest active state with a `scene` declaration, or {}.
func get_active_scene() -> Dictionary:
	var path := get_active_path()
	for i in range(path.size() - 1, -1, -1):
		var state: HfsmStateNode = tree.map_states.get(path[i])
		if state != null and state.has_scene():
			return state.scene.duplicate()
	return {}


func get_mounted_scene(state_name: String) -> Node:
	if _scenes == null:
		return null
	return _scenes.get_instance(state_name)


func get_binding(state_name: String, slot: String) -> HfsmBoundEntity:
	var state: HfsmStateNode = tree.map_states[state_name]
	return _bindings.get_binding(state, slot)


func _run() -> bool:
	var handled := false
	while not _pending.is_empty():
		var event: HfsmEvent = _pending[0]
		_pending.remove_at(0)
		history.append(event.name)
		if _process_event(event, tree.root):
			handled = true
	return handled


func _process_event(event: HfsmEvent, state: HfsmStateNode) -> bool:
	var consumed_below := false
	for child in state.active_children():
		if _process_event(event, child):
			consumed_below = true

	if not state.is_active:
		return consumed_below

	if _dispatches_to_entities(event):
		_bindings.on_event(state, event)
		if _scenes:
			_scenes.on_event(state, event)

	if _matches_any(event.name, state.leave_events):
		_leave(state)

	for child_name in state.children.keys():
		var child: HfsmStateNode = state.children[child_name]
		if not child.is_active and _matches_any(event.name, child.enter_events):
			_activate(child, event.data, event)

	if _should_consume(event.name, state):
		return true

	return consumed_below


func _activate(
	state: HfsmStateNode,
	data: Dictionary = {},
	event: HfsmEvent = null
) -> void:
	state.is_active = true
	_bindings.on_enter(state, data)
	if _scenes:
		_scenes.on_enter(state, data)
	if event != null and event.name != HfsmConsts.SYS_ENTER:
		_bindings.on_event(state, event)
		if _scenes:
			_scenes.on_event(state, event)
	_propagate_sys_enter(state)


func _leave(state: HfsmStateNode) -> void:
	for child in state.active_children():
		_leave(child)
	if _scenes:
		_scenes.on_leave(state)
	_bindings.on_leave(state)
	state.is_active = false


## Called only while activating `state`: auto-enter direct children with enter == [sys.enter].
func _propagate_sys_enter(state: HfsmStateNode) -> void:
	if not state.is_active:
		return
	for child in state.children.values():
		if child is HfsmStateNode and not child.is_active:
			if child.enter_events.size() == 1 and child.enter_events[0] == HfsmConsts.SYS_ENTER:
				_activate(child, {})


func _dispatches_to_entities(event: HfsmEvent) -> bool:
	return event.name != HfsmConsts.SYS_ENTER


func _should_consume(event_name: String, state: HfsmStateNode) -> bool:
	if not _matches_any(event_name, state.consume_events):
		return false
	if _matches_any(event_name, state.enter_events):
		return false
	if _matches_any(event_name, state.leave_events):
		return false
	return true


func _matches_any(event_name: String, patterns: Array) -> bool:
	for pattern in patterns:
		if HfsmUtils.match_event(event_name, str(pattern)):
			return true
	return false
