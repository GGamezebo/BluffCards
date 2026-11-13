// Scenario tests for the rules (concept/rules.md) and bot-vs-bot runs.
// Run: npm test (compiles src + this file into build/test.js and runs it with node).

declare var process: {exit(code: number): void};
declare var console: {log(...args: any[]): void};

var checks = 0;
var failures: string[] = [];
var current = '';

function expect(cond: boolean, msg: string): void {
  checks++;
  if (!cond) failures.push(current + ': ' + msg);
}

function expectEq(actual: any, expected: any, msg: string): void {
  checks++;
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) failures.push(current + ': ' + msg + ' (got ' + a + ', expected ' + e + ')');
}

function test(name: string, fn: () => void): void {
  current = name;
  try {
    fn();
  } catch (e) {
    failures.push(name + ': threw ' + e);
  }
}

function cardsInPlay(d: Deal): number {
  var n = d.deck.length + d.pile.length;
  for (var i = 0; i < d.players.length; i++) n += d.players[i].hand.length + d.players[i].minus.length * 4;
  return n;
}

/** Deal with hand-made hands: everything not in a hand / the pile goes to the deck. */
function scripted(hands: number[][], deck?: number[]): Deal {
  var seats: number[] = [];
  for (var i = 0; i < hands.length; i++) seats.push(i);
  var d = new Deal(seats, 0, makeRng(1));
  var used: number[] = [];
  for (var p = 0; p < hands.length; p++) {
    d.players[p].hand = hands[p].slice();
    d.players[p].minus = [];
    used = used.concat(hands[p]);
  }
  d.deck = deck ? deck.slice() : fullDeck().filter(function (c) { return used.indexOf(c) < 0; });
  d.actor = 0;
  d.opener = 0;
  d.takeEvents();
  return d;
}

/** Card of `rank` with suit `s`. */
function c(rank: number, s: number): number {
  return rank * 4 + s;
}

test('hand size depends on players', function () {
  for (var n = 2; n <= 10; n++) {
    var seats: number[] = [];
    for (var i = 0; i < n; i++) seats.push(i);
    var d = new Deal(seats, 0, makeRng(n));
    expectEq(d.handSize, n <= 4 ? 7 : 5, 'hand size for ' + n);
    for (var p = 0; p < n; p++) expectEq(d.players[p].hand.length, d.handSize, 'full hand p' + p + ' n' + n);
    expectEq(cardsInPlay(d), 52, 'all cards accounted n' + n);
  }
});

test('opening validates rank and cards', function () {
  var d = scripted([[c(0, 0), c(1, 0)], [c(2, 0), c(3, 0)]], []);
  expectEq(d.play(1, [c(2, 0)], 2), 'not_your_turn', 'only actor');
  expectEq(d.play(0, [], 0), 'no_cards', 'needs cards');
  expectEq(d.play(0, [c(0, 0), c(0, 0)], 0), 'duplicate_card', 'unique cards');
  expectEq(d.play(0, [c(5, 0)], 0), 'card_not_in_hand', 'own cards');
  expectEq(d.play(0, [c(0, 0)], 13), 'bad_rank', 'rank range');
  d.players[1].minus = [7];
  expectEq(d.play(0, [c(0, 0)], 7), 'dead_rank', 'collected rank is closed');
  expectEq(d.play(0, [c(0, 0)], 4), '', 'bluff allowed');
  expectEq(d.phase, 'reply', 'reply phase');
  expectEq(d.actor, 1, 'next player answers');
  expectEq(d.rank, 4, 'claim kept');
});

test('transfer keeps the claim; last cards force a check', function () {
  var d = scripted([[c(0, 0), c(1, 0)], [c(2, 0)], [c(3, 0), c(4, 0)]], []);
  d.play(0, [c(0, 0)], 9);
  expectEq(d.play(1, [c(2, 0)], 3), '', 'transfer');
  expectEq(d.rank, 9, 'claim unchanged by transfer');
  expect(d.mandatory(), 'player 1 has no cards left → mandatory check');
  expectEq(d.play(2, [c(3, 0)], 9), 'must_check', 'no transfer after last cards');
  expectEq(d.check(2, 0), '', 'check allowed');
});

