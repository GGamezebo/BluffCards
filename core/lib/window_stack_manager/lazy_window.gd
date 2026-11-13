class_name LazyWindow
extends Control

## Stack window placeholder: the real window scene is instantiated on its first show, so a menu with
## many windows does not load and build all of them up front. `content` = that window (full-rect
## child); the stack's `on_window_enter` / `on_window_exit` reach it through here.
## Buttons inside it are wired via `ButtonWindowTransition` / `ButtonWindowBack` `lazy_window` + `lazy_button_path`.

signal ev_loaded(content: Control)

@export_file("*.tscn") var scene: String
## Content nodes hidden + disabled once loaded (e.g. the window's own sky, kept for isolated runs).
@export var hidden_content_nodes: Array[NodePath] = []
## > 0: background-load the scene that many seconds after ready (threaded builds only; else on first show).
@export var preload_delay_sec: float = 0.0

var content: Control = null
var _requested: bool = false


func _ready() -> void:
	if preload_delay_sec > 0.0 and OS.has_feature("threads"):
		get_tree().create_timer(preload_delay_sec).timeout.connect(_request_preload)


func load_content() -> Control:
	if content != null:
		return content
	var packed: PackedScene = (ResourceLoader.load_threaded_get(scene) if _requested else load(scene)) as PackedScene
	_requested = false
	if packed == null:
		push_error("[LazyWindow] cannot load %s" % scene)
		return null
	content = packed.instantiate() as Control
	# Ready while hidden, then shown — same order as a window that was always in the tree.
	content.hide()
	add_child(content)
	for path in hidden_content_nodes:
		var item := content.get_node_or_null(path) as CanvasItem
		if item != null:
			item.visible = false
			item.process_mode = Node.PROCESS_MODE_DISABLED
	content.show()
	ev_loaded.emit(content)
	return content


func on_window_enter() -> void:
	if load_content() != null and content.has_method("on_window_enter"):
		content.on_window_enter()


func on_window_exit() -> void:
	if content != null and content.has_method("on_window_exit"):
		content.on_window_exit()


func _request_preload() -> void:
	if content == null and not _requested and ResourceLoader.load_threaded_request(scene) == OK:
		_requested = true
