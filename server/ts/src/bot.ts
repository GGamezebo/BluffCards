// Server bots (concept/tech.md «Боты»): they see only what a human in their seat would see —
// their own hand, packet / pile sizes, the claim, open minuses and the cards revealed so far.
// Same strength on free and paid tables; styles only change the taste for risk.

interface BotStyle {
  id: string;
  /** Base wish to say «Не верю». */
  suspicion: number;
  /** Chance to pad an honest packet with extra cards. */
  padding: number;
  /** Chance to claim a rank they do not hold when opening. */
  pureBluff: number;
  /** How much a big pile scares them away from checking. */
  pileFear: number;
}

var BOT_STYLES: BotStyle[] = [
  {id: 'careful', suspicion: 0.3, padding: 0.12, pureBluff: 0.05, pileFear: 0.02},
  {id: 'bold', suspicion: 0.22, padding: 0.45, pureBluff: 0.2, pileFear: 0.008},
  {id: 'detective', suspicion: 0.42, padding: 0.25, pureBluff: 0.1, pileFear: 0.012},
];

interface BotView {
  hand: number[];
  phase: string; // open | reply
  claim: number;
  packetSize: number;
  pileSize: number;
  mandatory: boolean;
  dead: number[];
}

interface BotDecision {
  kind: string; // play | check
  cards: number[];
  rank: number;
  pick: number;
}

function botCounts(hand: number[]): number[] {
  var counts: number[] = [];
  for (var r = 0; r < RANK_COUNT; r++) counts.push(0);
  for (var i = 0; i < hand.length; i++) counts[rankOf(hand[i])]++;
  return counts;
}

/** Cards to get rid of first: ranks with the most copies (they become a minus once the 4th arrives). */
function botJunk(hand: number[], exclude: number, howMany: number, rng: Rng): number[] {
  var counts = botCounts(hand);
  var pool = hand.filter(function (c) { return rankOf(c) !== exclude; });
  pool = shuffled(pool, rng);
  pool.sort(function (a, b) { return counts[rankOf(b)] - counts[rankOf(a)]; });
  return pool.slice(0, Math.max(0, Math.min(howMany, pool.length)));
}

function botDecide(view: BotView, style: BotStyle, rng: Rng): BotDecision {
  var counts = botCounts(view.hand);
  if (view.phase === 'reply') {
    if (view.mandatory || view.hand.length === 0) {
      return {kind: 'check', cards: [], rank: -1, pick: randInt(rng, view.packetSize)};
    }
    // Copies of the claimed rank outside my hand; more claimed than that means a lie is in the packet.
    var possible = 4 - counts[view.claim];
    var sureLie = view.packetSize > possible ? (view.packetSize - possible) / view.packetSize : 0;
    var chance = style.suspicion + 0.7 * sureLie + 0.05 * (view.packetSize - 1) - style.pileFear * view.pileSize;
    if (counts[view.claim] === 0 && view.hand.length <= 2) chance += 0.15;
    chance = Math.max(0.05, Math.min(0.95, chance));
    if (rng.next() < chance) {
      return {kind: 'check', cards: [], rank: -1, pick: randInt(rng, view.packetSize)};
    }
    var honest = view.hand.filter(function (c) { return rankOf(c) === view.claim; });
    var cards = honest.slice();
    if (cards.length === 0 || rng.next() < style.padding) {
      var extra = 1 + (rng.next() < 0.35 ? 1 : 0);
      cards = cards.concat(botJunk(view.hand, view.claim, extra, rng));
    }
    if (cards.length === 0) cards = [view.hand[0]];
    return {kind: 'play', cards: cards, rank: view.claim, pick: -1};
  }

  // Opening a round: dump the rank with the most copies (honest), sometimes padded or a pure bluff.
  var best = -1;
  for (var r = 0; r < RANK_COUNT; r++) {
    if (counts[r] > 0 && view.dead.indexOf(r) < 0 && (best < 0 || counts[r] > counts[best])) best = r;
  }
  if (best < 0) best = rankOf(view.hand[0]);
  var rank = best;
  var openCards = view.hand.filter(function (c) { return rankOf(c) === best; });
  if (rng.next() < style.pureBluff) {
    var alive: number[] = [];
    for (var q = 0; q < RANK_COUNT; q++) if (view.dead.indexOf(q) < 0 && counts[q] === 0) alive.push(q);
    if (alive.length > 0) {
      rank = alive[randInt(rng, alive.length)];
      openCards = botJunk(view.hand, -1, 1 + randInt(rng, 2), rng);
    }
  } else if (rng.next() < style.padding && openCards.length < view.hand.length) {
    openCards = openCards.concat(botJunk(view.hand, best, 1, rng));
  }
  return {kind: 'play', cards: openCards, rank: rank, pick: -1};
}

/** Bot view of the current turn of a deal (no peeking at other hands or the deck). */
function botViewOf(deal: Deal, index: number): BotView {
  return {
    hand: deal.players[index].hand.slice(),
    phase: deal.phase,
    claim: deal.rank,
    packetSize: deal.packet.length,
    pileSize: deal.pile.length,
    mandatory: deal.mandatory(),
    dead: deal.dead(),
  };
}

/** Apply a bot decision for the current actor; falls back to the safest legal move. */
function botAct(deal: Deal, style: BotStyle, rng: Rng): void {
  var index = deal.actor;
  var d = botDecide(botViewOf(deal, index), style, rng);
  var err = d.kind === 'check' ? deal.check(index, d.pick) : deal.play(index, d.cards, d.rank);
  if (err === '') return;
  if (deal.phase === 'reply') {
    deal.check(index, 0);
  } else {
    var hand = deal.players[index].hand;
    deal.play(index, [hand[0]], rankOf(hand[0]));
  }
}
