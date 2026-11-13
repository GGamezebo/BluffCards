@tool
class_name ModalDialog
extends Control

## Centered modal over a screen (confirmations, rank info, «Миссия пройдена»). Not on the window
## stack. Extra controls of a concrete dialog go into `content` in the owner's scene.

signal ev_primary
signal ev_secondary
signal ev_closed

@export var title_label: Label
@export var body_label: Label
@export var content: Container
@export var primary_button: Button
@export var secondary_button: Button
@export var close_button: Button
## Tap on the dim background closes the dialog.
@export var dismissable: bool = true


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	primary_button.pressed.connect(func() -> void: ev_primary.emit())
	secondary_button.pressed.connect(func() -> void: ev_secondary.emit())
	close_button.pressed.connect(close)


func open_dialog(title: String, body: String = "", primary: String = "", secondary: String = "") -> void:
	title_label.text = title
	body_label.text = body
	body_label.visible = not body.is_empty()
	primary_button.text = primary
	primary_button.visible = not primary.is_empty()
	secondary_button.text = secondary
	secondary_button.visible = not secondary.is_empty()
	show()
	if primary_button.visible:
		primary_button.grab_focus()


func close() -> void:
	if not visible:
		return
	hide()
	ev_closed.emit()


func _gui_input(event: InputEvent) -> void:
	if dismissable and event is InputEventMouseButton and event.pressed:
		close()
		accept_event()


func _unhandled_input(event: InputEvent) -> void:
	if visible and dismissable and event.is_action_pressed("ui_cancel"):
		close()
		get_viewport().set_input_as_handled()
