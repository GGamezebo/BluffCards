extends IScene

## App/Online/Match context: one server table from joining to leaving.
## Mounted on `ev.join_match` ({"match_id", optional "mode"/"fee" of a public search}), unmounted on
## `ev.open_menu` / `ev.close_match`, so leaving a table is never another scene's job.
## Puts every server view into `TableView`, re-emits it on `MatchEvents` and opens the screen the
## table needs (Search / Room / Table / Result). Screens send intents back through `MatchEvents`.

@export var match_events: MatchEvents
@export var online_events: OnlineEvents
@export var online_link: OnlineLink
@export var table_view: TableView
@export var log_settings: LogSettings

var _listener := EventListener.new()
var _socket_listener := EventListener.new()
var _log: LogChannel
var _match_id: String = ""
var _request: Dictionary = {}
var _screen: String = ""
var _joined: bool = false
var _leaving: bool = false
var _profile_synced: bool = false


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("match", log_settings)
	_match_id = str(data.get("match_id", ""))
	_request = data.duplicate()
	table_view.set_view({})
	_listener.add(match_events.ev_intent, _send)
	_listener.add(match_events.ev_leave, _leave)
	_listener.add(online_link.ev_socket_changed, _on_socket_changed)
	_log.info("open", {"match": _match_id})
	if _match_id.is_empty():
		return
	if online_link.socket != null:
		_bind(online_link.socket)
		_join()


func deinit() -> void:
	_log.info("close", {"match": _match_id, "joined": _joined})
	_listener.deinit()
	_socket_listener.deinit()
	if _joined and online_link.socket != null and online_link.socket.is_connected_to_host():
		online_link.socket.leave_match_async(_match_id)
	_joined = false
	super.deinit()


func _bind(socket: NakamaSocket) -> void:
	_socket_listener.clear()
	_socket_listener.add(socket.received_match_state, _on_match_state)


func _join() -> void:
	var socket := online_link.socket
	var result: NakamaAsyncResult = await socket.join_match_async(_match_id)
	if _hfsm == null:
		return
	if result.is_exception():
		var message := str(result.get_exception().message)
		_log.warn("join_failed", {"match": _match_id, "error": message})
		if message.contains("table_full") and _request.has("mode"):
			online_events.ev_find_table.emit(str(_request["mode"]), int(_request.get("fee", 0)))
			return
		online_events.ev_toast.emit(MatchOps.error_text("not_enough_chips") if message.contains("not_enough_chips") else "Стол больше недоступен")
		add_event("ev.open_menu")
		return
	_joined = true
	_log.info("joined", {"match": _match_id})
	match_events.ev_connection.emit(true)


func _on_socket_changed(online: bool) -> void:
	if not online:
		_joined = false
		_log.warn("connection_lost", {"match": _match_id})
		match_events.ev_connection.emit(false)
		return
	_bind(online_link.socket)
	_join()


func _on_match_state(state: NakamaRTAPI.MatchData) -> void:
	if state.match_id != _match_id:
		return
	var parsed: Variant = JSON.parse_string(state.data)
	if not parsed is Dictionary:
		_log.warn("bad_message", {"op": state.op_code})
		return
	match state.op_code:
		MatchOps.VIEW:
			var view: Dictionary = parsed.get("view", {})
			var events: Array = parsed.get("events", [])
			table_view.set_view(view)
			match_events.ev_view.emit(view, events)
			_log.debug("view", {"phase": view.get("phase", ""), "events": events.size()})
			_sync_profile(view)
			_route(view)
		MatchOps.REACTION:
			match_events.ev_reaction.emit(parsed)
		MatchOps.ERROR:
			var code := str(parsed.get("error", ""))
			_log.info("server_error", {"code": code})
			match_events.ev_error.emit(code)


## Chips change at the paid seat and at the final prizes: refresh the lobby balance then.
func _sync_profile(view: Dictionary) -> void:
	var finished := str(view.get("phase", "")) == "finished"
	if (int(view.get("fee", 0)) > 0 and not _profile_synced) or finished:
		_profile_synced = true
		online_events.ev_refresh_profile.emit()


func _route(view: Dictionary) -> void:
	var target := _screen_for(view)
	if target == _screen:
		return
	_screen = target
	_log.info("screen", {"event": target, "phase": view.get("phase", ""), "kind": view.get("kind", "")})
	add_event(target)


func _screen_for(view: Dictionary) -> String:
	var kind := str(view.get("kind", "public"))
	var phase := str(view.get("phase", "waiting"))
	var seated := int(view.get("me", -1)) >= 0
	if kind == "lesson":
		return "ev.open_table"
	if kind == "public":
		if phase == "waiting":
			return "ev.open_search"
		return "ev.open_result" if phase == "finished" else "ev.open_table"
	if phase == "waiting" or not seated:
		return "ev.open_room"
	return "ev.open_result" if phase == "finished" else "ev.open_table"


func _send(op: int, payload: Dictionary) -> void:
	if online_link.socket == null or not _joined:
		match_events.ev_error.emit("offline")
		return
	_log.debug("intent", {"op": op})
	online_link.socket.send_match_state_async(_match_id, op, JSON.stringify(payload))


func _leave(window: String) -> void:
	if _leaving:
		return
	_leaving = true
	var phase := table_view.phase()
	if _joined and phase != "finished":
		_send(MatchOps.LEAVE, {})
	_log.info("leave", {"match": _match_id, "phase": phase})
	add_event("ev.open_menu", {"window": window})
