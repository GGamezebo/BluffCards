@tool
class_name Poster
extends PanelContainer

## Big headline block of a screen (title + subtitle, optional face on the right).

@export var title: String = "Заголовок":
	set(value):
		title = value
		if title_label != null:
			title_label.text = value
@export var subtitle: String = "":
	set(value):
		subtitle = value
		if subtitle_label != null:
			subtitle_label.text = value
			subtitle_label.visible = not value.is_empty()
@export var title_label: Label
@export var subtitle_label: Label
## Optional art slot (avatar / card): hidden when empty.
@export var art_slot: Control


func _ready() -> void:
	title = title
	subtitle = subtitle


func set_text(p_title: String, p_subtitle: String = "") -> void:
	title = p_title
	subtitle = p_subtitle