test('caught lie: liar takes the pile, checker opens', function () {
  var d = scripted([[c(0, 0), c(0, 1), c(5, 0)], [c(2, 0), c(6, 0)], [c(3, 0), c(7, 0)]], []);
  d.play(0, [c(0, 0), c(5, 0)], 0); // one true «2», one lie
  d.check(1, 1);
  expect(d.reveal !== null && !d.reveal.truth, 'lie revealed');
  d.settle();
  expectEq(d.players[0].hand.length, 3, 'liar got the pile back');
  expectEq(d.actor, 1, 'checker opens the next round');
  expectEq(d.phase, 'open', 'new round');
});

test('truth: checker takes the pile, next after checker opens', function () {
  var d = scripted([[c(0, 0), c(0, 1), c(5, 0)], [c(2, 0), c(6, 0)], [c(3, 0), c(7, 0)]], []);
  d.play(0, [c(0, 0), c(5, 0)], 0);
  d.check(1, 0);
  expect(d.reveal !== null && d.reveal.truth, 'truth revealed');
  d.settle();
  expectEq(d.players[1].hand.length, 4, 'checker took the pile');
  expectEq(d.actor, 2, 'next after the checker opens');
});

test('draw starts with the opener of the finished round', function () {
  var d = scripted([[c(0, 0), c(1, 0)], [c(2, 0), c(3, 0)], [c(4, 0), c(5, 0)]],
    [c(9, 0), c(9, 1), c(10, 0), c(10, 1), c(11, 0), c(11, 1)]);
  d.handSize = 2;
  d.actor = 1;
  d.opener = 1;
  d.play(1, [c(2, 0)], 2);
  d.check(2, 0); // truth: player 2 takes 1 card → 3 cards, no draw
  d.settle();
  var draws = d.takeEvents().filter(function (e) { return e.t === 'draw'; });
  expectEq(draws.length, 1, 'only player 1 was short');
  expectEq(draws[0].seat, 1, 'opener draws first');
  expectEq(d.players[1].hand.length, 2, 'refilled to hand size');
  expectEq(d.players[2].hand.length, 3, 'over hand size: no draw');
});

test('fours burn from the pile and during the draw', function () {
  var d = scripted([[c(8, 0), c(8, 1), c(8, 2), c(1, 0)], [c(8, 3), c(2, 0)], [c(3, 0), c(4, 0)]], []);
  d.play(0, [c(1, 0)], 8); // lie
  d.check(1, 0);
  d.settle(); // player 0 takes back the lie, still 3 eights
  expectEq(d.players[0].minus.length, 0, 'no four yet');
  d.actor = 1;
  d.opener = 1;
  d.play(1, [c(8, 3)], 8);
  d.check(2, 0); // truth → player 2 takes the eight
  d.settle();
  expectEq(d.players[2].minus.length, 0, 'one eight is not a four');
  // Deck top is the last element: player 0 draws four sixes, they burn, then 7♣ fills the hand.
  var e = scripted([[c(1, 0)], [c(2, 0)]], [c(7, 0), c(6, 0), c(6, 1), c(6, 2), c(6, 3)]);
  e.handSize = 4;
  e.play(0, [c(1, 0)], 1);
  e.check(1, 0);
  e.settle(); // truth: checker takes the card; opener 0 draws first
  expectEq(e.players[0].minus, [6], 'drawn four burns at once');
  expectEq(e.players[0].hand, [c(7, 0)], 'keeps drawing after the burn');
  expectEq(cardsInPlay(e), 7, 'cards conserved');
});

test('leaving the deal with the last cards when the deck is empty', function () {
  var d = scripted([[c(0, 0)], [c(1, 0), c(1, 1)], [c(2, 0), c(2, 1)]], []);
  d.play(0, [c(0, 0)], 0); // true
  expect(d.mandatory(), 'mandatory');
  d.check(1, 0);
  d.settle();
  expectEq(d.players[0].exit, 1, 'player 0 is out first');
  expectEq(d.actor, 2, 'turn skips the player who left');
});

