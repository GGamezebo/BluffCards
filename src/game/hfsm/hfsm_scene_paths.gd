class_name HfsmScenePaths
extends Node

## Scene id (HFSM json `scene.id`) → scene path. Every export in "Scenes" is one id.

@export_category("Scenes")
@export_file("*.tscn") var app_root: String = "res://src/game/scenes/app_root/root.tscn"
@export_file("*.tscn") var online: String = "res://src/game/scenes/online/online.tscn"
@export_file("*.tscn") var match_session: String = "res://src/game/scenes/match_session/match_session.tscn"
@export_file("*.tscn") var lobby: String = "res://src/game/scenes/lobby/lobby.tscn"
@export_file("*.tscn") var search: String = "res://src/game/scenes/search/search.tscn"
@export_file("*.tscn") var room: String = "res://src/game/scenes/room/room.tscn"
@export_file("*.tscn") var table: String = "res://src/game/scenes/table/table.tscn"
@export_file("*.tscn") var result: String = "res://src/game/scenes/result/result.tscn"

var SCENES: Dictionary = {}


func _ready() -> void:
	SCENES = _get_exports_in_category("Scenes")


func _get_exports_in_category(category_name: String) -> Dictionary:
	var result := {}
	var in_category := false
	for prop in get_property_list():
		var usage: int = prop.usage
		if usage & PROPERTY_USAGE_CATEGORY:
			in_category = (str(prop.name) == category_name)
			continue
		if in_category and (usage & PROPERTY_USAGE_EDITOR) and (usage & PROPERTY_USAGE_SCRIPT_VARIABLE):
			result[prop.name] = get(prop.name)
	return result
