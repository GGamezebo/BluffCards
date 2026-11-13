extends TestCase

## Reaction ids map to the free set (8 phrases, 8 emotions, 5 throws) like the server ranges.


func test_reaction_set() -> void:
	var set := load("res://src/game/scenes/table/reaction_set.tres") as ReactionSet
	expect_eq(set.phrases.size(), 8, "eight phrases")
	expect_eq(set.emoji.size(), MatchOps.EMOJI_COUNT, "eight emotions")
	expect_eq(set.throws.size(), MatchOps.THROW_COUNT, "five throws")
	expect_eq(set.text("phrase", 4), "Блефуешь!", "phrase id 4")
	expect(set.icon("emoji", 2) != null, "emoji icon")
	expect(set.icon("throw", 0) != null, "throw icon")
	expect(set.icon("phrase", 0) == null, "phrases have no icon")
	expect(set.icon("emoji", 99) == null, "out of range")
	for i in MatchOps.PHRASES.size():
		expect_eq(set.phrases[i], MatchOps.PHRASES[i], "phrase %d matches MatchOps" % i)
