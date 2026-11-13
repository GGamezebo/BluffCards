extends SceneTree

## Headless test runner:
##   godot --headless --path . --script res://tests/run_all.gd
## Exit code is non-zero when any test fails.

const CASES_DIR := "res://tests/cases"


func _initialize() -> void:
	_run()


func _run() -> void:
	# Let the SceneTree finish starting so scenes added to root are inside the tree.
	await process_frame
	var total_checks := 0
	var failures: Array[String] = []

	var files := DirAccess.get_files_at(CASES_DIR)
	files.sort()
	for file_name in files:
		if not file_name.begins_with("test_") or not file_name.ends_with(".gd"):
			continue
		var script := load("%s/%s" % [CASES_DIR, file_name]) as GDScript
		if script == null or not script.can_instantiate():
			failures.append("%s: failed to load" % file_name)
			continue
		var case: TestCase = script.new()
		case.tree = self
		for method in script.get_script_method_list():
			var method_name: String = method["name"]
			if not method_name.begins_with("test_"):
				continue
			case.begin("%s::%s" % [file_name, method_name])
			await case.call(method_name)
		total_checks += case.checks
		failures.append_array(case.failures)
		print("[tests] %s — %d checks" % [file_name, case.checks])

	for f in failures:
		printerr("[FAIL] ", f)
	print("[tests] %d checks, %d failures" % [total_checks, failures.size()])
	quit(1 if failures.size() > 0 else 0)
