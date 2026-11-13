class_name Toast
extends CanvasLayer

## Short message on top of everything; optionally with one action («Войти» for an invite).

signal ev_action(payload: String)

@export var panel: Control
@export var text_label: Label
@export var action_button: Button
@export var show_sec: float = 2.7
@export var action_sec: float = 9.0

var _payload: String = ""
var _timer: SceneTreeTimer


func _ready() -> void:
	panel.hide()
	action_button.pressed.connect(_on_action)


func show_text(text: String) -> void:
	_show(text, "", "", show_sec)


func show_action(text: String, action_text: String, payload: String) -> void:
	_show(text, action_text, payload, action_sec)


func _show(text: String, action_text: String, payload: String, seconds: float) -> void:
	text_label.text = text
	action_button.text = action_text
	action_button.visible = not action_text.is_empty()
	_payload = payload
	panel.show()
	panel.modulate.a = 1.0
	var timer := get_tree().create_timer(seconds)
	_timer = timer
	timer.timeout.connect(func() -> void:
		if _timer == timer:
			panel.hide()
	)


func _on_action() -> void:
	panel.hide()
	ev_action.emit(_payload)
