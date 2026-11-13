extends TestCase

## Every screen runs alone (F6) on its demo view (rule: scenes start without HFSM / parent).


func _run_scene(path: String) -> Node:
	var node := (load(path) as PackedScene).instantiate()
	tree.root.add_child(node)
	tree.current_scene = node
	# IScene._ready initializes isolated runs; it ran before current_scene was set, so do it here.
	(node as IScene).initialize((node as IScene)._default_data())
	await tree.process_frame
	await tree.process_frame
	return node


func _close(node: Node) -> void:
	(node as IScene).deinit()
	node.queue_free()
	await tree.process_frame


func test_table_demo() -> void:
	var node := await _run_scene("res://src/game/scenes/table/table.tscn")
	var hand := node.get("hand") as HandView
	expect_eq(hand.fan.get_child_count(), 7, "seven cards in the fan")
	var trick := node.get("trick") as TrickView
	expect_eq(trick.claim_label.text, "Три короля", "claim text")
	expect((node.get("check_button") as Button).visible, "«Не верю» shown on my reply")
	expect((node.get("transfer_button") as Button).visible, "«Перевести» shown on my reply")
	expect_eq((node.get("seats_layer") as Control).get_child_count(), 3, "three opponents at the felt")
	# «Не верю» → the packet spreads into three pickable backs.
	(node.get("check_button") as Button).pressed.emit()
	await tree.process_frame
	expect_eq(trick.backs.get_child_count(), 3, "packet spread for the check")
	# Series: my seat is out of the series → «Вы выбыли» with a way home.
	var view: Dictionary = (node.get("demo_view") as TableView).data.duplicate(true)
	view["mode"] = "series"
	view["seats"][0]["alive"] = false
	view["deal"]["actor"] = 1
	var events := load("res://src/game/scenes/match_session/match_events.tres") as MatchEvents
	events.ev_view.emit(view, [])
	await tree.process_frame
	var watch := node.get("watch_dialog") as ModalDialog
	expect(watch.visible, "eliminated dialog shown")
	expect_eq(watch.title_label.text, "Вы выбыли", "eliminated title")
	expect(watch.secondary_button.visible, "«На главную» offered")
	await _close(node)


func test_lobby_search_room_result() -> void:
	var lobby := await _run_scene("res://src/game/scenes/lobby/lobby.tscn")
	expect((lobby.get("home_window") as Control).visible, "home window open")
	await _close(lobby)
	var search := await _run_scene("res://src/game/scenes/search/search.tscn")
	expect_eq((search.get("seats_box") as Container).get_child_count(), 6, "six seats while searching")
	await _close(search)
	var room := await _run_scene("res://src/game/scenes/room/room.tscn")
	expect_eq((room.get("seats_box") as Container).get_child_count(), 4, "four room seats")
	expect((room.get("start_button") as Button).visible, "host sees «Начать»")
	await _close(room)
	var result := await _run_scene("res://src/game/scenes/result/result.tscn")
	expect_eq((result.get("winner_names") as Label).text, "Маша", "winner name")
	await _close(result)
