extends IScene

## Game table (concept/design «Игровой стол», «Новый круг», «Перевод», «Выбор карты», «Вскрытие»,
## «Добор и четвёрки», «Итог раздачи», «Наблюдение», «Вылет», «Реакции», «Карточка соперника»,
## «Переподключение», «Игрок отошёл», «Выход из партии»). Pure view of the server's table view
## plus local choices (selected cards, claim, picking a card). Moves go out as MatchEvents intents.
## Server events play as flights first; the new view replaces the old one when they land.

@export var table_view: TableView
@export var match_events: MatchEvents
@export var online_events: OnlineEvents
@export var reaction_set: ReactionSet
@export var log_settings: LogSettings
## Shown when the scene runs alone (F6).
@export var demo_view: TableView

@export_group("Layout")
@export var title_label: Label
@export var deal_label: Label
@export var menu_button: Button
@export var rank_strip: RankRow
@export var felt_area: Control
@export var felt: Control
@export var seats_layer: Control
@export var deck_label: Label
@export var trick: TrickView
@export var instruction_panel: Control
@export var instruction_label: Label
@export var motion_status: Label
@export var hand_head_label: Label
@export var turn_label: Label
@export var reactions_button: Button
@export var hand: HandView
@export var picker: RankRow
@export var check_button: Button
@export var transfer_button: Button
@export var declare_button: Button
@export var back_button: Button
@export var side_left: Control
@export var side_right: Control
@export var history_side: VBoxContainer
@export var quick_side: VBoxContainer
@export var motion: TableMotion
@export var reactions_sheet: ReactionsSheet

@export_group("Dialogs")
@export var menu_dialog: ModalDialog
@export var menu_history: Button
@export var menu_reactions: Button
@export var menu_leave: Button
@export var history_dialog: ModalDialog
@export var history_list: VBoxContainer
@export var rank_dialog: ModalDialog
@export var player_dialog: ModalDialog
@export var player_avatar: Avatar
@export var player_cards: ListLine
@export var player_minus: ListLine
@export var player_respect: ListLine
@export var mute_button: Button
@export var friend_button: Button
@export var report_button: Button
@export var block_button: Button
@export var report_dialog: ModalDialog
@export var report_reasons: Container
@export var leave_dialog: ModalDialog
@export var away_dialog: ModalDialog
@export var offline_dialog: ModalDialog
@export var watch_dialog: ModalDialog
@export var round_dialog: ModalDialog
@export var round_list: VBoxContainer
@export var lesson_dialog: ModalDialog

@export_group("Templates")
@export var seat_scene: PackedScene
@export var line_scene: PackedScene
@export var note_scene: PackedScene

@export_group("Tuning")
## Opponent places on the felt by their count (fractions of the felt; concept/design club.js).
@export var seat_positions: Dictionary = {
	1: [Vector2(0.5, 0.11)],
	2: [Vector2(0.17, 0.22), Vector2(0.83, 0.22)],
	3: [Vector2(0.13, 0.34), Vector2(0.5, 0.1), Vector2(0.87, 0.34)],
	4: [Vector2(0.13, 0.4), Vector2(0.32, 0.11), Vector2(0.68, 0.11), Vector2(0.87, 0.4)],
	5: [Vector2(0.12, 0.52), Vector2(0.2, 0.19), Vector2(0.5, 0.09), Vector2(0.8, 0.19), Vector2(0.88, 0.52)],
	6: [Vector2(0.11, 0.62), Vector2(0.12, 0.33), Vector2(0.32, 0.1), Vector2(0.68, 0.1), Vector2(0.88, 0.33), Vector2(0.89, 0.62)],
	7: [Vector2(0.11, 0.73), Vector2(0.1, 0.45), Vector2(0.19, 0.2), Vector2(0.5, 0.09), Vector2(0.81, 0.2), Vector2(0.9, 0.45), Vector2(0.89, 0.73)],
	8: [Vector2(0.12, 0.78), Vector2(0.1, 0.5), Vector2(0.14, 0.23), Vector2(0.35, 0.09), Vector2(0.65, 0.09), Vector2(0.86, 0.23), Vector2(0.9, 0.5), Vector2(0.88, 0.78)],
	9: [Vector2(0.12, 0.79), Vector2(0.1, 0.55), Vector2(0.11, 0.3), Vector2(0.27, 0.11), Vector2(0.5, 0.08), Vector2(0.73, 0.11), Vector2(0.89, 0.3), Vector2(0.9, 0.55), Vector2(0.88, 0.79)],
}
## Seats from this count get the small faces.
@export var dense_from: int = 6
## A pile at least this big shakes the felt when taken.
@export var big_pile: int = 10
## Landscape window at least this wide shows history and phrases beside the table.
@export var wide_px: float = 1500.0
@export var own_reaction_sec: float = 2.0

