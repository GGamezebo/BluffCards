@tool
class_name Avatar
extends Control

## Round player face: ids 0..2 = portraits from the club illustration, others = a tone + initial.
## Look lives in avatar.tscn (mask, portrait, ring); the script only picks region / tone / letter.

@export var avatar_id: int = 0:
	set(value):
		avatar_id = value
		_refresh()
@export var display_name: String = "Ира":
	set(value):
		display_name = value
		_refresh()
## Gold ring: the player whose turn it is.
@export var ring: bool = false:
	set(value):
		ring = value
		_refresh()
@export var dimmed: bool = false:
	set(value):
		dimmed = value
		_refresh()
@export var portrait_regions: Array[Rect2] = [Rect2(143, 200, 300, 300), Rect2(551, 150, 300, 300), Rect2(1003, 190, 300, 300)]
@export var tones: Array[Color] = [Color("#ffcc6d"), Color("#c3ddab"), Color("#ffb5c7"), Color("#d0bded"), Color("#9fd3f0"), Color("#ffd9a8"), Color("#b8dcd0")]
@export var mask: Panel
@export var portrait: TextureRect
@export var letter: Label
@export var ring_panel: Panel


func _ready() -> void:
	_refresh()


func setup(id: int, player_name: String) -> void:
	avatar_id = id
	display_name = player_name


func _refresh() -> void:
	if portrait == null or letter == null or mask == null:
		return
	var has_portrait := avatar_id >= 0 and avatar_id < portrait_regions.size()
	portrait.visible = has_portrait
	letter.visible = not has_portrait
	if has_portrait:
		var atlas := portrait.texture as AtlasTexture
		if atlas != null:
			atlas = atlas.duplicate() as AtlasTexture
			atlas.region = portrait_regions[avatar_id]
			portrait.texture = atlas
	else:
		letter.text = display_name.left(1).to_upper() if not display_name.is_empty() else "?"
		mask.self_modulate = tones[absi(avatar_id) % tones.size()]
	if has_portrait:
		mask.self_modulate = Color.WHITE
	ring_panel.visible = ring
	modulate.a = 0.45 if dimmed else 1.0
