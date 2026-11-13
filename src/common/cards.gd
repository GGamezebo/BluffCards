class_name Cards
extends RefCounted

## Card ids and Russian wording (presentation only — the server owns the rules).
## Card = 0..51, rank = card / 4 (0 «2» … 12 «Т»), suit = card % 4 (♣ ♦ ♥ ♠).

const RANK_COUNT := 13
const LABELS: Array[String] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "В", "Д", "К", "Т"]
## Suits 1 (♦) and 2 (♥) are red.
const RED_SUITS: Array[int] = [1, 2]
## [nominative singular, genitive singular, genitive plural, feminine]
const NOUNS: Array = [
	["двойка", "двойки", "двоек", true],
	["тройка", "тройки", "троек", true],
	["четвёрка", "четвёрки", "четвёрок", true],
	["пятёрка", "пятёрки", "пятёрок", true],
	["шестёрка", "шестёрки", "шестёрок", true],
	["семёрка", "семёрки", "семёрок", true],
	["восьмёрка", "восьмёрки", "восьмёрок", true],
	["девятка", "девятки", "девяток", true],
	["десятка", "десятки", "десяток", true],
	["валет", "валета", "валетов", false],
	["дама", "дамы", "дам", true],
	["король", "короля", "королей", false],
	["туз", "туза", "тузов", false],
]
const SMALL_COUNTS := {1: ["Один", "Одна"], 2: ["Два", "Две"], 3: ["Три", "Три"], 4: ["Четыре", "Четыре"]}


static func rank_of(card: int) -> int:
	return card / 4


static func suit_of(card: int) -> int:
	return card % 4


static func is_red(card: int) -> bool:
	return RED_SUITS.has(suit_of(card))


static func label(rank: int) -> String:
	return LABELS[rank] if rank >= 0 and rank < RANK_COUNT else "?"


## «Три короля», «Одна дама», «7 тузов».
static func claim_text(rank: int, count: int) -> String:
	if rank < 0 or rank >= RANK_COUNT:
		return ""
	var noun: Array = NOUNS[rank]
	if SMALL_COUNTS.has(count):
		var word: String = SMALL_COUNTS[count][1 if noun[3] else 0]
		return "%s %s" % [word, noun[0] if count == 1 else noun[1]]
	return "%d %s" % [count, noun_for(rank, count)]


## Noun agreeing with a number: 1 король, 2 короля, 5 королей, 21 король.
static func noun_for(rank: int, count: int) -> String:
	var noun: Array = NOUNS[rank]
	var n10 := count % 10
	var n100 := count % 100
	if n10 == 1 and n100 != 11:
		return noun[0]
	if n10 >= 2 and n10 <= 4 and (n100 < 12 or n100 > 14):
		return noun[1]
	return noun[2]


## Genitive plural for «Четвёрка королей».
static func plural(rank: int) -> String:
	return NOUNS[rank][2] if rank >= 0 and rank < RANK_COUNT else ""


## «5 карт», «2 карты», «1 карта».
static func cards_word(count: int) -> String:
	var n10 := count % 10
	var n100 := count % 100
	if n10 == 1 and n100 != 11:
		return "%d карта" % count
	if n10 >= 2 and n10 <= 4 and (n100 < 12 or n100 > 14):
		return "%d карты" % count
	return "%d карт" % count


static func chips(amount: int) -> String:
	var text := str(absi(amount))
	var out := ""
	while text.length() > 3:
		out = " " + text.right(3) + out
		text = text.left(text.length() - 3)
	return ("-" if amount < 0 else "") + text + out
