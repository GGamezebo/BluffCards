class_name ReactionsSheet
extends Control

## «Реакции за столом»: a ready phrase, an emotion, or a throw at a chosen opponent. No free text.

signal ev_react(kind: String, id: int, target: int)

@export var reaction_set: ReactionSet
@export var tabs: Segmented
@export var grid: GridContainer
@export var targets_box: Control
@export var targets: HFlowContainer
@export var close_button: Button
@export var option_scene: PackedScene
@export var target_scene: PackedScene

const KINDS: Array[String] = ["phrase", "emoji", "throw"]

var _kind: String = "phrase"
var _target: int = -1
var _opponents: Array = []


func _ready() -> void:
	tabs.ev_selected.connect(func(i: int) -> void:
		_kind = KINDS[i]
		_rebuild()
	)
	close_button.pressed.connect(hide)


## `opponents`: [{"seat", "name"}].
func open_sheet(opponents: Array) -> void:
	_opponents = opponents
	if _target < 0 or not opponents.any(func(o: Dictionary) -> bool: return int(o["seat"]) == _target):
		_target = int(opponents[0]["seat"]) if not opponents.is_empty() else -1
	_rebuild()
	show()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		hide()
		accept_event()


func _rebuild() -> void:
	for child in grid.get_children():
		child.queue_free()
	for child in targets.get_children():
		child.queue_free()
	targets_box.visible = _kind == "throw"
	grid.columns = 2 if _kind == "phrase" else 4
	var count := reaction_set.phrases.size() if _kind == "phrase" else reaction_set.emoji.size() if _kind == "emoji" else reaction_set.throws.size()
	for id in count:
		var option := option_scene.instantiate() as Button
		grid.add_child(option)
		option.text = reaction_set.text(_kind, id)
		option.icon = reaction_set.icon(_kind, id)
		option.pressed.connect(func() -> void:
			ev_react.emit(_kind, id, _target if _kind == "throw" else -1)
			hide()
		)
	if _kind == "throw":
		for o in _opponents:
			var button := target_scene.instantiate() as Button
			targets.add_child(button)
			button.text = str(o["name"])
			button.set_pressed_no_signal(int(o["seat"]) == _target)
			var seat := int(o["seat"])
			button.pressed.connect(func() -> void:
				_target = seat
				_rebuild()
			)
