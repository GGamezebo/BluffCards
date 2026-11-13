class_name PlatformRouterContext
extends PlatformContext

## App/Platform: the only place that maps OS features to a platform branch.


func _enter() -> void:
	if OS.has_feature("web"):
		open_child("ev.open_web")
	elif OS.has_feature("android"):
		open_child("ev.open_android")
	elif OS.has_feature("pc"):
		open_child("ev.open_desktop")
