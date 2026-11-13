@tool
class_name CenterColumn
extends Container

## Phone-like column: children fill the height and at most `max_width`, centred horizontally.
## Lets portrait screens stay readable in a landscape window (PC / web).

@export var max_width: float = 760.0:
	set(value):
		max_width = value
		queue_sort()


func _notification(what: int) -> void:
	if what != NOTIFICATION_SORT_CHILDREN:
		return
	var width := minf(size.x, max_width)
	var rect := Rect2((size.x - width) * 0.5, 0.0, width, size.y)
	for child in get_children():
		var control := child as Control
		if control != null and control.visible and not control.top_level:
			fit_child_in_rect(control, rect)


func _get_minimum_size() -> Vector2:
	var result := Vector2.ZERO
	for child in get_children():
		var control := child as Control
		if control != null and control.visible:
			result = result.max(control.get_combined_minimum_size())
	return result
