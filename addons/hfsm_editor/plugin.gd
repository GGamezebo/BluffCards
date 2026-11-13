@tool
extends EditorPlugin

const DockScript := preload("res://addons/hfsm_editor/hfsm_editor_dock.gd")

var _dock: Control


func _enter_tree() -> void:
	_dock = DockScript.new()
	_dock.name = "HFSMEditorDock"
	add_control_to_bottom_panel(_dock, "HFSM")


func _exit_tree() -> void:
	if _dock:
		remove_control_from_bottom_panel(_dock)
		_dock.queue_free()
		_dock = null