var _listener := EventListener.new()
var _log: LogChannel
var _view := TableView.new()
var _queue: Array = []
var _busy: bool = false
var _selected: Array[int] = []
var _claim: int = -1
var _checking: bool = false
var _turn_key: String = ""
var _turn_left: float = 0.0
var _turn_total: float = 0.0
var _seat_nodes: Dictionary = {}
var _muted: Array[String] = []
var _sent: Array[float] = []
var _player_seat: int = -1
var _watch_seen_deal: int = -1
var _round_ready_sent: int = -1
var _next_left: float = 0.0
var _lesson_shown: bool = false
var _eliminated_shown: bool = false
var _own_reaction_until: float = 0.0


func initialize(data: Dictionary) -> void:
	_log = LogChannel.new("table", log_settings)
	if data.get("demo", false):
		table_view.set_view(demo_view.data.duplicate(true))
	_listener.add(match_events.ev_view, _on_view)
	_listener.add(match_events.ev_reaction, _on_reaction)
	_listener.add(match_events.ev_error, _on_error)
	_listener.add(match_events.ev_connection, _on_connection)
	_listener.add(menu_button.pressed, func() -> void: menu_dialog.open_dialog("Меню стола"))
	_listener.add(menu_history.pressed, _open_history)
	_listener.add(menu_reactions.pressed, _open_reactions)
	_listener.add(menu_leave.pressed, _open_leave)
	_listener.add(reactions_button.pressed, _open_reactions)
	_listener.add(rank_strip.ev_rank_pressed, _open_rank_info)
	_listener.add(picker.ev_rank_pressed, func(rank: int) -> void:
		_claim = rank
		_render()
	)
	_listener.add(hand.ev_selection_changed, func(sel: Array) -> void:
		_selected.assign(sel)
		_render_controls()
	)
	_listener.add(trick.ev_pick, _on_pick)
	_listener.add(check_button.pressed, _on_check_pressed)
	_listener.add(transfer_button.pressed, _submit_play)
	_listener.add(declare_button.pressed, _submit_play)
	_listener.add(back_button.pressed, func() -> void:
		_checking = false
		_render()
	)
	_listener.add(reactions_sheet.ev_react, _send_reaction)
	_listener.add(mute_button.pressed, _toggle_mute)
	_listener.add(friend_button.pressed, _add_friend)
	_listener.add(report_button.pressed, func() -> void:
		player_dialog.close()
		report_dialog.open_dialog("Пожаловаться", "Почему?", "", "Отмена")
	)
	_listener.add(report_dialog.ev_secondary, report_dialog.close)
	_listener.add(block_button.pressed, _block_player)
	_listener.add(leave_dialog.ev_primary, leave_dialog.close)
	_listener.add(leave_dialog.ev_secondary, _leave_table)
	_listener.add(away_dialog.ev_primary, func() -> void:
		match_events.ev_intent.emit(MatchOps.BACK, {})
		away_dialog.hide()
	)
	_listener.add(watch_dialog.ev_primary, watch_dialog.close)
	_listener.add(watch_dialog.ev_secondary, func() -> void: match_events.ev_leave.emit(""))
	_listener.add(round_dialog.ev_primary, _on_round_primary)
	_listener.add(round_dialog.ev_secondary, func() -> void: match_events.ev_leave.emit(""))
	_listener.add(lesson_dialog.ev_primary, func() -> void: match_events.ev_leave.emit(""))
	for child in quick_side.get_children():
		var quick := child as Button
		if quick != null:
			_listener.add(quick.pressed, _send_reaction.bind("phrase", reaction_set.phrases.find(quick.text), -1))
	for child in report_reasons.get_children():
		var reason := child as Button
		if reason != null:
			_listener.add(reason.pressed, _report.bind(reason.text))
	_listener.add(felt_area.resized, _place_seats)
	_listener.add(get_viewport().size_changed, _update_wide)
	_update_wide()
	_apply(table_view.data, [])
	_log.info("open", {"kind": _view.kind(), "mode": _view.mode(), "seats": _view.seats().size()})


