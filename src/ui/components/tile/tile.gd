@tool
class_name Tile
extends Button

## List item: title, subtitle and a badge on the right (→, +, ✓…). Toggle look via `selected`.

signal ev_tile_pressed(key: String)

## Payload of the item (user id, company id, …).
@export var key: String = ""
@export var title: String = "Название":
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
@export var badge: String = "→":
	set(value):
		badge = value
		if badge_label != null:
			badge_label.text = value
@export var selected: bool = false:
	set(value):
		selected = value
		if selected_panel != null:
			selected_panel.visible = value
@export var title_label: Label
@export var subtitle_label: Label
@export var badge_label: Label
@export var selected_panel: Control


func _ready() -> void:
	title = title
	subtitle = subtitle
	badge = badge
	selected = selected
	if not Engine.is_editor_hint():
		pressed.connect(func() -> void: ev_tile_pressed.emit(key))


func setup(p_key: String, p_title: String, p_subtitle: String, p_badge: String, p_selected: bool = false) -> void:
	key = p_key
	title = p_title
	subtitle = p_subtitle
	badge = p_badge
	selected = p_selected
