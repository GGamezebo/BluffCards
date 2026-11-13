class_name TableSeat
extends Button

## An opponent at the felt: face, name, cards in hand and open minuses, turn ring + timer bar,
## «объявил» mark for the author of the last packet, reaction bubble.

signal ev_seat_pressed(seat: int)

@export var avatar: Avatar
@export var name_label: Label
@export var info_label: Label
@export var status_label: Label
@export var timer_bar: ProgressBar
@export var target_mark: Control
@export var bubble: Control
@export var bubble_label: Label
@export var bubble_icon: TextureRect
@export var bubble_sec: float = 2.0

var seat: int = -1
var _bubble_token: int = 0


func _ready() -> void:
	pressed.connect(func() -> void: ev_seat_pressed.emit(seat))
	bubble.hide()


## `info` = the seat dictionary of the view; `turn_ratio` < 0 hides the timer.
func setup(info: Dictionary, title: String, is_actor: bool, is_target: bool, turn_ratio: float, dense: bool) -> void:
	seat = int(info.get("seat", -1))
	avatar.setup(int(info.get("avatar", 0)), str(info.get("name", "")))
	avatar.ring = is_actor
	var gone := bool(info.get("out", false)) or not bool(info.get("alive", true))
	avatar.dimmed = gone
	avatar.custom_minimum_size = Vector2(52, 52) if dense else Vector2(66, 66)
	name_label.text = title
	var minus: Array = info.get("minus", [])
	if not bool(info.get("alive", true)):
		info_label.text = "выбыл · −%d" % minus.size()
	elif bool(info.get("out", false)):
		info_label.text = "вышел · −%d" % minus.size()
	else:
		info_label.text = "%d карт · −%d" % [int(info.get("cards", 0)), minus.size()]
	var status := ""
	if bool(info.get("bot", false)):
		status = "бот"
	if bool(info.get("left", false)):
		status = "ушёл · играет бот"
	elif bool(info.get("away", false)):
		status = "отошёл"
	elif not bool(info.get("connected", true)):
		status = "нет связи"
	status_label.text = status
	status_label.visible = not status.is_empty()
	timer_bar.visible = is_actor and turn_ratio >= 0.0
	timer_bar.value = clampf(turn_ratio, 0.0, 1.0) * 100.0
	target_mark.visible = is_target


func set_turn_ratio(ratio: float) -> void:
	if timer_bar.visible:
		timer_bar.value = clampf(ratio, 0.0, 1.0) * 100.0


func show_reaction(text: String, icon: Texture2D) -> void:
	bubble_label.text = text
	bubble_label.visible = not text.is_empty()
	bubble_icon.texture = icon
	bubble_icon.visible = icon != null
	bubble.show()
	_bubble_token += 1
	var token := _bubble_token
	get_tree().create_timer(bubble_sec).timeout.connect(func() -> void:
		if token == _bubble_token and is_instance_valid(bubble):
			bubble.hide()
	)


func center_global() -> Vector2:
	return avatar.global_position + avatar.size * 0.5
