class_name AndroidContext
extends PlatformContext

## Android: Google Play / RuStore services (sign-in, share sheet, pushes) come with the store build.


func _enter() -> void:
	if platform_caps != null:
		platform_caps.platform = "android"
		platform_caps.share_sheet = false
