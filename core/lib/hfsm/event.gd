class_name HfsmEvent
extends RefCounted

var name: String
var data: Dictionary


func _init(p_name: String = "", p_data: Dictionary = {}) -> void:
	name = p_name
	data = p_data.duplicate() if p_data else {}
