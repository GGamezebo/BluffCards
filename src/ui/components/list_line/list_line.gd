@tool
class_name ListLine
extends HBoxContainer

## «Подпись ........ значение» row (balance, standings, room info).

@export var caption: String = "Подпись":
	set(value):
		caption = value
		if caption_label != null:
			caption_label.text = value
@export var value_text: String = "—":
	set(value):
		value_text = value
		if value_label != null:
			value_label.text = value
@export var caption_label: Label
@export var value_label: Label


func _ready() -> void:
	caption = caption
	value_text = value_text


func setup(p_caption: String, p_value: String) -> void:
	caption = p_caption
	value_text = p_value