func deinit() -> void:
	_listener.deinit()
	_queue.clear()
	super.deinit()


func _default_data() -> Dictionary:
	return {"demo": true}


func _process(delta: float) -> void:
	if _turn_total > 0.0:
		_turn_left = maxf(0.0, _turn_left - delta)
		_update_timer()
	if _next_left > 0.0:
		_next_left = maxf(0.0, _next_left - delta)
		if round_dialog.visible:
			round_dialog.title_label.text = _round_title()
	if _own_reaction_until > 0.0 and Time.get_ticks_msec() / 1000.0 > _own_reaction_until:
		_own_reaction_until = 0.0
		if not _busy:
			motion_status.text = ""


# ------------------------------------------------------------------ server updates

func _on_view(view: Dictionary, events: Array) -> void:
	_queue.append({"view": view, "events": events})
	_pump()


func _pump() -> void:
	if _busy:
		return
	while not _queue.is_empty():
		var item: Dictionary = _queue.pop_front()
		var events: Array = item["events"]
		if not _view.is_empty() and _has_motion(events):
			_busy = true
			_render_controls()
			await _animate(events)
			_busy = false
			if not is_inside_tree():
				return
		_apply(item["view"], events)


func _has_motion(events: Array) -> bool:
	for e in events:
		if str(e.get("t", "")) in ["play", "reveal", "collect", "draw", "four", "turn"]:
			return true
	return false


func _apply(view: Dictionary, _events: Array) -> void:
	_view.set_view(view)
	var d := _view.deal()
	var key := "%d:%d:%s:%d:%d" % [int(view.get("deal_no", 0)), int(d.get("round", 0)), str(d.get("phase", "")), int(d.get("actor", -1)), int(d.get("packet", 0))]
	if key != _turn_key:
		_turn_key = key
		_selected.clear()
		_claim = -1
		_checking = false
		_turn_total = float(d.get("turn_total", 0))
		_turn_left = float(d.get("turn_left", 0))
	_render()


# ------------------------------------------------------------------ render

func _render() -> void:
	var v := _view
	if v.is_empty():
		return
	var d := v.deal()
	var dphase := v.deal_phase()
	var deal_no := int(v.data.get("deal_no", 0))
	title_label.text = "%s · %d мест" % [v.title(), v.seats().size()]
	deal_label.text = "Миссия" if v.kind() == "lesson" else ("Раздача %d" % deal_no if v.mode() == "series" else "")
	var claim := int(d.get("claim", -1)) if dphase == "reply" or dphase == "reveal" else -1
	rank_strip.set_state(v.dead_ranks(), claim)
	deck_label.text = str(int(d.get("deck", 0)))
	_render_seats()
	trick.render(v, _checking and _can_check())
	var me := v.seat(v.me())
	if v.me() < 0:
		hand_head_label.text = "Вы наблюдаете"
	elif not bool(me.get("alive", true)):
		hand_head_label.text = "Вы выбыли · наблюдаете"
	else:
		hand_head_label.text = "Ваша рука · %d · −%d" % [v.hand().size(), (me.get("minus", []) as Array).size()]
	hand.setup(v.hand(), _can_select(), _selected)
	_render_controls()
	_render_side()
	_render_overlays()


