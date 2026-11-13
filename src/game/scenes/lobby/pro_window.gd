class_name ProWindow
extends Control

## «Клуб профессионалов»: series to one winner on six seats; the bank = six entry fees.

signal ev_fee_chosen(fee: int)

@export var list: VBoxContainer
@export var row_scene: PackedScene
@export var seats: int = 6


func setup(fees: Array[int], balance: int) -> void:
	for child in list.get_children():
		child.queue_free()
	for fee in fees:
		var row := row_scene.instantiate() as Tile
		list.add_child(row)
		var enough := balance >= fee
		row.setup(str(fee), "Взнос %s" % Cards.chips(fee), "Банк %s фишек · %d мест" % [Cards.chips(fee * seats), seats],
			"Войти →" if enough else "Мало фишек")
		row.disabled = not enough
		row.ev_tile_pressed.connect(func(key: String) -> void: ev_fee_chosen.emit(int(key)))
