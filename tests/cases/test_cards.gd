extends TestCase

## Russian wording of claims and counts (presentation only).


func test_claim_text() -> void:
	expect_eq(Cards.claim_text(11, 3), "Три короля", "three kings")
	expect_eq(Cards.claim_text(10, 1), "Одна дама", "one queen (feminine)")
	expect_eq(Cards.claim_text(12, 2), "Два туза", "two aces")
	expect_eq(Cards.claim_text(0, 2), "Две двойки", "two twos (feminine)")
	expect_eq(Cards.claim_text(12, 7), "7 тузов", "seven aces")
	expect_eq(Cards.claim_text(9, 21), "21 валет", "21 jacks")
	expect_eq(Cards.claim_text(9, 22), "22 валета", "22 jacks")


func test_card_ids() -> void:
	expect_eq(Cards.label(Cards.rank_of(44)), "К", "44 is a king")
	expect_eq(Cards.label(Cards.rank_of(0)), "2", "0 is a two")
	expect(Cards.is_red(21), "21 is ♦")
	expect(not Cards.is_red(44), "44 is ♣")
	expect_eq(Cards.cards_word(5), "5 карт", "5 cards")
	expect_eq(Cards.cards_word(22), "22 карты", "22 cards")
	expect_eq(Cards.chips(98520), "98 520", "chips spacing")
