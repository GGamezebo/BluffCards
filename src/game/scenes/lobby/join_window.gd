class_name JoinWindow
extends Control

## «Вход по коду»: six letters or digits from an invite.

signal ev_join(code: String)

@export var code_edit: LineEdit
@export var join_button: Button
@export var hint_label: Label


func _ready() -> void:
	code_edit.text_changed.connect(_on_changed)
	code_edit.text_submitted.connect(func(_t: String) -> void: _submit())
	join_button.pressed.connect(_submit)
	_on_changed(code_edit.text)


func on_window_enter() -> void:
	code_edit.grab_focus()


func _on_changed(text: String) -> void:
	var upper := text.to_upper()
	if upper != text:
		var caret := code_edit.caret_column
		code_edit.text = upper
		code_edit.caret_column = caret
	join_button.disabled = upper.strip_edges().length() != 6


func _submit() -> void:
	var code := code_edit.text.strip_edges().to_upper()
	if code.length() != 6:
		hint_label.text = "Нужно шесть букв или цифр"
		return
	hint_label.text = "Введи шесть символов из приглашения."
	ev_join.emit(code)