test('bot deals always end and keep invariants', function () {
  var rng = makeRng(2024);
  var longest = 0;
  for (var run = 0; run < 3000; run++) {
    var n = 2 + (run % 9);
    var seats: number[] = [];
    for (var i = 0; i < n; i++) seats.push(i);
    var d = new Deal(seats, randInt(rng, n), rng);
    var steps = 0;
    while (d.phase !== 'done' && steps < 20000) {
      steps++;
      if (d.phase === 'reveal') d.settle();
      else botAct(d, BOT_STYLES[(d.actor + run) % BOT_STYLES.length], rng);
      if (cardsInPlay(d) !== 52) {
        expect(false, 'cards lost in run ' + run);
        break;
      }
    }
    longest = Math.max(longest, d.rounds);
    expectEq(d.phase, 'done', 'deal ended (run ' + run + ')');
    expectEq(d.dead().length, 13, 'all 13 fours collected');
    var exits = d.players.map(function (p) { return p.exit; }).sort(function (a, b) { return a - b; });
    var distinct = exits.filter(function (x, k) { return exits.indexOf(x) === k; }).length;
    expectEq(distinct, n, 'distinct exit order');
  }
  console.log('[rules] longest bot deal: ' + longest + ' rounds');
});

test('series eliminates the worst until one winner', function () {
  var rng = makeRng(7);
  var s = new Series('series', [0, 1, 2, 3, 4, 5]);
  var firstSeats: number[] = [];
  var guard = 0;
  while (!s.isOver() && guard++ < 50) {
    var d = s.nextDeal(rng);
    firstSeats.push(s.firstSeat);
    while (d.phase !== 'done') {
      if (d.phase === 'reveal') d.settle();
      else botAct(d, BOT_STYLES[0], rng);
    }
    var res = s.finishDeal(d);
    expect(res.out.length > 0, 'someone leaves after each deal');
  }
  expectEq(s.alive.length, 1, 'one winner');
  var flat = s.placements().reduce(function (a: number[], g: number[]) { return a.concat(g); }, []);
  expectEq(flat.slice().sort(), [0, 1, 2, 3, 4, 5], 'every seat placed once');
  for (var k = 1; k < firstSeats.length; k++) expect(firstSeats[k] !== firstSeats[k - 1], 'starter moves on');
});

test('quick game places by minuses then exit order', function () {
  var s = new Series('quick', [0, 1, 2, 3]);
  var d = s.nextDeal(makeRng(3));
  d.players[0].minus = [0, 1, 2, 3];
  d.players[1].minus = [4, 5, 6];
  d.players[2].minus = [7, 8, 9];
  d.players[3].minus = [10, 11, 12];
  d.players[0].exit = 1;
  d.players[1].exit = 4;
  d.players[2].exit = 2;
  d.players[3].exit = 3;
  s.finishDeal(d);
  expectEq(s.placements(), [[2], [3], [1], [0]], 'fewer minuses, then earlier exit');
  expect(s.isOver(), 'quick game is one deal');
});

test('prizes: free, paid, ties, friends', function () {
  expectEq(prizesFor([[2], [0], [1], [3]], 'public', 'quick', 0), {2: 30, 0: 15, 1: 5, 3: 5}, 'free quick');
  var paid = prizesFor([[4], [1, 2], [0], [3], [5]], 'public', 'series', 100);
  expectEq(paid[4], 330, 'paid first = 55% of 600');
  expectEq(paid[1] + paid[2], 180 + 90, 'tie shares 2nd and 3rd');
  expectEq(paid[0] || 0, 0, '4th gets nothing');
  expectEq(prizesFor([[0], [1]], 'friends', 'quick', 0), {0: 0, 1: 0}, 'friends play for free');
  expectEq(placeOf([[4], [1, 2], [0]], 2), 2, 'shared place');
});

for (var f = 0; f < failures.length; f++) console.log('[FAIL] ' + failures[f]);
console.log('[rules] ' + checks + ' checks, ' + failures.length + ' failures');
if (failures.length > 0) process.exit(1);
