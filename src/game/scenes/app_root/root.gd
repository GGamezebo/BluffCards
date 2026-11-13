extends IScene

## App root context: opens the parallel Platform and Online states, bridges RootEvents into HFSM
## events and owns the app-wide toast (messages, room invites). Holds no gameplay.

@export var root_events: RootEvents
@export var online_events: OnlineEvents
@export var platform_caps: PlatformCaps
@export var log_settings: LogSettings
@export var toast: Toast

var _listener := EventListener.new()
var _log: LogChannel


func initialize(_data: Dictionary) -> void:
	_log = LogChannel.new("app", log_settings)
	_log.info("start", {
		"version": ProjectSettings.get_setting("application/config/version", "dev"),
		"os": OS.get_name(),
		"debug": OS.is_debug_build(),
	})
	_listener.add(root_events.ev_return_to_menu, _on_return_to_menu)
	_listener.add(online_events.ev_toast, toast.show_text)
	_listener.add(online_events.ev_invite_received, _on_invite)
	_listener.add(toast.ev_action, func(code: String) -> void: online_events.ev_join_room.emit(code))
	# The platform branch is picked inside App/Platform (PlatformRouterContext), never here.
	add_event("ev.open_platform", {"platform_caps": platform_caps, "root_events": root_events})
	add_event("ev.open_online")


func deinit() -> void:
	_listener.deinit()
	super.deinit()


func on_event(event_name: String, _data: Dictionary) -> void:
	if _log != null and event_name.begins_with("ev."):
		_log.info("hfsm_event", {"event": event_name, "path": "/".join(_hfsm.get_active_path()) if _hfsm else ""})


func _on_return_to_menu(data: Dictionary) -> void:
	_log.info("return_to_menu", {"window": data.get("window", "")})
	add_event("ev.open_menu", data)


func _on_invite(code: String, from_name: String) -> void:
	_log.info("invite_received", {"code": code})
	toast.show_action("%s зовёт за стол" % from_name, "Войти", code)
