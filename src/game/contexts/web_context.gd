class_name WEBContext
extends PlatformContext

## Web build (Яндекс Игры / VK Play / Telegram Mini App later): their SDKs live only here.


func _enter() -> void:
	if platform_caps != null:
		platform_caps.platform = "web"
		platform_caps.share_sheet = false
