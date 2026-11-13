@tool
class_name CardBack
extends Button

## Closed card (mandarin back with eyes). Disabled = just a picture; enabled = a card to open
## during «Не верю» (`ev_picked`). An optional number helps to pick in a wide packet.

signal ev_picked(index: int)

@export var index: int = 0
@export var number_visible: bool = false:
	set(value):
		number_visible = value
		if number_label != null:
			number_label.visible = value
@export var number_label: Label


func _ready() -> void:
	pressed.connect(func() -> void: ev_picked.emit(index))
	if number_label != null:
		number_label.visible = number_visible


func setup(p_index: int, pickable: bool, numbered: bool) -> void:
	index = p_index
	disabled = not pickable
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if pickable else Control.CURSOR_ARROW
	number_visible = numbered
	if number_label != null:
		number_label.text = str(p_index + 1)
