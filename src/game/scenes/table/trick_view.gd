class_name TrickView
extends VBoxContainer

## Middle of the felt: who claims what, the last packet face down (spread and pickable during
## «Не верю»), the revealed card with the verdict, the pile counter.

signal ev_pick(index: int)

@export var subtitle_label: Label
@export var claim_label: Label
@export var verdict: PanelContainer
@export var verdict_icon: TextureRect
@export var verdict_label: Label
@export var backs: HFlowContainer
@export var reveal_slot: Control
@export var reveal_card: CardFace
@export var pile_label: Label
@export var back_scene: PackedScene
@export var truth_icon: Texture2D
@export var lie_icon: Texture2D
@export var truth_color: Color = Color("#2f9e55")
@export var lie_color: Color = Color("#d8432f")
## Backs shown for a packet while nobody checks it.
@export var shown_backs: int = 5
## Packets wider than this get numbered backs while picking.
@export var numbered_from: int = 8
@export var flip_sec: float = 0.7

var _reveal_key: String = ""


func render(view: TableView, checking: bool) -> void:
	var deal := view.deal()
	var phase := str(deal.get("phase", ""))
	var claim := int(deal.get("claim", -1))
	var packet := int(deal.get("packet", 0))
	var last := int(deal.get("last", -1))
	var reveal: Variant = deal.get("reveal", null)
	verdict.visible = false
	reveal_slot.visible = false
	backs.visible = true
	if phase == "reveal" and reveal is Dictionary:
		var truth := bool(reveal.get("truth", false))
		subtitle_label.text = "Заявка · %s" % Cards.plural(int(reveal.get("rank", 0)))
		var checker := int(reveal.get("checker", -1))
		claim_label.text = "Вы проверяете" if checker == view.me() else view.seat_name(checker) + " проверяет"
		_show_reveal(reveal, truth)
		pile_label.text = "Стопку забирает %s · %s" % [view.seat_name(int(reveal.get("loser", -1))), Cards.cards_word(int(reveal.get("count", 0)))]
		_fill_backs(0, false)
		return
	_reveal_key = ""
	if phase == "open" or packet == 0:
		subtitle_label.text = ""
		claim_label.text = "Новый круг" if phase == "open" else ""
		_fill_backs(0, false)
	else:
		subtitle_label.text = "%s объявляет" % view.seat_name(last)
		claim_label.text = Cards.claim_text(claim, packet)
		_fill_backs(packet if checking else mini(packet, shown_backs), checking)
	var pile := int(deal.get("pile", 0))
	pile_label.text = "В стопке %d" % pile if pile > 0 else "Стопка пуста"


func center_global() -> Vector2:
	return backs.global_position + backs.size * 0.5


func _fill_backs(count: int, pickable: bool) -> void:
	for child in backs.get_children():
		child.queue_free()
	for i in count:
		var back := back_scene.instantiate() as CardBack
		backs.add_child(back)
		back.setup(i, pickable, pickable and count >= numbered_from)
		if pickable:
			back.ev_picked.connect(func(index: int) -> void: ev_pick.emit(index))


func _show_reveal(reveal: Dictionary, truth: bool) -> void:
	reveal_slot.visible = true
	reveal_card.card = int(reveal.get("card", 0))
	verdict.visible = true
	verdict_icon.texture = truth_icon if truth else lie_icon
	verdict_label.text = "Правда" if truth else "Поймали на блефе"
	verdict.self_modulate = truth_color if truth else lie_color
	var key := "%d:%d" % [int(reveal.get("card", 0)), int(reveal.get("count", 0))]
	if key == _reveal_key:
		return
	_reveal_key = key
	# Slow flip: the card turns over, then the verdict appears.
	reveal_card.pivot_offset = reveal_card.size * 0.5
	reveal_card.scale = Vector2(0.05, 1.0)
	verdict.modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(reveal_card, "scale", Vector2.ONE, flip_sec).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(verdict, "modulate:a", 1.0, 0.2)
