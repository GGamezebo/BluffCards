class_name DesktopContext
extends PlatformContext

## Desktop (Steam later): landscape window, mouse and keyboard.


func _enter() -> void:
	if platform_caps != null:
		platform_caps.platform = "desktop"
		platform_caps.share_sheet = false
