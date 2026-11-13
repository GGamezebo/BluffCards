extends IScene

## Lobby context (concept/design «Главная» and its windows): club hall, club of professionals,
## friends & companies, room code, leaderboard, account. Windows go through one WindowStackManager;
## every request leaves through OnlineEvents (tables, rooms and data live in App/Online).
## Payload: {"window": "pro" | "friends" | ""} opens that window (e.g. after a cancelled search).

@export var online_events: OnlineEvents
@export var profile: PlayerProfile
@export var log_settings: LogSettings
@export var app_bar: AppBar
@export var window_stack: WindowStackManager
@export var home_window: HomeWindow
@export var pro_window: ProWindow
@export var friends_window: FriendsWindow
@export var join_window: JoinWindow
@export var leaders_window: LeadersWindow
@export var account_window: AccountWindow
@export var fee_dialog: ModalDialog
@export var company_dialog: ModalDialog
@export var company_name_edit: LineEdit
@export var delete_dialog: ModalDialog

var _listener := EventListener.new()
var _log: LogChannel
var _pending_fee: int = 0
var _pending_members: Array = []


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("lobby", log_settings)
	_listener.add(profile.changed, _on_profile_changed)
	_listener.add(app_bar.ev_home, func() -> void: window_stack.open_stacked_window(home_window))
	_listener.add(app_bar.ev_help, _start_lesson)
	_listener.add(home_window.ev_play, _on_play)
	_listener.add(pro_window.ev_fee_chosen, _on_fee_chosen)
	_listener.add(fee_dialog.ev_primary, _on_fee_confirmed)
	_listener.add(fee_dialog.ev_secondary, fee_dialog.close)
	_listener.add(friends_window.ev_refresh, func() -> void: online_events.ev_load_social.emit())
	_listener.add(friends_window.ev_create_room, func(ids: Array) -> void: online_events.ev_create_room.emit(ids))
	_listener.add(friends_window.ev_open_company, func(id: String) -> void: online_events.ev_open_company.emit(id))
	_listener.add(friends_window.ev_add_friend, func(id: String) -> void: online_events.ev_add_friend.emit(id))
	_listener.add(friends_window.ev_new_company, _on_new_company)
	_listener.add(company_dialog.ev_primary, _on_company_confirmed)
	_listener.add(company_dialog.ev_secondary, company_dialog.close)
	_listener.add(join_window.ev_join, func(code: String) -> void: online_events.ev_join_room.emit(code))
	_listener.add(leaders_window.ev_scope, func(scope: String) -> void: online_events.ev_load_leaders.emit(scope))
	_listener.add(account_window.ev_link, func(provider: String) -> void: online_events.ev_link_account.emit(provider))
	_listener.add(account_window.ev_lesson, _start_lesson)
	_listener.add(account_window.ev_delete, func() -> void:
		delete_dialog.open_dialog("Удалить аккаунт?", "Профиль, фишки и друзья удалятся без возможности восстановления. Начнётся новый гостевой профиль.", "Удалить навсегда", "Оставить"))
	_listener.add(delete_dialog.ev_primary, _on_delete_confirmed)
	_listener.add(delete_dialog.ev_secondary, delete_dialog.close)
	_listener.add(online_events.ev_status, home_window.set_status)
	_listener.add(online_events.ev_leaders, func(d: Dictionary) -> void: leaders_window.setup(d, profile.balance))
	_listener.add(online_events.ev_social, friends_window.setup)
	_listener.add(online_events.ev_account_deleted, _on_account_deleted)
	_on_profile_changed()
	online_events.ev_refresh_profile.emit()
	var window := str(data.get("window", ""))
	if window == "pro":
		window_stack.open_stacked_window(pro_window)
	elif window == "friends":
		window_stack.open_stacked_window(friends_window)
	_log.info("open", {"window": window, "balance": profile.balance})


func deinit() -> void:
	_listener.deinit()
	super.deinit()


func _on_profile_changed() -> void:
	app_bar.set_balance(profile.balance)
	home_window.set_first_visit(profile.signed_in and not profile.visited and not profile.lesson_done)
	pro_window.setup(profile.fees, profile.balance)
	account_window.setup(profile)


func _on_play(mode: String) -> void:
	online_events.ev_mark_visited.emit()
	_log.info("play", {"mode": mode})
	online_events.ev_find_table.emit(mode, 0)


func _on_fee_chosen(fee: int) -> void:
	if profile.balance < fee:
		return
	_pending_fee = fee
	fee_dialog.open_dialog("Стол на вылет",
		"Взнос %s фишек · призовой фонд %s фишек.\nПризы: 1-е место 55 %%, 2-е 30 %%, 3-е 15 %%. Отмена поиска возвращает взнос." % [Cards.chips(fee), Cards.chips(fee * 6)],
		"Войти за %s" % Cards.chips(fee), "Отмена")


func _on_fee_confirmed() -> void:
	fee_dialog.close()
	_log.info("play_paid", {"fee": _pending_fee})
	online_events.ev_find_table.emit("series", _pending_fee)


func _on_new_company(member_ids: Array) -> void:
	_pending_members = member_ids
	company_name_edit.text = ""
	company_dialog.open_dialog("Новая компания", "Постоянная ссылка компании всегда ведёт в её комнату. Отмеченные друзья войдут в компанию.", "Создать комнату", "Отмена")
	company_name_edit.grab_focus()


func _on_company_confirmed() -> void:
	var title := company_name_edit.text.strip_edges()
	if title.is_empty():
		online_events.ev_toast.emit("Введите название")
		return
	company_dialog.close()
	online_events.ev_create_company.emit(title, _pending_members)


func _start_lesson() -> void:
	online_events.ev_mark_visited.emit()
	_log.info("lesson")
	online_events.ev_start_lesson.emit()


func _on_delete_confirmed() -> void:
	delete_dialog.close()
	online_events.ev_delete_account.emit()


func _on_account_deleted() -> void:
	window_stack.open_stacked_window(home_window)
	online_events.ev_toast.emit("Аккаунт удалён · создан новый гостевой профиль")
