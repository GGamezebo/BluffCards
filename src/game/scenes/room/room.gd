extends IScene

## «Комната друзей» (concept/formats.md «С друзьями»): the host picks the format, the seats and the
## timer, adds bots, invites by code / link / friends list and starts. The room lives between games;
## late friends wait in the queue and sit down for the next game. No chips at friends tables.

@export var table_view: TableView
@export var match_events: MatchEvents
@export var online_events: OnlineEvents
@export var profile: PlayerProfile
@export var platform_caps: PlatformCaps
@export var log_settings: LogSettings
## Shown when the scene runs alone (F6).
@export var demo_view: TableView
@export var app_bar: AppBar
@export var back_button: Button
@export var seats_box: Container
@export var seat_scene: PackedScene
@export var company_label: Label
@export var info_label: Label
@export var queue_notice: Control
@export var host_box: Control
@export var guest_label: Label
@export var mode_tabs: Segmented
@export var size_label: Label
@export var size_minus: Button
@export var size_plus: Button
@export var timer_tabs: Segmented
@export var invite_button: Button
@export var add_bot_button: Button
@export var start_button: Button
@export var invite_dialog: ModalDialog
@export var copy_button: Button
@export var friends_list: VBoxContainer
@export var tile_scene: PackedScene
@export var send_button: Button

const TIMERS: Array[int] = [20, 60, 0]
const MODES: Array[String] = ["quick", "series"]

var _listener := EventListener.new()
var _log: LogChannel
var _picked: Array[String] = []


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("room", log_settings)
	if data.get("demo", false):
		table_view.set_view(demo_view.data.duplicate(true))
	_listener.add(match_events.ev_view, func(_v: Dictionary, _e: Array) -> void: _render())
	_listener.add(match_events.ev_error, func(code: String) -> void: online_events.ev_toast.emit(MatchOps.error_text(code)))
	_listener.add(back_button.pressed, func() -> void: match_events.ev_leave.emit("friends"))
	_listener.add(mode_tabs.ev_selected, func(i: int) -> void: _config({"mode": MODES[i]}))
	_listener.add(timer_tabs.ev_selected, func(i: int) -> void: _config({"timer": TIMERS[i]}))
	_listener.add(size_minus.pressed, func() -> void: _config({"size": _size() - 1}))
	_listener.add(size_plus.pressed, func() -> void: _config({"size": _size() + 1}))
	_listener.add(add_bot_button.pressed, func() -> void: match_events.ev_intent.emit(MatchOps.ADD_BOT, {}))
	_listener.add(start_button.pressed, _on_start)
	_listener.add(invite_button.pressed, _open_invite)
	_listener.add(copy_button.pressed, _copy_link)
	_listener.add(send_button.pressed, _send_invites)
	_listener.add(invite_dialog.ev_primary, invite_dialog.close)
	_listener.add(online_events.ev_social, _fill_friends)
	_listener.add(profile.changed, func() -> void: app_bar.set_balance(profile.balance))
	app_bar.set_balance(profile.balance)
	_render()
	_log.info("open", {"code": table_view.data.get("code", ""), "host": table_view.is_host()})


func deinit() -> void:
	_listener.deinit()
	super.deinit()


func _default_data() -> Dictionary:
	return {"demo": true}


func _size() -> int:
	return int(table_view.data.get("size", 4))


func _config(change: Dictionary) -> void:
	match_events.ev_intent.emit(MatchOps.CONFIG, change)


