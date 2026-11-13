class_name EventListener
extends RefCounted

var _events: Dictionary = {}

func deinit() -> void:
	self.clear()
	
func clear() -> void:
	for event in self._events:
		# Emitter already freed (e.g. engine singleton / window at app quit) → its connections are gone.
		if not is_instance_valid(event.get_object()):
			continue
		var callbacks = self._events[event]
		for callback in callbacks:
			if event.is_connected(callback):
				event.disconnect(callback)
	self._events.clear()

func add(event: Signal, callback: Callable) -> void:
	var callbacks = self._events.get_or_add(event, [])
	if callback not in callbacks:
		event.connect(callback)
		callbacks.append(callback)
		
func remove(event: Signal, callback: Callable) -> void:
	var callbacks = self._events.get(event, [])
	if callback in callbacks:
		if is_instance_valid(event.get_object()) and event.is_connected(callback):
			event.disconnect(callback)
		callbacks.erase(callback)
