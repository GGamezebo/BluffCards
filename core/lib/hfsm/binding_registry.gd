class_name HfsmBindingRegistry
extends RefCounted

var _entities: Dictionary = {}
var _instances: Dictionary = {}
var _hfsm: HFSM = null


func _init(entities: Dictionary = {}) -> void:
	_entities = _build_index(entities)


func set_hfsm(hfsm: HFSM) -> void:
	_hfsm = hfsm


static func _build_index(entities: Dictionary) -> Dictionary:
	var index: Dictionary = {}
	for slot in entities.keys():
		var slot_entities = entities[slot]
		if not slot_entities is Dictionary:
			push_error("entities['%s'] must be a Dictionary of name -> Script" % slot)
			assert(false)
			continue
		var slot_index: Dictionary = {}
		for entity_name in slot_entities.keys():
			var script = slot_entities[entity_name]
			if script == null or not script is Script:
				push_error("entities['%s']['%s'] must be a Script" % [slot, entity_name])
				assert(false)
				continue
			var name := str(entity_name)
			if name.is_empty():
				push_error("Entity name in entities['%s'] cannot be empty" % slot)
				assert(false)
				continue
			if name in slot_index:
				push_error("Duplicate entity name '%s' in entities['%s']" % [name, slot])
				assert(false)
				continue
			slot_index[name] = script
		index[slot] = slot_index
	return index


func _state_instances(state: HfsmStateNode) -> Dictionary:
	if state.name not in _instances:
		_instances[state.name] = {}
	return _instances[state.name]


func _resolve_type(slot: String, entity_name: String, state_name: String) -> Script:
	if slot not in _entities:
		push_error("Entity slot '%s' is not registered (state '%s')" % [slot, state_name])
		assert(false)
		return null
	var slot_types: Dictionary = _entities[slot]
	if entity_name not in slot_types:
		push_error(
			"Entity '%s' is not registered in slot '%s' (state '%s')"
			% [entity_name, slot, state_name]
		)
		assert(false)
		return null
	return slot_types[entity_name]


func on_enter(state: HfsmStateNode, data: Dictionary = {}) -> void:
	var event_data := data if data else {}
	var instances := _state_instances(state)
	for slot in state.bindings.keys():
		if slot in instances:
			continue
		var entity_name: String = state.bindings[slot]
		var script := _resolve_type(slot, entity_name, state.name)
		var entity: HfsmBoundEntity = script.new(event_data)
		if _hfsm != null:
			entity.sync_hfsm(_hfsm)
		instances[slot] = entity



func on_event(state: HfsmStateNode, event: HfsmEvent) -> void:
	var instances: Dictionary = _state_instances(state)
	for entity in instances.values():
		if entity.has_method("on_event"):
			entity.on_event(event.name, event.data)


func on_leave(state: HfsmStateNode) -> void:
	if state.name not in _instances:
		return
	var instances: Dictionary = _instances[state.name]
	_instances.erase(state.name)
	for entity in instances.values():
		if entity.has_method("deinit"):
			entity.deinit()


func on_reset_all(states: Array) -> void:
	for state in states:
		if state is HfsmStateNode and state.name in _instances:
			on_leave(state)


func get_binding(state: HfsmStateNode, slot: String) -> HfsmBoundEntity:
	if state.name not in _instances:
		return null
	var instances: Dictionary = _instances[state.name]
	if slot not in instances:
		return null
	return instances[slot]


func clear() -> void:
	for state_name in _instances.keys():
		var instances: Dictionary = _instances[state_name]
		for entity in instances.values():
			if entity.has_method("deinit"):
				entity.deinit()
	_instances.clear()