func _render_seats() -> void:
	var v := _view
	var d := v.deal()
	var dphase := v.deal_phase()
	var order := _opponents()
	var dense := order.size() >= dense_from
	var wanted := {}
	for s in order:
		wanted[int(s["seat"])] = true
	for seat in _seat_nodes.keys():
		if not wanted.has(seat):
			(_seat_nodes[seat] as Node).queue_free()
			_seat_nodes.erase(seat)
	for s in order:
		var seat := int(s["seat"])
		var node: TableSeat = _seat_nodes.get(seat)
		if node == null:
			node = seat_scene.instantiate() as TableSeat
			seats_layer.add_child(node)
			node.ev_seat_pressed.connect(_open_player)
			_seat_nodes[seat] = node
		var acting := (dphase == "open" or dphase == "reply") and int(d.get("actor", -1)) == seat
		var target := dphase == "reply" and int(d.get("last", -1)) == seat
		var ratio := _turn_left / _turn_total if acting and _turn_total > 0.0 else -1.0
		node.setup(s, str(s.get("name", "")), acting, target, ratio, dense)
	_place_seats()


func _place_seats() -> void:
	var order := _opponents()
	var spots: Array = seat_positions.get(clampi(order.size(), 1, 9), [])
	var area := seats_layer.size
	for i in order.size():
		var node: TableSeat = _seat_nodes.get(int(order[i]["seat"]))
		if node == null or i >= spots.size():
			continue
		var p: Vector2 = spots[i]
		node.reset_size()
		node.position = Vector2(p.x * area.x, p.y * area.y) - node.size * 0.5


## Opponents clockwise, starting with the player after me.
func _opponents() -> Array:
	var seats := _view.seats()
	var me := _view.me()
	var out: Array = []
	for k in seats.size():
		var i := (me + 1 + k) % seats.size() if me >= 0 else k
		if i != me:
			out.append(seats[i])
	return out


func _my_turn() -> bool:
	return _view.is_my_turn() and not _busy and not bool(_view.seat(_view.me()).get("away", false))


func _can_check() -> bool:
	return _my_turn() and _view.deal_phase() == "reply"


func _can_select() -> bool:
	if not _my_turn() or _checking or _view.kind() == "lesson":
		return false
	var d := _view.deal()
	return _view.deal_phase() == "open" or (_view.deal_phase() == "reply" and not bool(d.get("mandatory", false)))


func _render_controls() -> void:
	var v := _view
	var d := v.deal()
	var dphase := v.deal_phase()
	var mine := _my_turn()
	var mandatory := bool(d.get("mandatory", false))
	var lesson := v.kind() == "lesson"
	var opening := mine and dphase == "open"
	var replying := mine and dphase == "reply"
	picker.visible = opening and not lesson
	picker.set_state(v.dead_ranks(), _claim)
	declare_button.visible = opening
	declare_button.text = "Объявить · %d" % _selected.size()
	declare_button.disabled = _selected.is_empty() or _claim < 0
	check_button.visible = replying and not _checking
	transfer_button.visible = replying and not _checking and not mandatory and not lesson
	transfer_button.text = "Перевести · %d" % _selected.size()
	transfer_button.disabled = _selected.is_empty()
	back_button.visible = replying and _checking and not lesson
	var text := ""
	if _checking and replying:
		text = "Открой одну карту из последней пачки"
	elif lesson and replying:
		text = "Миссия · проверь заявку Маши: нажми «Не верю» и открой одну карту"
	elif replying and mandatory:
		text = "Последние карты! Проверка обязательна."
	elif opening:
		text = "Выбери карты и объяви номинал"
	elif replying:
		text = "Переведи карты под ту же заявку или скажи «Не верю»"
	instruction_label.text = text
	instruction_panel.visible = not text.is_empty()
	if _busy:
		turn_label.text = ""
	elif dphase == "done" or v.phase() == "interlude":
		turn_label.text = "Раздача окончена"
	elif dphase == "reveal":
		turn_label.text = "Вскрытие"
	elif v.is_my_turn():
		turn_label.text = "Ваш ход"
	else:
		turn_label.text = "Ход · %s" % v.seat_name(v.actor())
	_update_timer()


