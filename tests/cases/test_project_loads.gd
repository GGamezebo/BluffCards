extends TestCase

## Every script parses and every scene instantiates; HFSM json is valid and its scene ids exist.

const ROOTS: Array[String] = ["res://src", "res://core"]


func test_all_scripts_and_scenes_load() -> void:
	for path in _files(".gd"):
		var script := load(path) as Script
		expect(script != null and script.can_instantiate(), "script parses: %s" % path)
	for path in _files(".tscn"):
		var packed := load(path) as PackedScene
		expect(packed != null, "scene loads: %s" % path)
		if packed == null:
			continue
		var node := packed.instantiate()
		expect(node != null, "scene instantiates: %s" % path)
		if node != null:
			node.free()


func test_hfsm_config_matches_scene_paths() -> void:
	var result := HfsmLoader.try_load_tree("res://src/game/hfsm/app_hfsm.json")
	expect_eq(result.error, "", "hfsm json parses")
	var paths := HfsmScenePaths.new()
	tree.root.add_child(paths)
	for state in (result.tree as HfsmStateTree).map_states.values():
		var node := state as HfsmStateNode
		if node.has_scene():
			var id := str(node.scene.id)
			expect(paths.SCENES.has(id), "scene id %s has a path" % id)
			expect(ResourceLoader.exists(str(paths.SCENES.get(id, ""))), "scene file for %s exists" % id)
	paths.free()


func _files(ext: String) -> Array[String]:
	var out: Array[String] = []
	for root in ROOTS:
		_walk(root, ext, out)
	return out


func _walk(dir_path: String, ext: String, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	for file in dir.get_files():
		if file.ends_with(ext):
			out.append(dir_path.path_join(file))
	for sub in dir.get_directories():
		_walk(dir_path.path_join(sub), ext, out)
