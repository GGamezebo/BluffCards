class_name TestCase
extends RefCounted

## Base for headless tests. Methods named `test_*` are run by `tests/run_all.gd`.

## Set by the runner so tests can build scenes.
var tree: SceneTree
var failures: Array[String] = []
var checks: int = 0
var _current: String = ""


func begin(test_name: String) -> void:
	_current = test_name


func expect(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append("%s: %s" % [_current, message])


func expect_eq(actual: Variant, expected: Variant, message: String) -> void:
	checks += 1
	if actual != expected:
		failures.append("%s: %s (got %s, expected %s)" % [_current, message, str(actual), str(expected)])
