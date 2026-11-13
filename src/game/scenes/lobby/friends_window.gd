class_name FriendsWindow
extends Control

## «Друзья и компании»: pick several friends and call them to a new room, open a company's room
## by its permanent code, add recent opponents as friends. Friends play only with friends and bots.

signal ev_refresh
signal ev_create_room(invite_ids: Array)
signal ev_open_company(company_id: String)
signal ev_new_company(member_ids: Array)
signal ev_add_friend(user_id: String)

@export var tabs: Segmented
@export var list: VBoxContainer
@export var tile_scene: PackedScene
@export var empty_label: Label
@export var main_button: Button
@export var new_company_button: Button

var _data: Dictionary = {}
var _invited: Array[String] = []
var _tab: int = 0


func _ready() -> void:
	tabs.ev_selected.connect(func(index: int) -> void:
		_tab = index
		_render()
	)
	main_button.pressed.connect(func() -> void: ev_create_room.emit(_invited.duplicate()))
	new_company_button.pressed.connect(func() -> void: ev_new_company.emit(_invited.duplicate()))


func on_window_enter() -> void:
	ev_refresh.emit()


func setup(data: Dictionary) -> void:
	_data = data
	_render()


func _render() -> void:
	for child in list.get_children():
		child.queue_free()
	var count := 0
	match _tab:
		0:
			for f in _data.get("friends", []):
				count += 1
				_add_friend_tile(f)
		1:
			for c in _data.get("companies", []):
				count += 1
				var tile := _tile()
				tile.setup(str(c["id"]), str(c["name"]), "Постоянная ссылка · %s · %d чел." % [c["code"], (c.get("members", []) as Array).size() + 1], "→")
				tile.ev_tile_pressed.connect(func(key: String) -> void: ev_open_company.emit(key))
		2:
			for r in _data.get("recent", []):
				count += 1
				var tile := _tile()
				tile.setup(str(r["id"]), str(r["name"]), "Недавний соперник · добавить в друзья", "+")
				tile.ev_tile_pressed.connect(func(key: String) -> void: ev_add_friend.emit(key))
	empty_label.visible = count == 0
	empty_label.text = ["Друзей пока нет. Добавь недавних соперников или позови по ссылке.",
		"Компаний пока нет. Отметь друзей и создай компанию.",
		"Здесь появятся соперники по прошлым столам."][_tab]
	new_company_button.visible = _tab == 1
	main_button.text = "Позвать выбранных · %d" % _invited.size() if not _invited.is_empty() else "Создать комнату"


func _add_friend_tile(f: Dictionary) -> void:
	var id := str(f["id"])
	var state := int(f.get("state", 0))
	var tile := _tile()
	match state:
		0:
			var picked := _invited.has(id)
			var online := "В сети" if bool(f.get("online", false)) else "Не в сети"
			tile.setup(id, str(f["name"]), "%s · %s" % [online, "выбрано для приглашения" if picked else "добавить в приглашение"], "✓" if picked else "+", picked)
			tile.ev_tile_pressed.connect(_toggle_invite)
		1:
			tile.setup(id, str(f["name"]), "Заявка отправлена", "…")
			tile.disabled = true
		_:
			tile.setup(id, str(f["name"]), "Хочет дружить · принять", "+")
			tile.ev_tile_pressed.connect(func(key: String) -> void: ev_add_friend.emit(key))


func _toggle_invite(id: String) -> void:
	if _invited.has(id):
		_invited.erase(id)
	else:
		_invited.append(id)
	_render()


func _tile() -> Tile:
	var tile := tile_scene.instantiate() as Tile
	list.add_child(tile)
	return tile
