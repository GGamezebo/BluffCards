class_name TableView
extends Resource

## The table as the server sent it to this player (plain data, server/ts/src/match.ts `viewFor`).
## Written only by the App/Online/Match context; Search / Room / Table / Result read it.
## Never holds other players' cards: the server does not send them.

@export var data: Dictionary = {}


func set_view(view: Dictionary) -> void:
	data = view
	emit_changed()


func is_empty() -> bool:
	return data.is_empty()


func kind() -> String:
	return str(data.get("kind", "public"))


func mode() -> String:
	return str(data.get("mode", "quick"))


func phase() -> String:
	return str(data.get("phase", "waiting"))


func fee() -> int:
	return int(data.get("fee", 0))


func me() -> int:
	return int(data.get("me", -1))


func seats() -> Array:
	return data.get("seats", [])


func seat(index: int) -> Dictionary:
	var list := seats()
	return list[index] if index >= 0 and index < list.size() else {}


func seat_name(index: int) -> String:
	if index == me():
		return "Вы"
	return str(seat(index).get("name", "?"))


func deal() -> Dictionary:
	var d: Variant = data.get("deal", null)
	return d if d is Dictionary else {}


func deal_phase() -> String:
	return str(deal().get("phase", ""))


## My cards as ints (JSON numbers arrive as floats).
func hand() -> Array[int]:
	var out: Array[int] = []
	for c in data.get("hand", []):
		out.append(int(c))
	return out


func result() -> Dictionary:
	var r: Variant = data.get("result", null)
	return r if r is Dictionary else {}


func is_host() -> bool:
	return bool(seat(me()).get("host", false))


func actor() -> int:
	return int(deal().get("actor", -1))


func is_my_turn() -> bool:
	var p := deal_phase()
	return me() >= 0 and actor() == me() and (p == "open" or p == "reply")


## Ranks collected as fours → seat that holds the minus.
func dead_ranks() -> Dictionary:
	var out := {}
	for entry in deal().get("dead", []):
		out[int(entry["rank"])] = int(entry["seat"])
	return out


func title() -> String:
	if kind() == "lesson":
		return "Учебная раздача"
	if fee() > 0:
		return "Клуб профессионалов"
	return "Быстрая игра" if mode() == "quick" else "На вылет"
