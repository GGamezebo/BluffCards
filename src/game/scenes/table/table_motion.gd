class_name TableMotion
extends Control

## Flight layer over the table (concept/art-direction «При раздаче и доборе»): a token flies from
## one place to another along an arc — packets to the pile, the pile to its new owner, the deck to
## the players, a four to its rank, the turn marker to the next player. Await `fly`.

@export var token_scene: PackedScene
@export var card_sec: float = 0.38
@export var turn_sec: float = 0.28
@export var arc_px: float = 34.0
## Colors per token kind.
@export var colors: Dictionary = {
	"play": Color("#f58142"), "collect": Color("#f58142"), "draw": Color("#f58142"),
	"four": Color("#fff3da"), "reveal": Color("#fff3da"), "turn": Color("#ffd675"),
}


func fly(from: Vector2, to: Vector2, text: String, kind: String) -> void:
	var token := token_scene.instantiate() as Control
	add_child(token)
	var label := token.get_node("Label") as Label
	label.text = text
	token.self_modulate = colors.get(kind, Color.WHITE)
	token.reset_size()
	var half := token.size * 0.5
	var start := from - global_position - half
	var finish := to - global_position - half
	token.position = start
	token.rotation = -0.2
	var seconds := turn_sec if kind == "turn" else card_sec
	var tween := create_tween()
	tween.tween_method(func(t: float) -> void:
		var p := start.lerp(finish, t)
		p.y -= sin(t * PI) * arc_px
		token.position = p
		token.rotation = lerpf(-0.2, 0.0, t)
	, 0.0, 1.0, seconds).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await tween.finished
	token.queue_free()


func shake(node: Control, strength: float = 10.0) -> void:
	var origin := node.position
	var tween := create_tween()
	for i in 6:
		tween.tween_property(node, "position", origin + Vector2(randf_range(-strength, strength), randf_range(-strength * 0.4, strength * 0.4)), 0.04)
	tween.tween_property(node, "position", origin, 0.05)
