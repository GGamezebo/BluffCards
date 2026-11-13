class_name OnlineLink
extends Resource

## The live connection, handed from the App/Online context to the App/Online/Match context
## (shared `.tres`, like NetLink in GoofyBalls). Only App/Online writes it.

## Socket up (true) or lost (false). After `true` a match context re-joins its table.
signal ev_socket_changed(online: bool)

var client: OnlineClient = null
var socket: NakamaSocket = null


func is_online() -> bool:
	return socket != null and socket.is_connected_to_host()


func set_socket(value: NakamaSocket) -> void:
	socket = value
	ev_socket_changed.emit(value != null)
