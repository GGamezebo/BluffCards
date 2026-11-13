class_name LogSettings
extends Resource

## Minimum severity per log channel. Build default: editor → `editor_level`,
## exported debug build → `debug_level`, release build → `release_level`.

enum Level { DEBUG, INFO, WARN, ERROR, OFF }

@export var editor_level: Level = Level.DEBUG
@export var debug_level: Level = Level.INFO
@export var release_level: Level = Level.WARN
## channel name (String) → Level; overrides the build default for that channel.
@export var channel_levels: Dictionary = {}


func min_level(channel: String) -> int:
	if channel_levels.has(channel):
		return int(channel_levels[channel])
	if OS.has_feature("editor"):
		return editor_level
	if OS.is_debug_build():
		return debug_level
	return release_level
