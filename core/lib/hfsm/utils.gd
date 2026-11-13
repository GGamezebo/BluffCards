class_name HfsmUtils
extends RefCounted


static func match_event(event: String, pattern: String) -> bool:
	if "*" not in pattern:
		return event == pattern
	var prefix := pattern.substr(0, pattern.length() - 1)
	return event.begins_with(prefix)


static func validate_event_pattern(pattern: String, state_name: String, field_name: String) -> String:
	if pattern.is_empty():
		return "Empty event pattern in state '%s' field '%s'" % [state_name, field_name]
	if "*" in pattern and not pattern.ends_with("*"):
		return (
			"Wildcard '*' allowed only at end of pattern '%s' in state '%s' field '%s'"
			% [pattern, state_name, field_name]
		)
	return ""