func _update_timer() -> void:
	if _turn_total <= 0.0 or _busy:
		return
	var seconds := int(ceilf(minf(_turn_left, _turn_total)))
	var base := "Ваш ход" if _view.is_my_turn() else "Ход · %s" % _view.seat_name(_view.actor())
	turn_label.text = "%s · %d с" % [base, seconds]
	var node: TableSeat = _seat_nodes.get(_view.actor())
	if node != null:
		node.set_turn_ratio(_turn_left / _turn_total)


func _render_side() -> void:
	if not side_left.visible:
		return
	for child in history_side.get_children():
		child.queue_free()
	var lines := _history_lines()
	for i in range(maxi(0, lines.size() - 14), lines.size()):
		var note := note_scene.instantiate() as Label
		history_side.add_child(note)
		note.text = lines[i]


func _render_overlays() -> void:
	var v := _view
	var me := v.seat(v.me())
	var deal_no := int(v.data.get("deal_no", 0))
	var away := bool(me.get("away", false)) and v.phase() == "playing"
	if away and not away_dialog.visible:
		away_dialog.open_dialog("Вы отошли", "Два хода подряд пропущены. За вас играет бот, пока вы не вернётесь.", "Я тут")
	elif not away and away_dialog.visible:
		away_dialog.hide()
	if v.phase() == "playing" and bool(me.get("out", false)) and v.deal_phase() != "done" and _watch_seen_deal != deal_no:
		_watch_seen_deal = deal_no
		watch_dialog.open_dialog("Вы вышли из раздачи", "Колода и рука пусты. Ваши минусы: −%d. Дождитесь конца раздачи." % (me.get("minus", []) as Array).size(), "Наблюдать за столом")
	if v.me() >= 0 and v.mode() == "series" and not bool(me.get("alive", true)) and not _eliminated_shown and v.phase() == "playing":
		_eliminated_shown = true
		var rest: PackedStringArray = []
		for s in v.seats():
			if bool(s.get("alive", true)):
				rest.append(str(s.get("name", "")))
		watch_dialog.open_dialog("Вы выбыли", "У вас больше всего минусов. Продолжают: %s." % ", ".join(rest), "Наблюдать за столом", "На главную")
	if v.phase() == "interlude":
		_open_round()
	elif round_dialog.visible:
		round_dialog.hide()
	if v.kind() == "lesson" and v.phase() == "finished" and not _lesson_shown:
		_lesson_shown = true
		var truth := false
		for e in v.data.get("history", []):
			if str(e.get("t", "")) == "reveal":
				truth = bool(e.get("truth", false))
		lesson_dialog.open_dialog("Миссия пройдена",
			("Это была правда — стопку забирает проверявший." if truth else "Маша блефовала — стопку забирает она.")
			+ "\nПроверяется ровно одна карта. Ошибся — забираешь всю стопку.", "В клуб")


# ------------------------------------------------------------------ moves

func _on_check_pressed() -> void:
	if not _can_check():
		return
	_checking = true
	_selected.clear()
	_render()


