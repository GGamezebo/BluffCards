@tool
extends Control

const DocumentScript := preload("res://addons/hfsm_editor/hfsm_editor_document.gd")

var _doc: HfsmEditorDocument
var _selected_path: PackedStringArray = PackedStringArray()
var _updating_ui: bool = false

var _path_label: Label
var _status_label: Label
var _tree: Tree
var _name_edit: LineEdit
var _enter_edit: TextEdit
var _leave_edit: TextEdit
var _consume_edit: TextEdit
var _bindings_list: VBoxContainer
var _scene_id_edit: LineEdit
var _scene_on_event_edit: LineEdit
var _scene_loading_screen: CheckBox
var _scene_async_loading: CheckBox
var _open_dialog: FileDialog
var _save_dialog: FileDialog


func _ready() -> void:
	name = "HFSMEditor"
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	custom_minimum_size = Vector2(0, 280)
	_doc = DocumentScript.new()
	_doc.changed.connect(_on_doc_changed)
	_build_ui()
	_doc.new_document("App")
	_rebuild_tree()
	_select_path(PackedStringArray([_doc.root_name]))


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 6)
	add_child(root)

	var toolbar := HBoxContainer.new()
	toolbar.add_theme_constant_override("separation", 6)
	root.add_child(toolbar)

	_add_tool_button(toolbar, "New", _on_new_pressed)
	_add_tool_button(toolbar, "Open...", _on_open_pressed)
	_add_tool_button(toolbar, "Save", _on_save_pressed)
	_add_tool_button(toolbar, "Save As...", _on_save_as_pressed)
	_add_tool_button(toolbar, "Validate", _on_validate_pressed)

	_path_label = Label.new()
	_path_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_path_label.text = "(unsaved)"
	toolbar.add_child(_path_label)

	var body := HSplitContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)

	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(240, 0)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(left)

	var tree_tools := HBoxContainer.new()
	left.add_child(tree_tools)
	_add_tool_button(tree_tools, "Add Child", _on_add_child_pressed)
	_add_tool_button(tree_tools, "Delete", _on_delete_pressed)

	_tree = Tree.new()
	_tree.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tree.hide_root = false
	_tree.item_selected.connect(_on_tree_item_selected)
	left.add_child(_tree)

	var right := ScrollContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(right)

	var inspector := VBoxContainer.new()
	inspector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inspector.add_theme_constant_override("separation", 8)
	right.add_child(inspector)

	inspector.add_child(_section_label("State name"))
	_name_edit = LineEdit.new()
	_name_edit.text_submitted.connect(_on_name_submitted)
	_name_edit.focus_exited.connect(_apply_name_from_edit)
	inspector.add_child(_name_edit)

	inspector.add_child(_section_label("enter (one event per line; empty = omit → sys.enter)"))
	_enter_edit = _make_events_edit()
	inspector.add_child(_enter_edit)

	inspector.add_child(_section_label("leave"))
	_leave_edit = _make_events_edit()
	inspector.add_child(_leave_edit)

	inspector.add_child(_section_label("consume"))
	_consume_edit = _make_events_edit()
	inspector.add_child(_consume_edit)

	inspector.add_child(_section_label("scene"))
	var scene_id_row := HBoxContainer.new()
	scene_id_row.add_theme_constant_override("separation", 4)
	inspector.add_child(scene_id_row)
	var scene_id_label := Label.new()
	scene_id_label.text = "id"
	scene_id_row.add_child(scene_id_label)
	_scene_id_edit = LineEdit.new()
	_scene_id_edit.placeholder_text = "scene id (leave blank for none)"
	_scene_id_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scene_id_edit.focus_exited.connect(_apply_inspector)
	scene_id_row.add_child(_scene_id_edit)

	var scene_on_event_row := HBoxContainer.new()
	scene_on_event_row.add_theme_constant_override("separation", 4)
	inspector.add_child(scene_on_event_row)
	var scene_on_event_label := Label.new()
	scene_on_event_label.text = "on_event"
	scene_on_event_row.add_child(scene_on_event_label)
	_scene_on_event_edit = LineEdit.new()
	_scene_on_event_edit.placeholder_text = "HFSM event after initialize"
	_scene_on_event_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scene_on_event_edit.focus_exited.connect(_apply_inspector)
	scene_on_event_row.add_child(_scene_on_event_edit)

	_scene_loading_screen = CheckBox.new()
	_scene_loading_screen.text = "loading_screen"
	_scene_loading_screen.toggled.connect(func(_v: bool) -> void: _apply_inspector())
	inspector.add_child(_scene_loading_screen)

	_scene_async_loading = CheckBox.new()
	_scene_async_loading.text = "async_loading (default true)"
	_scene_async_loading.button_pressed = true
	_scene_async_loading.toggled.connect(func(_v: bool) -> void: _apply_inspector())
	inspector.add_child(_scene_async_loading)

	var bind_header := HBoxContainer.new()
	inspector.add_child(bind_header)
	var bind_label := _section_label("bindings (slot → entity NAME)")
	bind_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bind_header.add_child(bind_label)
	_add_tool_button(bind_header, "Add Binding", _on_add_binding_pressed)

	_bindings_list = VBoxContainer.new()
	_bindings_list.add_theme_constant_override("separation", 4)
	inspector.add_child(_bindings_list)

	var apply_row := HBoxContainer.new()
	inspector.add_child(apply_row)
	_add_tool_button(apply_row, "Apply State Edits", _apply_inspector)

	_status_label = Label.new()
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status_label)

	_open_dialog = FileDialog.new()
	_open_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_open_dialog.access = FileDialog.ACCESS_RESOURCES
	_open_dialog.add_filter("*.json", "HFSM JSON")
	_open_dialog.title = "Open HFSM Config"
	_open_dialog.file_selected.connect(_on_open_file_selected)
	add_child(_open_dialog)

	_save_dialog = FileDialog.new()
	_save_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_save_dialog.access = FileDialog.ACCESS_RESOURCES
	_save_dialog.add_filter("*.json", "HFSM JSON")
	_save_dialog.title = "Save HFSM Config"
	_save_dialog.file_selected.connect(_on_save_file_selected)
	add_child(_save_dialog)


