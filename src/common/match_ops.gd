class_name MatchOps
extends RefCounted

## Opcodes of the table match (mirror of server/ts/src/match.ts).

# client → server
const PLAY := 1
const CHECK := 2
const REACT := 3
const BACK := 4
const LEAVE := 5
const CONFIG := 6
const ADD_BOT := 7
const START := 8
const RESPECT := 9
const AGAIN := 10
const NEXT := 11
const REMOVE_BOT := 12
# server → client
const VIEW := 100
const REACTION := 101
const ERROR := 102

## Reaction ids by kind (server checks the ranges).
const PHRASES: Array[String] = ["Верю-верю…", "Ну-ну", "Проверяй, не бойся", "Чистая правда!", "Блефуешь!", "Ой, зря", "Быстрее!", "Хорошая игра"]
const EMOJI_COUNT := 8
const THROW_COUNT := 5

## Server error codes → text for the player.
const ERRORS := {
	"not_your_turn": "Сейчас ход другого игрока",
	"must_check": "Последние карты — проверка обязательна",
	"dead_rank": "Этот номинал уже собран",
	"reaction_rate": "Небольшая пауза между реакциями",
	"not_enough_chips": "Не хватает фишек на взнос",
	"table_full": "Стол уже заполнен",
	"room_full": "Все места заняты",
	"need_players": "Нужно хотя бы два игрока",
	"not_host": "Это может только хозяин комнаты",
	"lesson_check_only": "В учебной раздаче проверь заявку",
	"away": "Сначала нажми «Я тут»",
}


static func error_text(code: String) -> String:
	return ERRORS.get(code, "Ход не принят")
