@tool
class_name Segmented
extends HBoxContainer

## Tabs / one-of-N switch («Друзья · Компании · Недавние», «Быстрая · На вылет»).
## Buttons come from the editor-made `option_scene` template.

signal ev_selected(index: int)

@export var options: PackedStringArray = ["Первый", "Второй"]:
	set(value):
		options = value
		_rebuild()
@export var selected: int = 0:
	set(value):
		selected = value
		_sync()
@export var option_scene: PackedScene

var _group := ButtonGroup.new()


func _ready() -> void:
	_rebuild()


func select(index: int) -> void:
	selected = index


func _rebuild() -> void:
	if not is_inside_tree() or option_scene == null:
		return
	for child in get_children():
		remove_child(child)
		child.queue_free()
	for i in options.size():
		var button := option_scene.instantiate() as Button
		button.text = options[i]
		button.button_group = _group
		button.toggle_mode = true
		add_child(button)
		if not Engine.is_editor_hint():
			button.pressed.connect(_on_pressed.bind(i))
	_sync()


func _sync() -> void:
	for i in get_child_count():
		var button := get_child(i) as Button
		if button != null:
			button.set_pressed_no_signal(i == selected)


func _on_pressed(index: int) -> void:
	selected = index
	ev_selected.emit(index)