func _on_pick(index: int) -> void:
	if not _can_check():
		return
	_log.info("check", {"pick": index})
	_checking = false
	match_events.ev_intent.emit(MatchOps.CHECK, {"index": index})


func _submit_play() -> void:
	if not _my_turn() or _selected.is_empty():
		return
	var opening := _view.deal_phase() == "open"
	if opening and _claim < 0:
		return
	var rank := _claim if opening else int(_view.deal().get("claim", -1))
	_log.info("play", {"open": opening, "count": _selected.size()})
	match_events.ev_intent.emit(MatchOps.PLAY, {"cards": _selected.duplicate(), "rank": rank})
	_selected.clear()
	_claim = -1


# ------------------------------------------------------------------ animations

func _animate(events: Array) -> void:
	for e in events:
		if not is_inside_tree():
			return
		var t := str(e.get("t", ""))
		var seat := int(e.get("seat", -1))
		var count := int(e.get("count", 0))
		match t:
			"play":
				motion_status.text = "%s → стопка · %d" % [_view.seat_name(seat), count]
				await motion.fly(_place_of(seat), trick.center_global(), "×%d" % count, t)
			"reveal":
				motion_status.text = "%s · проверка одной карты" % _view.seat_name(seat)
				await motion.fly(_place_of(seat), trick.center_global(), "?", t)
			"collect":
				motion_status.text = "Стопка → %s · %d" % [_view.seat_name(seat), count]
				if count >= big_pile:
					motion.shake(felt)
				await motion.fly(trick.center_global(), _place_of(seat), "×%d" % count, t)
			"draw":
				motion_status.text = "Колода → %s · +%d" % [_view.seat_name(seat), count]
				await motion.fly(deck_label.global_position + deck_label.size * 0.5, _place_of(seat), "+%d" % count, t)
			"four":
				var rank := int(e.get("rank", 0))
				motion_status.text = "%s · четвёрка %s · −1" % [_view.seat_name(seat), Cards.plural(rank)]
				await motion.fly(_place_of(seat), rank_strip.global_center(rank), "%s×4" % Cards.label(rank), t)
			"turn":
				var to := int(e.get("to", -1))
				motion_status.text = "Ваш ход" if to == _view.me() else "Ходит %s" % _view.seat_name(to)
				var from := trick.center_global() if seat < 0 else _place_of(seat)
				await motion.fly(from, _place_of(to), "•", t)
	motion_status.text = ""


func _place_of(seat: int) -> Vector2:
	if seat == _view.me():
		return hand.global_center()
	var node: TableSeat = _seat_nodes.get(seat)
	return node.center_global() if node != null else trick.center_global()


# ------------------------------------------------------------------ reactions

func _open_reactions() -> void:
	menu_dialog.close()
	var opponents: Array = []
	for s in _opponents():
		opponents.append({"seat": int(s["seat"]), "name": str(s.get("name", ""))})
	reactions_sheet.open_sheet(opponents)


func _send_reaction(kind: String, id: int, target: int) -> void:
	var now := Time.get_ticks_msec() / 1000.0
	_sent = _sent.filter(func(t: float) -> bool: return now - t < reaction_set.window_sec)
	if (not _sent.is_empty() and now - _sent.back() < reaction_set.gap_sec) or _sent.size() >= reaction_set.max_in_window:
		online_events.ev_toast.emit(MatchOps.error_text("reaction_rate"))
		return
	_sent.append(now)
	match_events.ev_intent.emit(MatchOps.REACT, {"kind": kind, "id": id, "target": target})


func _on_reaction(data: Dictionary) -> void:
	var seat := int(data.get("seat", -1))
	var kind := str(data.get("kind", ""))
	var id := int(data.get("id", 0))
	var target := int(data.get("target", -1))
	var author := _view.seat(seat)
	if _muted.has(str(author.get("id", ""))):
		return
	var text := reaction_set.text(kind, id)
	var icon := reaction_set.icon(kind, id)
	if kind == "throw":
		_show_bubble(target, "", icon)
		_show_bubble(seat, "→ %s" % _view.seat_name(target), null)
	else:
		_show_bubble(seat, text, icon)


