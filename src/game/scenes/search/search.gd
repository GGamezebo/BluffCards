extends IScene

## «Поиск соперников» (concept/design «search»): seats fill with players; a full table starts at once,
## after 20 s the server gives the free seats to bots. Cancel = leave the table (a paid fee comes back).

@export var table_view: TableView
@export var match_events: MatchEvents
@export var profile: PlayerProfile
@export var log_settings: LogSettings
## Shown when the scene runs alone (F6).
@export var demo_view: TableView
@export var app_bar: AppBar
@export var seats_box: Container
@export var mode_label: Label
@export var timer_label: Label
@export var progress: ProgressBar
@export var tip_label: Label
@export var cancel_button: Button
@export var avatar_scene: PackedScene
@export var empty_seat_scene: PackedScene
## Rotating tips under the table, seconds per tip.
@export var tip_sec: float = 4.0
@export var tips: PackedStringArray = [
	"Проверить можно ровно одну карту из последней пачки.",
	"Пасовать нельзя: «Не верю» или «Перевести».",
	"Четыре одинаковые карты в руке сразу уходят в минус.",
	"Положил последние карты — следующий обязан проверить.",
	"Ошибся с проверкой — забираешь всю стопку.",
]

var _listener := EventListener.new()
var _log: LogChannel
var _left: float = 0.0
var _total: float = 20.0
var _tip_time: float = 0.0
var _tip_index: int = 0


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("search", log_settings)
	if data.get("demo", false):
		table_view.set_view(demo_view.data.duplicate(true))
	_listener.add(match_events.ev_view, func(_v: Dictionary, _e: Array) -> void: _render())
	_listener.add(cancel_button.pressed, _on_cancel)
	_listener.add(profile.changed, func() -> void: app_bar.set_balance(profile.balance))
	app_bar.set_balance(profile.balance)
	_render()
	_log.info("open", {"mode": table_view.mode(), "fee": table_view.fee()})


func deinit() -> void:
	_listener.deinit()
	super.deinit()


func _default_data() -> Dictionary:
	return {"demo": true}


func _process(delta: float) -> void:
	_left = maxf(0.0, _left - delta)
	timer_label.text = "Поиск · %d / %d с" % [int(_total - ceilf(_left)), int(_total)]
	progress.value = (1.0 - _left / maxf(_total, 0.01)) * 100.0
	_tip_time += delta
	if _tip_time >= tip_sec and not tips.is_empty():
		_tip_time = 0.0
		_tip_index = (_tip_index + 1) % tips.size()
		tip_label.text = tips[_tip_index]


func _render() -> void:
	var view := table_view
	mode_label.text = view.title()
	_total = float(view.data.get("search_total", 20))
	_left = float(view.data.get("search_left", _total))
	var size := int(view.data.get("size", 4))
	var seats := view.seats()
	for child in seats_box.get_children():
		child.queue_free()
	for i in size:
		if i < seats.size():
			var avatar := avatar_scene.instantiate() as Avatar
			seats_box.add_child(avatar)
			avatar.setup(int(seats[i].get("avatar", 0)), str(seats[i].get("name", "")))
		else:
			seats_box.add_child(empty_seat_scene.instantiate())
	if not tips.is_empty():
		tip_label.text = tips[_tip_index]


func _on_cancel() -> void:
	_log.info("cancel", {"fee": table_view.fee()})
	match_events.ev_leave.emit("pro" if table_view.fee() > 0 else "")