func _render() -> void:
	var view := table_view
	var seats := view.seats()
	var size := _size()
	var host := view.is_host()
	var waiting := view.phase() == "waiting"
	for child in seats_box.get_children():
		child.queue_free()
	for i in size:
		var seat := seat_scene.instantiate() as RoomSeat
		seats_box.add_child(seat)
		if i < seats.size():
			var s: Dictionary = seats[i]
			var is_bot := bool(s.get("bot", false))
			var title := "Бот · %s" % s.get("name", "") if is_bot else view.seat_name(i)
			seat.setup(i, "bot" if is_bot else "player", title, int(s.get("avatar", 0)), bool(s.get("host", false)), str(s.get("name", "")))
		else:
			seat.setup(i, "free", "", 0, false)
		seat.ev_seat_pressed.connect(_on_seat_pressed)
	company_label.text = str(view.data.get("company", "Комната"))
	var timer := int(view.data.get("timer", 20))
	info_label.text = "%d / %d мест · код %s" % [seats.size(), size, view.data.get("code", "")]
	queue_notice.visible = view.me() < 0
	host_box.visible = host and waiting
	guest_label.visible = not host
	guest_label.text = "Хозяин выбирает формат: %s · %d мест · таймер %s" % [
		"быстрая игра" if view.mode() == "quick" else "на вылет", size, "%d с" % timer if timer > 0 else "выкл."]
	mode_tabs.select(MODES.find(view.mode()))
	timer_tabs.select(maxi(0, TIMERS.find(timer)))
	size_label.text = str(size)
	size_minus.disabled = size <= maxi(2, seats.size())
	size_plus.disabled = size >= 10
	add_bot_button.visible = host and waiting
	add_bot_button.disabled = seats.size() >= size
	start_button.visible = host and waiting
	start_button.disabled = seats.size() < 2
	var watchers: Array = view.data.get("watchers", [])
	if not watchers.is_empty():
		info_label.text += " · ждут: %s" % ", ".join(PackedStringArray(watchers))


func _on_seat_pressed(seat: int, kind: String) -> void:
	if kind == "free":
		_open_invite()
	elif kind == "bot" and table_view.is_host():
		match_events.ev_intent.emit(MatchOps.REMOVE_BOT, {"seat": seat})


func _on_start() -> void:
	_log.info("start", {"seats": table_view.seats().size(), "mode": table_view.mode()})
	match_events.ev_intent.emit(MatchOps.START, {})


func _link() -> String:
	return platform_caps.invite_base_url + str(table_view.data.get("code", ""))


func _open_invite() -> void:
	var code := str(table_view.data.get("code", ""))
	_picked.clear()
	invite_dialog.open_dialog("Позвать за стол", "Код комнаты · %s\n%s" % [code, _link()], "В комнату")
	online_events.ev_load_social.emit()


func _copy_link() -> void:
	DisplayServer.clipboard_set("Садись за мой стол в «Верю — не верю»: %s (код %s)" % [_link(), table_view.data.get("code", "")])
	online_events.ev_toast.emit("Ссылка скопирована")


func _fill_friends(data: Dictionary) -> void:
	if not invite_dialog.visible:
		return
	for child in friends_list.get_children():
		child.queue_free()
	for f in data.get("friends", []):
		if int(f.get("state", 0)) != 0:
			continue
		var tile := tile_scene.instantiate() as Tile
		friends_list.add_child(tile)
		var id := str(f["id"])
		tile.setup(id, str(f["name"]), "В сети" if bool(f.get("online", false)) else "Не в сети", "+")
		tile.ev_tile_pressed.connect(func(key: String) -> void:
			if _picked.has(key):
				_picked.erase(key)
			else:
				_picked.append(key)
			tile.selected = _picked.has(key)
			tile.badge = "✓" if tile.selected else "+"
			send_button.text = "Позвать выбранных · %d" % _picked.size()
		)
	for c in data.get("companies", []):
		var company := tile_scene.instantiate() as Tile
		friends_list.add_child(company)
		company.setup("company:" + str(c["id"]), "Компания · %s" % c["name"], "Позвать всех", "→")
		company.ev_tile_pressed.connect(func(key: String) -> void:
			online_events.ev_invite.emit(str(table_view.data.get("code", "")), [], key.trim_prefix("company:"))
		)
	send_button.text = "Позвать выбранных"


func _send_invites() -> void:
	if _picked.is_empty():
		online_events.ev_toast.emit("Отметь друзей в списке")
		return
	online_events.ev_invite.emit(str(table_view.data.get("code", "")), _picked.duplicate(), "")
	invite_dialog.close()
