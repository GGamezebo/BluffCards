@tool
class_name CardFace
extends Button

## Open card: big rank in the corner (the rank is all that matters in the rules), a small suit,
## a large suit in the middle. Toggle = selected for a move (lifted). Look lives in card_face.tscn.

signal ev_card_toggled(card: int, selected: bool)

@export var card: int = 44:
	set(value):
		card = value
		_refresh()
@export var lift_px: float = 18.0
@export var red: Color = Color("#c8322a")
@export var black: Color = Color("#212326")
@export var suit_textures: Array[Texture2D] = []
@export var rank_label: Label
@export var corner_suit: TextureRect
@export var center_suit: TextureRect
@export var body: Control
@export var selected_frame: Control


func _ready() -> void:
	toggled.connect(_on_toggled)
	_refresh()


func _refresh() -> void:
	if rank_label == null:
		return
	rank_label.text = Cards.label(Cards.rank_of(card))
	var color := red if Cards.is_red(card) else black
	rank_label.add_theme_color_override("font_color", color)
	if suit_textures.size() == 4:
		corner_suit.texture = suit_textures[Cards.suit_of(card)]
		center_suit.texture = suit_textures[Cards.suit_of(card)]
	corner_suit.self_modulate = color
	center_suit.self_modulate = color
	_apply_lift()


func set_selected(value: bool) -> void:
	set_pressed_no_signal(value)
	_apply_lift()


func _on_toggled(on: bool) -> void:
	_apply_lift()
	ev_card_toggled.emit(card, on)


func _apply_lift() -> void:
	if body != null:
		body.position.y = -lift_px if button_pressed else 0.0
	if selected_frame != null:
		selected_frame.visible = button_pressed
