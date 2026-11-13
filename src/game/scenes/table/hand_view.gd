class_name HandView
extends VBoxContainer

## «Ваша рука» (concept/design «Раздача с 39 картами»): up to `fan_limit` cards → a fan of single
## cards; more → groups by rank where each tap adds one card of the group (after the full group the
## next tap clears it), plus «Выбрать все» / «Сбросить». Selection is local until the move is sent.

signal ev_selection_changed(selected: Array)

@export var fan_limit: int = 7
@export var fan: HBoxContainer
@export var groups: GridContainer
@export var tools: Control
@export var count_label: Label
@export var select_all_button: Button
@export var clear_button: Button
@export var card_scene: PackedScene
@export var stack_scene: PackedScene

var _hand: Array = []
var _selected: Array[int] = []
var _selectable: bool = false


func _ready() -> void:
	select_all_button.pressed.connect(func() -> void:
		_selected.clear()
		for c in _hand:
			_selected.append(int(c))
		_changed()
	)
	clear_button.pressed.connect(func() -> void:
		_selected.clear()
		_changed()
	)


func setup(hand: Array, selectable: bool, selected: Array[int]) -> void:
	_hand.clear()
	for c in hand:
		_hand.append(int(c))
	_selectable = selectable
	_selected.clear()
	for c in selected:
		if _hand.has(c):
			_selected.append(c)
	_rebuild()


func selected() -> Array[int]:
	return _selected.duplicate()


func global_center() -> Vector2:
	return global_position + size * 0.5


func _rebuild() -> void:
	for child in fan.get_children():
		child.queue_free()
	for child in groups.get_children():
		child.queue_free()
	var as_groups := _hand.size() > fan_limit
	fan.visible = not as_groups
	groups.visible = as_groups
	tools.visible = as_groups and _selectable
	if as_groups:
		_build_groups()
	else:
		for c in _hand:
			var card := card_scene.instantiate() as CardFace
			fan.add_child(card)
			card.card = int(c)
			card.disabled = not _selectable
			card.set_selected(_selected.has(int(c)))
			card.ev_card_toggled.connect(_on_card_toggled)
	count_label.text = "Выбрано %d" % _selected.size()
	select_all_button.disabled = _selected.size() == _hand.size()
	clear_button.disabled = _selected.is_empty()


func _build_groups() -> void:
	for rank in Cards.RANK_COUNT:
		var cards := _cards_of(rank)
		if cards.is_empty():
			continue
		var stack := stack_scene.instantiate() as Button
		groups.add_child(stack)
		var picked := cards.filter(func(c: int) -> bool: return _selected.has(c)).size()
		stack.text = "%s\n%d/%d" % [Cards.label(rank), picked, cards.size()]
		stack.disabled = not _selectable
		stack.set_pressed_no_signal(picked > 0)
		stack.tooltip_text = "%s · выбрано %d из %d" % [Cards.label(rank), picked, cards.size()]
		stack.pressed.connect(_on_group_pressed.bind(rank))


func _cards_of(rank: int) -> Array[int]:
	var out: Array[int] = []
	for c in _hand:
		if Cards.rank_of(int(c)) == rank:
			out.append(int(c))
	out.sort()
	return out


func _on_group_pressed(rank: int) -> void:
	var cards := _cards_of(rank)
	var picked := cards.filter(func(c: int) -> bool: return _selected.has(c)).size()
	var next := (picked + 1) % (cards.size() + 1)
	for i in cards.size():
		_selected.erase(cards[i])
		if i < next:
			_selected.append(cards[i])
	_changed()


func _on_card_toggled(card: int, on: bool) -> void:
	_selected.erase(card)
	if on:
		_selected.append(card)
	count_label.text = "Выбрано %d" % _selected.size()
	ev_selection_changed.emit(_selected.duplicate())


func _changed() -> void:
	_rebuild()
	ev_selection_changed.emit(_selected.duplicate())
