extends SceneTree

## Live smoke run against a local server (not part of the headless suite):
##   godot --path . --script res://tests/e2e/play_smoke.gd -- --shots=<dir>
## Boots the app, opens a friends room, adds three bots, plays a whole quick game by pressing the
## real buttons (check / declare), takes screenshots, then the lesson and a public search.
## Server: online_local.tres or BLUFF_NAKAMA_* env vars. Faster bots: BC_BOT_DELAY_SCALE in local.yml.

const MAX_SEC := 600.0

var _shots_dir := "user://shots"
## --series: the friends room plays «На вылет» with two bots (interlude + elimination) and stops there.
var _series := false
## --skip-friends: only the lesson and the public search (fast check).
var _skip_friends := false
var _main: Node
var _shot_index := 0
var _started_ms := 0


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shots="):
			_shots_dir = arg.trim_prefix("--shots=")
		if arg == "--series":
			_series = true
		if arg == "--skip-friends":
			_skip_friends = true
	DirAccess.make_dir_recursive_absolute(_shots_dir)
	_run()


func _run() -> void:
	_started_ms = Time.get_ticks_msec()
	DisplayServer.window_set_size(Vector2i(540, 960))
	_main = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(_main)
	current_scene = _main
	var profile := load("res://src/common/player_profile.tres") as PlayerProfile
	var view := load("res://src/common/table_view.tres") as TableView
	var lobby := await _wait_scene("Lobby")
	await _wait(func() -> bool: return profile.signed_in, "sign in")
	await _frames(20)
	_shot("lobby")
	print("[e2e] signed in balance=", profile.balance)

	if not _skip_friends:
		await _friends_game(lobby, view)
		if _series:
			return

	# Lesson: «Как играть» → check Маша's claim → «Миссия пройдена».
	lobby = await _wait_scene("Lobby")
	await _frames(10)
	(lobby.get("app_bar") as AppBar).help_button.pressed.emit()
	var table := await _wait_scene("Table")
	await _wait(func() -> bool: return view.kind() == "lesson" and view.is_my_turn(), "lesson turn")
	await _frames(30)
	(table.get("check_button") as Button).pressed.emit()
	await _frames(5)
	_shot("lesson_check")
	var trick := table.get("trick") as TrickView
	(trick.backs.get_child(1) as CardBack).pressed.emit()
	await _wait(func() -> bool: return view.deal_phase() == "reveal", "lesson reveal")
	await _frames(40)
	_shot("lesson_reveal")
	await _wait(func() -> bool: return (table.get("lesson_dialog") as ModalDialog).visible, "lesson done")
	await _frames(10)
	_shot("lesson_done")
	(table.get("lesson_dialog") as ModalDialog).primary_button.pressed.emit()

	# Public quick table: search, then bots fill the seats after 20 s.
	lobby = await _wait_scene("Lobby")
	(lobby.get("home_window") as HomeWindow).quick_button.pressed.emit()
	await _wait_scene("Search")
	await _frames(60)
	_shot("search")
	table = await _wait_scene("Table", 40.0)
	await _frames(60)
	_shot("public_table")
	print("[e2e] public table seats=", view.seats().size())
	print("[e2e] OK in %.1f s" % ((Time.get_ticks_msec() - _started_ms) / 1000.0))
	quit(0)