func _show_bubble(seat: int, text: String, icon: Texture2D) -> void:
	if seat == _view.me():
		motion_status.text = "Вы: %s" % (text if not text.is_empty() else "реакция")
		_own_reaction_until = Time.get_ticks_msec() / 1000.0 + own_reaction_sec
		return
	var node: TableSeat = _seat_nodes.get(seat)
	if node != null:
		node.show_reaction(text, icon)


# ------------------------------------------------------------------ dialogs

func _open_history() -> void:
	menu_dialog.close()
	for child in history_list.get_children():
		child.queue_free()
	for line in _history_lines():
		var note := note_scene.instantiate() as Label
		history_list.add_child(note)
		note.text = line
		note.theme_type_variation = &"Label"
	history_dialog.open_dialog("История ходов")


func _history_lines() -> PackedStringArray:
	var out: PackedStringArray = []
	for e in _view.data.get("history", []):
		var who := _view.seat_name(int(e.get("seat", -1)))
		match str(e.get("t", "")):
			"deal":
				out.append("— Раздача %d —" % int(e.get("count", 0)))
			"play":
				var claim := Cards.claim_text(int(e.get("rank", 0)), int(e.get("count", 0)))
				out.append(("%s объявляет: %s" if bool(e.get("open", false)) else "%s переводит: %s") % [who, claim])
			"reveal":
				out.append("%s открывает %s · %s · стопку забирает %s" % [who, Cards.label(Cards.rank_of(int(e.get("card", 0)))),
					"правда" if bool(e.get("truth", false)) else "блеф", _view.seat_name(int(e.get("loser", -1)))])
			"four":
				out.append("%s · четвёрка %s → −1" % [who, Cards.plural(int(e.get("rank", 0)))])
			"out":
				out.append("%s вышел из раздачи" % who)
			"eliminated":
				out.append("%s выбывает из серии" % who)
	return out


func _open_rank_info(rank: int) -> void:
	var dead := _view.dead_ranks()
	var body := "В игре. Доступен для заявки в новом круге."
	if dead.has(rank):
		body = "Четвёрка собрана · %s · −1. Заявка недоступна." % _view.seat_name(int(dead[rank]))
	rank_dialog.open_dialog("Номинал %s" % Cards.label(rank), body)


func _open_player(seat: int) -> void:
	_player_seat = seat
	var s := _view.seat(seat)
	var public := _view.kind() == "public"
	var is_bot := bool(s.get("bot", false))
	player_avatar.setup(int(s.get("avatar", 0)), str(s.get("name", "")))
	var minus: PackedStringArray = []
	for r in s.get("minus", []):
		minus.append(Cards.label(int(r)))
	player_cards.setup("Карты в руке", str(int(s.get("cards", 0))))
	player_minus.setup("Открытые минусы", " · ".join(minus) if not minus.is_empty() else "0")
	player_respect.setup("Уважение", str(int(s.get("respect", 0))))
	mute_button.text = "Включить реакции" if _muted.has(str(s.get("id", ""))) else "Заглушить реакции"
	friend_button.visible = not is_bot and _view.kind() != "lesson"
	report_button.visible = public
	block_button.visible = public
	player_dialog.open_dialog(str(s.get("name", "")), "За столом")


func _toggle_mute() -> void:
	var id := str(_view.seat(_player_seat).get("id", ""))
	if _muted.has(id):
		_muted.erase(id)
	else:
		_muted.append(id)
	player_dialog.close()
	online_events.ev_toast.emit("Реакции игрока заглушены" if _muted.has(id) else "Реакции игрока включены")


func _add_friend() -> void:
	online_events.ev_add_friend.emit(str(_view.seat(_player_seat).get("id", "")))
	player_dialog.close()


