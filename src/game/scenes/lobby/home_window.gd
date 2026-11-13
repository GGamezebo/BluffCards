class_name HomeWindow
extends Control

## Club hall (concept/design «Главная»): the illustrated table with the «С друзьями» and
## «Лидерборд» signs, the free «На вылет» marquee and the two doors: «Быстрая игра», «Клуб профессионалов».

signal ev_play(mode: String)

@export var series_button: Button
@export var quick_button: Button
@export var status_label: Label
@export var first_visit_hint: Control


func _ready() -> void:
	series_button.pressed.connect(func() -> void: ev_play.emit("series"))
	quick_button.pressed.connect(func() -> void: ev_play.emit("quick"))


func set_status(text: String) -> void:
	status_label.text = text
	status_label.visible = not text.is_empty()


func set_first_visit(first: bool) -> void:
	first_visit_hint.visible = first
