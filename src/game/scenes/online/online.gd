extends IScene

## App/Online context: the connection to the server for the whole session.
## Signs in as a guest (device id), keeps the profile and the socket (reconnects by itself),
## answers OnlineEvents requests with RPCs and opens App/Online/Match (`ev.join_match`) for a table.
## The table itself lives in the nested Match context; nobody else touches Nakama.

@export var online_events: OnlineEvents
@export var online_config: OnlineConfig
@export var online_link: OnlineLink
@export var profile: PlayerProfile
@export var log_settings: LogSettings
## The addon's Nakama.gd node (no autoload).
@export var nakama_node: Node

var _listener := EventListener.new()
var _log: LogChannel
var _client := OnlineClient.new()
var _connecting: bool = false
var _retry_timer: Timer
var _closing: bool = false


func initialize(_data: Dictionary) -> void:
	_log = LogChannel.new("online", log_settings)
	online_config.load_overrides()
	_client.setup(nakama_node, online_config)
	online_link.client = _client
	_retry_timer = Timer.new()
	_retry_timer.one_shot = true
	_retry_timer.timeout.connect(_connect)
	add_child(_retry_timer)
	_listener.add(online_events.ev_find_table, _on_find_table)
	_listener.add(online_events.ev_create_room, _on_create_room)
	_listener.add(online_events.ev_join_room, _on_join_room)
	_listener.add(online_events.ev_open_company, _on_open_company)
	_listener.add(online_events.ev_start_lesson, _on_start_lesson)
	_listener.add(online_events.ev_refresh_profile, _refresh_profile)
	_listener.add(online_events.ev_mark_visited, _on_mark_visited)
	_listener.add(online_events.ev_load_leaders, _on_load_leaders)
	_listener.add(online_events.ev_load_social, _on_load_social)
	_listener.add(online_events.ev_add_friend, _on_add_friend)
	_listener.add(online_events.ev_create_company, _on_create_company)
	_listener.add(online_events.ev_invite, _on_invite)
	_listener.add(online_events.ev_report, _on_report)
	_listener.add(online_events.ev_block, _on_block)
	_listener.add(online_events.ev_link_account, _on_link_account)
	_listener.add(online_events.ev_delete_account, _on_delete_account)
	_log.info("ready", {"server": online_config.address()})
	_connect()


func deinit() -> void:
	_closing = true
	_listener.deinit()
	if online_link.socket != null:
		online_link.socket.close()
	online_link.set_socket(null)
	online_link.client = null
	super.deinit()


# ------------------------------------------------------------- connection

func _connect() -> void:
	if _connecting or _closing:
		return
	_connecting = true
	online_events.ev_status.emit("Подключение…")
	if not await _client.sign_in_async():
		_fail_connect("sign_in")
		return
	var socket := _client.create_socket()
	var result: NakamaAsyncResult = await socket.connect_async(_client.session, true)
	if _closing:
		return
	if result.is_exception():
		_fail_connect("socket")
		return
	socket.closed.connect(_on_socket_closed.bind(socket))
	socket.received_notification.connect(_on_notification)
	_connecting = false
	online_link.set_socket(socket)
	online_events.ev_status.emit("")
	_log.info("connected", {"server": online_config.address()})
	await _refresh_profile()
	var active := profile.active_match
	if not active.is_empty():
		profile.active_match = ""
		_log.info("rejoin_active", {"match": active})
		_open_match({"match_id": active})


func _fail_connect(stage: String) -> void:
	_connecting = false
	_log.warn("connect_failed", {"stage": stage, "error": _client.last_error, "server": online_config.address()})
	online_events.ev_status.emit("Нет связи с сервером · повторяем…")
	if not _closing:
		_retry_timer.start(online_config.retry_sec)


func _on_socket_closed(socket: NakamaSocket) -> void:
	if online_link.socket != socket or _closing:
		return
	_log.warn("socket_closed")
	online_link.set_socket(null)
	online_events.ev_status.emit("Связь потеряна · переподключаемся…")
	_retry_timer.start(online_config.retry_sec)


func _online_or_toast() -> bool:
	if online_link.is_online():
		return true
	online_events.ev_toast.emit("Нет связи с сервером")
	return false


func _refresh_profile() -> void:
	var data := await _client.rpc_async("bc_profile")
	if data.has("error"):
		_log.warn("profile_failed", {"error": data["error"]})
		return
	profile.apply(data)
	_log.info("profile", {"balance": profile.balance, "provider": profile.provider})


func _on_notification(note: NakamaAPI.ApiNotification) -> void:
	if note.code != 100:
		return
	var content: Variant = JSON.parse_string(note.content)
	if content is Dictionary:
		online_events.ev_invite_received.emit(str(content.get("code", "")), str(content.get("from", "Друг")))


