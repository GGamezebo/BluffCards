class_name RoomSeat
extends VBoxContainer

## One place at the friends room table: a friend, a bot (host may remove it) or a free «+».

signal ev_seat_pressed(seat: int, kind: String)

@export var avatar: Avatar
@export var name_label: Label
@export var button: Button

var _seat: int = -1
var _kind: String = "free"


func _ready() -> void:
	button.pressed.connect(func() -> void: ev_seat_pressed.emit(_seat, _kind))


## kind: "player" | "bot" | "free"
func setup(seat: int, kind: String, player_name: String, avatar_id: int, host: bool, avatar_name: String = "") -> void:
	_seat = seat
	_kind = kind
	avatar.visible = kind != "free"
	button.visible = kind == "free"
	if kind != "free":
		avatar.setup(avatar_id, avatar_name if not avatar_name.is_empty() else player_name)
	name_label.text = ("★ " if host else "") + (player_name if kind != "free" else "Свободно")