## Friends room with three bots (two in --series) → a whole game played through the table buttons.
func _friends_game(lobby: Node, view: TableView) -> void:
	(lobby.get("friends_window") as FriendsWindow).main_button.pressed.emit()
	var room := await _wait_scene("Room")
	await _wait(func() -> bool: return view.phase() == "waiting" and view.seats().size() >= 1, "room view")
	if _series:
		(room.get("mode_tabs") as Segmented).ev_selected.emit(1)
		await _wait(func() -> bool: return view.mode() == "series", "series mode")
	for i in (2 if _series else 3):
		(room.get("add_bot_button") as Button).pressed.emit()
		var want := i + 2
		await _wait(func() -> bool: return view.seats().size() >= want, "bot %d" % (i + 1))
	await _frames(10)
	_shot("room")
	(room.get("start_button") as Button).pressed.emit()
	var table := await _wait_scene("Table")
	await _frames(30)
	_shot("table_start")
	await _play_until_done(table, view)
	var result := await _wait_scene("Result", 60.0)
	await _frames(20)
	_shot("result")
	print("[e2e] friends game finished placements=", view.result().get("placements", []))
	if _series:
		print("[e2e] OK series in %.1f s" % ((Time.get_ticks_msec() - _started_ms) / 1000.0))
		quit(0)
		return
	(result.get("home_button") as Button).pressed.emit()


func _play_until_done(table: Node, view: TableView) -> void:
	var moves := 0
	var shot_check := false
	var shot_reveal := false
	while view.phase() == "playing" or view.phase() == "interlude":
		_guard()
		await _frames(6)
		if not is_instance_valid(table) or not table.is_inside_tree():
			break
		if table.get("_busy"):
			continue
		if view.phase() == "interlude":
			var round_dialog := table.get("round_dialog") as ModalDialog
			if round_dialog.visible and not round_dialog.primary_button.disabled:
				await _frames(20)
				_shot("interlude")
				round_dialog.primary_button.pressed.emit()
			continue
		if view.deal_phase() == "reveal" and not shot_reveal:
			shot_reveal = true
			await _frames(30)
			_shot("reveal")
		if not view.is_my_turn():
			continue
		moves += 1
		if view.deal_phase() == "reply":
			(table.get("check_button") as Button).pressed.emit()
			await _frames(3)
			if not shot_check:
				shot_check = true
				_shot("check_pick")
			var trick := table.get("trick") as TrickView
			if trick.backs.get_child_count() > 0:
				(trick.backs.get_child(0) as CardBack).pressed.emit()
		elif view.deal_phase() == "open":
			var hand := table.get("hand") as HandView
			var card := view.hand()[0]
			hand.setup(view.hand(), true, [card])
			hand.ev_selection_changed.emit([card])
			var picker := table.get("picker") as RankRow
			picker.ev_rank_pressed.emit(Cards.rank_of(card))
			await _frames(2)
			if moves < 4:
				_shot("declare_%d" % moves)
			(table.get("declare_button") as Button).pressed.emit()
		var before := str(view.data.get("deal", {}))
		await _wait(func() -> bool: return str(view.data.get("deal", {})) != before or view.phase() != "playing", "move %d accepted" % moves, 10.0)
	print("[e2e] my moves: ", moves)


func _wait_scene(state: String, timeout_sec: float = 30.0) -> Node:
	var found := func() -> Node:
		var hfsm: HFSM = _main.get_hfsm()
		var node: Node = hfsm.get_mounted_scene(state) if hfsm != null else null
		return node if node != null and node.is_inside_tree() else null
	await _wait(func() -> bool: return found.call() != null, "scene " + state, timeout_sec)
	return found.call()


func _wait(cond: Callable, what: String, timeout_sec: float = 30.0) -> void:
	var start := Time.get_ticks_msec()
	while not cond.call():
		_guard()
		if Time.get_ticks_msec() - start > timeout_sec * 1000.0:
			printerr("[e2e] TIMEOUT waiting for ", what)
			_shot("timeout")
			quit(1)
			await create_timer(10.0).timeout
		await process_frame


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _guard() -> void:
	if Time.get_ticks_msec() - _started_ms > MAX_SEC * 1000.0:
		printerr("[e2e] overall timeout")
		quit(1)


func _shot(name: String) -> void:
	_shot_index += 1
	var path := _shots_dir.path_join("%02d_%s.png" % [_shot_index, name])
	root.get_texture().get_image().save_png(path)
	print("[e2e] shot ", path)