func _report(reason: String) -> void:
	report_dialog.close()
	online_events.ev_report.emit(str(_view.seat(_player_seat).get("id", "")), reason)


func _block_player() -> void:
	player_dialog.close()
	online_events.ev_block.emit(str(_view.seat(_player_seat).get("id", "")))


func _open_leave() -> void:
	menu_dialog.close()
	var body := "Бот займёт ваше место до конца партии."
	if _view.fee() > 0:
		body = "Взнос сгорает. Бот доиграет без выплаты выигрыша."
	elif _view.kind() == "lesson":
		body = "Учебную раздачу можно пройти позже из аккаунта."
	leave_dialog.open_dialog("Покинуть стол?", body, "Остаться", "Покинуть стол")


func _leave_table() -> void:
	leave_dialog.close()
	_log.info("leave", {"phase": _view.phase()})
	match_events.ev_leave.emit("friends" if _view.kind() == "friends" else "")


func _round_title() -> String:
	var me := _view.seat(_view.me())
	var out: Array = _view.result().get("out", [])
	var title := "Вы выбыли" if out.has(float(_view.me())) or out.has(_view.me()) else "Раздача %d" % int(_view.data.get("deal_no", 0))
	if not bool(me.get("alive", true)) and not out.has(float(_view.me())):
		title = "Наблюдение · раздача %d" % int(_view.data.get("deal_no", 0))
	return "%s · дальше через %d с" % [title, int(ceilf(_next_left))]


func _open_round() -> void:
	var v := _view
	var res := v.result()
	_next_left = float(v.data.get("next_left", 0))
	for child in round_list.get_children():
		child.queue_free()
	var standings: Array = res.get("standings", [])
	var out: Array = res.get("out", [])
	for i in standings.size():
		var s: Dictionary = standings[i]
		var seat := int(s.get("seat", -1))
		var line := line_scene.instantiate() as ListLine
		round_list.add_child(line)
		var gone := out.has(float(seat)) or out.has(seat)
		line.setup("%d. %s" % [i + 1, v.seat_name(seat)], "−%d%s" % [int(s.get("minus", 0)), " · выбыл" if gone else ""])
	var alive := bool(v.seat(v.me()).get("alive", true))
	var ready := bool(v.seat(v.me()).get("ready", false))
	var deal_no := int(v.data.get("deal_no", 0))
	var primary := "Следующая раздача"
	if not alive:
		primary = "Наблюдать за следующей раздачей"
	elif ready or _round_ready_sent == deal_no:
		primary = "Ждём остальных…"
	round_dialog.open_dialog(_round_title(), "Все 13 номиналов собраны. Выбывают все, у кого больше всего минусов.", primary, "На главную" if not alive else "")
	round_dialog.primary_button.disabled = alive and (ready or _round_ready_sent == deal_no)


func _on_round_primary() -> void:
	var v := _view
	if bool(v.seat(v.me()).get("alive", true)):
		_round_ready_sent = int(v.data.get("deal_no", 0))
		match_events.ev_intent.emit(MatchOps.NEXT, {})
		round_dialog.primary_button.disabled = true
		round_dialog.primary_button.text = "Ждём остальных…"
	else:
		round_dialog.hide()


# ------------------------------------------------------------------ misc

func _on_error(code: String) -> void:
	if code == "offline":
		return
	online_events.ev_toast.emit(MatchOps.error_text(code))


func _on_connection(online: bool) -> void:
	if online:
		offline_dialog.hide()
	else:
		offline_dialog.open_dialog("Связь потеряна", "Возвращаемся к столу. Пока вас нет, за вас ходит бот.")


func _update_wide() -> void:
	var wide := get_viewport().get_visible_rect().size.x >= wide_px
	side_left.visible = wide
	side_right.visible = wide
	if wide:
		_render_side()
