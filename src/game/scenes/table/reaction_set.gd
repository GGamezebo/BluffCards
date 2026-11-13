class_name ReactionSet
extends Resource

## Free reactions of the first release (concept/reactions.md): 8 phrases, 8 emotions, 5 throws.
## Ids match the server ranges (MatchOps).

@export var phrases: PackedStringArray = []
@export var emoji: Array[Texture2D] = []
@export var throws: Array[Texture2D] = []
## Client-side anti-spam mirror of the server rule (the server decides).
@export var gap_sec: float = 3.0
@export var window_sec: float = 10.0
@export var max_in_window: int = 3


func icon(kind: String, id: int) -> Texture2D:
	if kind == "emoji" and id >= 0 and id < emoji.size():
		return emoji[id]
	if kind == "throw" and id >= 0 and id < throws.size():
		return throws[id]
	return null


func text(kind: String, id: int) -> String:
	return phrases[id] if kind == "phrase" and id >= 0 and id < phrases.size() else ""