func _add_tool_button(parent: Node, text: String, cb: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.pressed.connect(cb)
	parent.add_child(btn)
	return btn


func _section_label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	return label


func _make_events_edit() -> TextEdit:
	var edit := TextEdit.new()
	edit.custom_minimum_size = Vector2(0, 72)
	edit.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	edit.focus_exited.connect(_apply_inspector)
	return edit


func _set_status(text: String, is_error: bool = false) -> void:
	_status_label.text = text
	_status_label.modulate = Color(1, 0.5, 0.5) if is_error else Color(0.7, 1, 0.7)


func _on_doc_changed() -> void:
	_refresh_path_label()


func _refresh_path_label() -> void:
	var mark := "*" if _doc.dirty else ""
	if _doc.file_path.is_empty():
		_path_label.text = "(unsaved)%s" % mark
	else:
		_path_label.text = "%s%s" % [_doc.file_path, mark]


func _rebuild_tree(prefer_path: PackedStringArray = PackedStringArray()) -> void:
	_tree.clear()
	var root_item := _tree.create_item()
	root_item.set_text(0, _doc.root_name)
	root_item.set_metadata(0, PackedStringArray([_doc.root_name]))
	_fill_tree_children(root_item, _doc.root_data, PackedStringArray([_doc.root_name]))
	root_item.set_collapsed(false)
	var path := prefer_path if not prefer_path.is_empty() else _selected_path
	if path.is_empty():
		path = PackedStringArray([_doc.root_name])
	_select_path(path)


func _fill_tree_children(parent_item: TreeItem, node: Dictionary, path: PackedStringArray) -> void:
	var states: Dictionary = node.get("states", {})
	var keys: Array = states.keys()
	keys.sort()
	for child_name in keys:
		var child_path := path.duplicate()
		child_path.append(str(child_name))
		var item := _tree.create_item(parent_item)
		item.set_text(0, str(child_name))
		item.set_metadata(0, child_path)
		var child = states[child_name]
		if child is Dictionary:
			_fill_tree_children(item, child, child_path)
			item.set_collapsed(false)


func _select_path(path: PackedStringArray) -> void:
	_selected_path = path
	var item := _find_item(_tree.get_root(), path)
	if item:
		item.select(0)
		_tree.scroll_to_item(item)
	_load_inspector()


func _find_item(item: TreeItem, path: PackedStringArray) -> TreeItem:
	if item == null:
		return null
	var meta = item.get_metadata(0)
	if meta is PackedStringArray and meta == path:
		return item
	var child := item.get_first_child()
	while child:
		var found := _find_item(child, path)
		if found:
			return found
		child = child.get_next()
	return null


func _on_tree_item_selected() -> void:
	var item := _tree.get_selected()
	if item == null:
		return
	var meta = item.get_metadata(0)
	if meta is PackedStringArray:
		_selected_path = meta
		_load_inspector()


func _load_inspector() -> void:
	if _selected_path.is_empty():
		return
	_updating_ui = true
	_name_edit.text = _selected_path[_selected_path.size() - 1]
	_enter_edit.text = "\n".join(_doc.get_event_list(_selected_path, "enter"))
	_leave_edit.text = "\n".join(_doc.get_event_list(_selected_path, "leave"))
	_consume_edit.text = "\n".join(_doc.get_event_list(_selected_path, "consume"))
	var scene: Dictionary = _doc.get_scene(_selected_path)
	_scene_id_edit.text = str(scene.get("id", ""))
	_scene_on_event_edit.text = str(scene.get("on_event", ""))
	_scene_loading_screen.button_pressed = bool(scene.get("loading_screen", false))
	_scene_async_loading.button_pressed = bool(scene.get("async_loading", true))
	_rebuild_bindings_ui(_doc.get_bindings(_selected_path))
	_updating_ui = false


func _rebuild_bindings_ui(bindings: Dictionary) -> void:
	for child in _bindings_list.get_children():
		child.queue_free()
	var keys: Array = bindings.keys()
	keys.sort()
	for slot in keys:
		_add_binding_row(str(slot), str(bindings[slot]))
	if keys.is_empty():
		_add_binding_row("context", "")


func _add_binding_row(slot: String = "", entity: String = "") -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	var slot_edit := LineEdit.new()
	slot_edit.placeholder_text = "slot"
	slot_edit.text = slot
	slot_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(slot_edit)
	var entity_edit := LineEdit.new()
	entity_edit.placeholder_text = "EntityNAME"
	entity_edit.text = entity
	entity_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(entity_edit)
	var remove_btn := Button.new()
	remove_btn.text = "X"
	remove_btn.pressed.connect(func() -> void: row.queue_free())
	row.add_child(remove_btn)
	_bindings_list.add_child(row)


func _collect_bindings_from_ui() -> Dictionary:
	var bindings: Dictionary = {}
	for row in _bindings_list.get_children():
		if row.get_child_count() < 2:
			continue
		var slot_edit := row.get_child(0) as LineEdit
		var entity_edit := row.get_child(1) as LineEdit
		if slot_edit == null or entity_edit == null:
			continue
		var slot := slot_edit.text.strip_edges()
		var entity := entity_edit.text.strip_edges()
		if slot.is_empty() and entity.is_empty():
			continue
		bindings[slot] = entity
	return bindings


func _lines_from_edit(edit: TextEdit) -> PackedStringArray:
	var lines: PackedStringArray = PackedStringArray()
	for line in edit.text.split("\n"):
		lines.append(line)
	return lines


func _apply_inspector() -> void:
	if _updating_ui or _selected_path.is_empty():
		return
	_apply_name_from_edit()
	var path := _selected_path
	var err: String = _doc.set_event_list(path, "enter", _lines_from_edit(_enter_edit))
	if err != "":
		_set_status(err, true)
		return
	err = _doc.set_event_list(path, "leave", _lines_from_edit(_leave_edit))
	if err != "":
		_set_status(err, true)
		return
	err = _doc.set_event_list(path, "consume", _lines_from_edit(_consume_edit))
	if err != "":
		_set_status(err, true)
		return
	var scene_payload := {
		"id": _scene_id_edit.text.strip_edges(),
		"on_event": _scene_on_event_edit.text.strip_edges(),
		"loading_screen": _scene_loading_screen.button_pressed,
		"async_loading": _scene_async_loading.button_pressed,
	}
	err = _doc.set_scene(path, scene_payload)
	if err != "":
		_set_status(err, true)
		return
	err = _doc.set_bindings(path, _collect_bindings_from_ui())
	if err != "":
		_set_status(err, true)
		return
	_set_status("State applied")
	_refresh_path_label()


func _on_name_submitted(_text: String) -> void:
	_apply_name_from_edit()


func _apply_name_from_edit() -> void:
	if _updating_ui or _selected_path.is_empty():
		return
	var new_name := _name_edit.text.strip_edges()
	var old_name := _selected_path[_selected_path.size() - 1]
	if new_name == old_name:
		return
	var err: String = _doc.rename_state(_selected_path, new_name)
	if err != "":
		_set_status(err, true)
		_name_edit.text = old_name
		return
	var new_path := _selected_path.duplicate()
	new_path[new_path.size() - 1] = new_name
	_selected_path = new_path
	_rebuild_tree(new_path)
	_set_status("Renamed to '%s'" % new_name)


func _on_new_pressed() -> void:
	_doc.new_document("App")
	_rebuild_tree(PackedStringArray(["App"]))
	_set_status("New HFSM config")


func _on_open_pressed() -> void:
	_open_dialog.popup_centered_ratio(0.6)


func _on_open_file_selected(path: String) -> void:
	var err: String = _doc.load_from_path(path)
	if err != "":
		_set_status(err, true)
		return
	_rebuild_tree(PackedStringArray([_doc.root_name]))
	_set_status("Opened %s" % path)


func _on_save_pressed() -> void:
	_apply_inspector()
	if _doc.file_path.is_empty():
		_on_save_as_pressed()
		return
	var err: String = _doc.save_to_path()
	if err != "":
		_set_status(err, true)
		return
	_set_status("Saved %s" % _doc.file_path)


func _on_save_as_pressed() -> void:
	_apply_inspector()
	_save_dialog.current_file = "app_hfsm.json"
	_save_dialog.popup_centered_ratio(0.6)


func _on_save_file_selected(path: String) -> void:
	if not path.ends_with(".json"):
		path += ".json"
	var err: String = _doc.save_to_path(path)
	if err != "":
		_set_status(err, true)
		return
	_set_status("Saved %s" % path)


func _on_validate_pressed() -> void:
	_apply_inspector()
	var err: String = _doc.validate()
	if err != "":
		_set_status("Invalid: %s" % err, true)
	else:
		_set_status("Valid HFSM config")


func _on_add_child_pressed() -> void:
	if _selected_path.is_empty():
		return
	var base := "State"
	var name := base
	var i := 1
	var existing: PackedStringArray = _doc.collect_state_names()
	while name in existing:
		i += 1
		name = "%s%d" % [base, i]
	var err: String = _doc.add_child_state(_selected_path, name)
	if err != "":
		_set_status(err, true)
		return
	var child_path := _selected_path.duplicate()
	child_path.append(name)
	_rebuild_tree(child_path)
	_set_status("Added child '%s'" % name)


func _on_delete_pressed() -> void:
	if _selected_path.size() <= 1:
		_set_status("Cannot delete root", true)
		return
	var parent_path := _selected_path.slice(0, _selected_path.size() - 1)
	var err: String = _doc.delete_state(_selected_path)
	if err != "":
		_set_status(err, true)
		return
	_rebuild_tree(parent_path)
	_set_status("Deleted state")


func _on_add_binding_pressed() -> void:
	_add_binding_row("", "")
