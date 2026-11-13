class_name PlayerProfile
extends Resource

## The signed-in player as the server reported it (shared live `.tres`, written only by the
## App/Online context). Screens read it and listen to `changed`.

@export var signed_in: bool = false
@export var user_id: String = ""
@export var display_name: String = "Гость"
@export var balance: int = 1000
@export var avatar: int = 1
@export var visited: bool = false
@export var lesson_done: bool = false
@export var respect: int = 0
## "guest" | "Google" | "Apple" | "Telegram"
@export var provider: String = "guest"
## Table the player still sits at (rejoin after a restart), "" = none.
@export var active_match: String = ""
## Entry fees of the club of professionals.
@export var fees: Array[int] = [100, 500, 2500, 10000, 50000]


func apply(data: Dictionary) -> void:
	signed_in = true
	user_id = str(data.get("user_id", user_id))
	display_name = str(data.get("name", display_name))
	balance = int(data.get("balance", balance))
	avatar = int(data.get("avatar", avatar))
	visited = bool(data.get("visited", visited))
	lesson_done = bool(data.get("lesson_done", lesson_done))
	respect = int(data.get("respect", respect))
	provider = str(data.get("provider", provider))
	active_match = str(data.get("active_match", ""))
	var fee_list: Variant = data.get("fees", null)
	if fee_list is Array:
		var parsed: Array[int] = []
		for f in fee_list:
			parsed.append(int(f))
		fees = parsed
	emit_changed()


func provider_title() -> String:
	return "Гость" if provider == "guest" else provider
