class_name LeadersWindow
extends Control

## «Лидерборд»: players by chips, whole table or friends only.

signal ev_scope(scope: String)

@export var tabs: Segmented
@export var list: VBoxContainer
@export var me_line: ListLine
@export var row_scene: PackedScene
@export var empty_label: Label

const SCOPES: Array[String] = ["all", "friends"]


func _ready() -> void:
	tabs.ev_selected.connect(func(index: int) -> void: ev_scope.emit(SCOPES[index]))


func on_window_enter() -> void:
	ev_scope.emit(SCOPES[tabs.selected])


func setup(data: Dictionary, balance: int) -> void:
	for child in list.get_children():
		child.queue_free()
	var rows: Array = data.get("rows", [])
	for row in rows:
		var line := row_scene.instantiate() as ListLine
		list.add_child(line)
		var mark := " (вы)" if bool(row.get("me", false)) else ""
		line.setup("%d. %s%s" % [int(row.get("rank", 0)), str(row.get("name", "?")), mark], Cards.chips(int(row.get("score", 0))))
	empty_label.visible = rows.is_empty()
	var mine: Variant = data.get("me", null)
	var place := "%d место" % int(mine["rank"]) if mine is Dictionary else "—"
	me_line.setup("Вы · %s" % place, "%s фишек" % Cards.chips(balance))
