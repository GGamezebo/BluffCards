class_name LogChannel
extends RefCounted

## One greppable line per event: `[<ms>] <SEV> <channel> <event> key=value ...`.
## WARN / ERROR go through `push_warning` / `push_error` (editor debugger + log file).
## Owners create a channel from an exported `LogSettings` and pass it to their components.

const SEV_NAMES: Array[String] = ["DEBUG", "INFO", "WARN", "ERROR"]

var channel: String
var _min_level: int


func _init(p_channel: String, settings: LogSettings = null) -> void:
	channel = p_channel
	_min_level = settings.min_level(p_channel) if settings != null else LogSettings.Level.INFO


func is_enabled(level: int) -> bool:
	return level >= _min_level


func debug(event: String, kv: Dictionary = {}) -> void:
	_write(LogSettings.Level.DEBUG, event, kv)


func info(event: String, kv: Dictionary = {}) -> void:
	_write(LogSettings.Level.INFO, event, kv)


func warn(event: String, kv: Dictionary = {}) -> void:
	_write(LogSettings.Level.WARN, event, kv)


func error(event: String, kv: Dictionary = {}) -> void:
	_write(LogSettings.Level.ERROR, event, kv)


func format_line(level: int, event: String, kv: Dictionary) -> String:
	var line := "[%d] %s %s %s" % [Time.get_ticks_msec(), SEV_NAMES[level], channel, event]
	for key in kv:
		line += " %s=%s" % [key, _format_value(kv[key])]
	return line


func _write(level: int, event: String, kv: Dictionary) -> void:
	if level < _min_level:
		return
	var line := format_line(level, event, kv)
	match level:
		LogSettings.Level.WARN:
			push_warning(line)
		LogSettings.Level.ERROR:
			push_error(line)
		_:
			print(line)


static func _format_value(value: Variant) -> String:
	if value is float:
		return "%.2f" % value
	var text := str(value)
	if text.contains(" "):
		return "\"%s\"" % text
	return text