## Close the current table (if any) and open App/Online/Match for this one.
func _open_match(data: Dictionary) -> void:
	add_event("ev.close_match")
	add_event("ev.join_match", data)


# ------------------------------------------------------------- tables

func _on_find_table(mode: String, fee: int) -> void:
	if not _online_or_toast():
		return
	_log.info("find_table", {"mode": mode, "fee": fee})
	var data := await _client.rpc_async("bc_find_table", {"mode": mode, "fee": fee})
	if data.has("error"):
		online_events.ev_toast.emit(MatchOps.error_text(str(data["error"])) if data["error"] == "not_enough_chips" else "Не удалось найти стол")
		return
	_open_match({"match_id": str(data["match_id"]), "mode": mode, "fee": fee})


func _on_create_room(invite_ids: Array) -> void:
	if not _online_or_toast():
		return
	var data := await _client.rpc_async("bc_create_room")
	if data.has("error"):
		online_events.ev_toast.emit("Не удалось создать комнату")
		return
	_log.info("room_created", {"code": data.get("code", ""), "invites": invite_ids.size()})
	_open_match({"match_id": str(data["match_id"])})
	if not invite_ids.is_empty():
		_on_invite(str(data["code"]), invite_ids, "")


func _on_join_room(code: String) -> void:
	if not _online_or_toast():
		return
	var data := await _client.rpc_async("bc_join_room", {"code": code.strip_edges().to_upper()})
	if data.has("error"):
		online_events.ev_toast.emit("Комната %s не найдена" % code.to_upper() if data["error"] == "room_not_found" else "Нужно шесть букв или цифр")
		return
	_open_match({"match_id": str(data["match_id"])})


func _on_open_company(company_id: String) -> void:
	if not _online_or_toast():
		return
	var data := await _client.rpc_async("bc_open_company", {"company_id": company_id})
	if data.has("error"):
		online_events.ev_toast.emit("Компания не найдена")
		return
	_open_match({"match_id": str(data["match_id"])})


func _on_start_lesson() -> void:
	if not _online_or_toast():
		return
	var data := await _client.rpc_async("bc_lesson")
	if data.has("error"):
		online_events.ev_toast.emit("Учебная раздача недоступна")
		return
	_open_match({"match_id": str(data["match_id"])})


# ------------------------------------------------------------- lobby data

func _on_mark_visited() -> void:
	if profile.visited:
		return
	profile.visited = true
	await _client.rpc_async("bc_mark_visited")


func _on_load_leaders(scope: String) -> void:
	var data := await _client.rpc_async("bc_leaders", {"scope": scope})
	online_events.ev_leaders.emit(data)


func _on_load_social() -> void:
	var data := await _client.rpc_async("bc_social")
	online_events.ev_social.emit(data)


func _on_add_friend(user_id: String) -> void:
	await _client.rpc_async("bc_add_friend", {"user_id": user_id})
	online_events.ev_toast.emit("Заявка в друзья отправлена")
	_on_load_social()


func _on_create_company(company_name: String, members: Array) -> void:
	var data := await _client.rpc_async("bc_create_company", {"name": company_name, "members": members})
	if data.has("error"):
		online_events.ev_toast.emit("Введите название")
		return
	online_events.ev_company_created.emit(data["company"])
	_on_open_company(str(data["company"]["id"]))


func _on_invite(code: String, user_ids: Array, company_id: String) -> void:
	var data := await _client.rpc_async("bc_invite", {"code": code, "user_ids": user_ids, "company_id": company_id})
	if data.has("error"):
		online_events.ev_toast.emit("Комната закрыта")
		return
	online_events.ev_toast.emit("Приглашения отправлены · %d" % int(data.get("sent", 0)))


func _on_report(user_id: String, reason: String) -> void:
	await _client.rpc_async("bc_report", {"user_id": user_id, "reason": reason})
	online_events.ev_toast.emit("Жалоба отправлена")


func _on_block(user_id: String) -> void:
	await _client.rpc_async("bc_block", {"user_id": user_id})
	online_events.ev_toast.emit("Игрок заблокирован: в случайных играх вы не встретитесь")


func _on_link_account(provider: String) -> void:
	var data := await _client.rpc_async("bc_link", {"provider": provider})
	if data.has("error"):
		online_events.ev_toast.emit("Вход через %s появится в версии для магазина" % provider)


func _on_delete_account() -> void:
	var data := await _client.rpc_async("bc_delete_account")
	if data.has("error"):
		online_events.ev_toast.emit("Не удалось удалить аккаунт")
		return
	_log.info("account_deleted")
	if online_link.socket != null:
		online_link.socket.close()
	online_link.set_socket(null)
	_client.forget_device()
	profile.signed_in = false
	online_events.ev_account_deleted.emit()
	_connect()
