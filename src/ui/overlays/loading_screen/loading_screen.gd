extends CanvasLayer

## HFSM loading overlay (`HfsmSceneRegistry` contract): `update_progress(0..1)`, `fade_out()`.

@export var root: Control
@export var progress_bar: ProgressBar
@export var fade_sec: float = 0.25


func update_progress(value: float) -> void:
	progress_bar.value = clampf(value, 0.0, 1.0) * 100.0


func fade_out() -> void:
	var tween := create_tween()
	tween.tween_property(root, "modulate:a", 0.0, fade_sec)
	tween.tween_callback(queue_free)
