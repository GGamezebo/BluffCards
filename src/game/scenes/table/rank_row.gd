class_name RankRow
extends HBoxContainer

## 13 ranks «2 … Т». Strip mode (above the felt): the claim is lit, collected ranks fade, a tap
## asks for the rank info. Picker mode (opening a round): choose the claim; collected ranks are closed.

signal ev_rank_pressed(rank: int)

@export var picker: bool = false
@export var dead_alpha: float = 0.32

var _buttons: Array[Button] = []
var _claim: int = -1
var _group := ButtonGroup.new()


func _ready() -> void:
	for child in get_children():
		var button := child as Button
		if button == null:
			continue
		var rank := _buttons.size()
		_buttons.append(button)
		if picker:
			button.button_group = _group
		button.pressed.connect(_on_pressed.bind(rank))


## `dead`: rank → seat holding that minus. `claim`: lit rank in strip mode / chosen rank in picker mode.
func set_state(dead: Dictionary, claim: int) -> void:
	_claim = claim
	for rank in _buttons.size():
		var button := _buttons[rank]
		var is_dead := dead.has(rank)
		if picker:
			button.disabled = is_dead
			button.set_pressed_no_signal(rank == claim and not is_dead)
		else:
			button.set_pressed_no_signal(rank == claim)
		button.modulate.a = dead_alpha if is_dead else 1.0


func global_center(rank: int) -> Vector2:
	if rank < 0 or rank >= _buttons.size():
		return global_position + size * 0.5
	var button := _buttons[rank]
	return button.global_position + button.size * 0.5


func _on_pressed(rank: int) -> void:
	if not picker:
		_buttons[rank].set_pressed_no_signal(rank == _claim)
	ev_rank_pressed.emit(rank)
