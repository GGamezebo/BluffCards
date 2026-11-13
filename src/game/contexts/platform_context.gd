class_name PlatformContext
extends HfsmBoundEntity

## Base for platform HFSM contexts (App/Platform/...). Platform code lives only here;
## the game reads the result through shared Resources (`PlatformCaps`) and RootEvents.

var data: Dictionary = {}
var platform_caps: PlatformCaps = null
var root_events: RootEvents = null


func _init(p_data: Dictionary = {}) -> void:
	data = p_data
	platform_caps = data.get("platform_caps") as PlatformCaps
	root_events = data.get("root_events") as RootEvents


## The HFSM is bound only after `_init`, so `add_event` works from `_enter` on.
func sync_hfsm(hfsm: HFSM) -> void:
	super.sync_hfsm(hfsm)
	_enter()


func _enter() -> void:
	pass


func open_child(event_name: String, extra: Dictionary = {}) -> void:
	add_event(event_name, data.merged(extra))
