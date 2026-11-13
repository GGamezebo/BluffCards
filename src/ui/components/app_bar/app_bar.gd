@tool
class_name AppBar
extends PanelContainer

## Top bar of the lobby screens: logo (home), chips balance, «Как играть», account medal.

signal ev_home
signal ev_help
signal ev_account

@export var show_help: bool = true:
	set(value):
		show_help = value
		if help_button != null:
			help_button.visible = value
@export var logo_button: Button
@export var balance_label: Label
@export var help_button: Button
@export var account_button: Button


func _ready() -> void:
	help_button.visible = show_help
	if Engine.is_editor_hint():
		return
	logo_button.pressed.connect(func() -> void: ev_home.emit())
	help_button.pressed.connect(func() -> void: ev_help.emit())
	account_button.pressed.connect(func() -> void: ev_account.emit())


func set_balance(amount: int) -> void:
	balance_label.text = Cards.chips(amount)
