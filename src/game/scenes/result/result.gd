extends IScene

## «Итог стола» (concept/design «final»): winners, places, chips, «уважение» to the opponents,
## «Ещё раз» (same format again / back to the friends room) and «На главную».

@export var table_view: TableView
@export var match_events: MatchEvents
@export var online_events: OnlineEvents
@export var profile: PlayerProfile
@export var log_settings: LogSettings
## Shown when the scene runs alone (F6).
@export var demo_view: TableView
@export var app_bar: AppBar
@export var winner_faces: Container
@export var winner_names: Label
@export var winner_sub: Label
@export var places_box: VBoxContainer
@export var coins_line: ListLine
@export var respect_box: Container
@export var again_button: Button
@export var home_button: Button
@export var avatar_scene: PackedScene
@export var line_scene: PackedScene
@export var respect_scene: PackedScene

var _listener := EventListener.new()
var _log: LogChannel
var _respected: Array[int] = []


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("result", log_settings)
	if data.get("demo", false):
		table_view.set_view(demo_view.data.duplicate(true))
	_listener.add(match_events.ev_view, func(_v: Dictionary, _e: Array) -> void: _render())
	_listener.add(again_button.pressed, _on_again)
	_listener.add(home_button.pressed, func() -> void: match_events.ev_leave.emit(""))
	_listener.add(profile.changed, func() -> void: app_bar.set_balance(profile.balance))
	app_bar.set_balance(profile.balance)
	_render()
	var res := table_view.result()
	_log.info("open", {"place": res.get("place", 0), "coins": res.get("coins", 0), "kind": table_view.kind()})


func deinit() -> void:
	_listener.deinit()
	super.deinit()


func _default_data() -> Dictionary:
	return {"demo": true}


func _render() -> void:
	var view := table_view
	var res := view.result()
	var placements: Array = res.get("placements", [])
	for child in winner_faces.get_children():
		child.queue_free()
	var names: PackedStringArray = []
	if not placements.is_empty():
		for seat in placements[0]:
			var avatar := avatar_scene.instantiate() as Avatar
			winner_faces.add_child(avatar)
			var s := view.seat(int(seat))
			avatar.setup(int(s.get("avatar", 0)), str(s.get("name", "")))
			names.append(view.seat_name(int(seat)))
	winner_names.text = " и ".join(names) if not names.is_empty() else "Стол завершён"
	var place := int(res.get("place", 0))
	winner_sub.text = "Первое место · ваше место %d" % place if place > 0 else "Первое место"
	for child in places_box.get_children():
		child.queue_free()
	var start := 1
	for group in placements:
		var line := line_scene.instantiate() as ListLine
		places_box.add_child(line)
		var who: PackedStringArray = []
		for seat in group:
			who.append(view.seat_name(int(seat)))
		line.setup("%d место" % start, ", ".join(who))
		start += (group as Array).size()
	coins_line.setup("Фишки", "+%s" % Cards.chips(int(res.get("coins", 0))) if view.kind() == "public" else "без фишек · стол друзей")
	for child in respect_box.get_children():
		child.queue_free()
	for i in view.seats().size():
		if i == view.me():
			continue
		var button := respect_scene.instantiate() as Button
		respect_box.add_child(button)
		button.text = view.seat_name(i)
		button.disabled = _respected.has(i)
		button.pressed.connect(_on_respect.bind(i, button))
	again_button.text = "В комнату" if view.kind() == "friends" else "Ещё раз"


func _on_respect(seat: int, button: Button) -> void:
	_respected.append(seat)
	button.disabled = true
	match_events.ev_intent.emit(MatchOps.RESPECT, {"seat": seat})


func _on_again() -> void:
	var view := table_view
	_log.info("again", {"kind": view.kind(), "mode": view.mode(), "fee": view.fee()})
	if view.kind() == "friends":
		match_events.ev_intent.emit(MatchOps.AGAIN, {})
	elif view.fee() > 0:
		match_events.ev_leave.emit("pro")
	else:
		online_events.ev_find_table.emit(view.mode(), 0)
