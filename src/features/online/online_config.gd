class_name OnlineConfig
extends Resource

## Where the Nakama server is. Defaults below → `res://online_local.tres` (an OnlineConfig with the
## developer's own server: git-ignored, exported with every build like any resource) →
## env vars BLUFF_NAKAMA_HOST / _PORT / _KEY / _SSL (tests, CI).
## The server key must match NAKAMA_SERVER_KEY in server/.env.

const LOCAL_DEFAULTS_PATH := "res://online_local.tres"

@export var host: String = "127.0.0.1"
@export var port: int = 7350
@export var server_key: String = "bluffcards_dev_key"
@export var use_ssl: bool = false
@export var timeout_sec: int = 6
## Seconds between reconnect attempts when the server is unreachable.
@export var retry_sec: float = 3.0
## Extra suffix for the device id: several game copies on one PC (`-- --profile=2`).
@export var profile: String = ""


func address() -> String:
	return "%s:%d" % [host, port]


func scheme() -> String:
	return "https" if use_ssl else "http"


func load_overrides() -> void:
	if ResourceLoader.exists(LOCAL_DEFAULTS_PATH):
		var local := load(LOCAL_DEFAULTS_PATH) as OnlineConfig
		if local != null:
			host = local.host
			port = local.port
			server_key = local.server_key
			use_ssl = local.use_ssl
	if not OS.get_environment("BLUFF_NAKAMA_HOST").is_empty():
		host = OS.get_environment("BLUFF_NAKAMA_HOST")
	if not OS.get_environment("BLUFF_NAKAMA_PORT").is_empty():
		port = int(OS.get_environment("BLUFF_NAKAMA_PORT"))
	if not OS.get_environment("BLUFF_NAKAMA_KEY").is_empty():
		server_key = OS.get_environment("BLUFF_NAKAMA_KEY")
	if OS.get_environment("BLUFF_NAKAMA_SSL") == "1":
		use_ssl = true
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--profile="):
			profile = arg.trim_prefix("--profile=")
