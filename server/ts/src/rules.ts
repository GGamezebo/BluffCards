// BluffCards rules: one deal («партия») and the table result («серия» / быстрая игра).
// Pure logic, no Nakama types: the match handler owns timers, seats and messages.
// Source of truth: concept/rules.md. Cards are ints 0..51, rank = card / 4 (0 = «2» … 12 = «Т»).

var RANK_COUNT = 13;
var DECK_SIZE = 52;
/** Hand size by players in the deal (concept/rules.md «Раздача и добор»). */
var HAND_SMALL_TABLE = 7;
var HAND_LARGE_TABLE = 5;
var SMALL_TABLE_MAX = 4;

function rankOf(card: number): number {
  return Math.floor(card / 4);
}

interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}

/** mulberry32: small deterministic PRNG; the seed comes from a crypto source (match).
 *  A class with plain number state: Nakama keeps match state as plain data between calls. */
class SeedRng implements Rng {
  a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    var t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function makeRng(seed: number): Rng {
  return new SeedRng(seed);
}

function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

function shuffled(items: number[], rng: Rng): number[] {
  var copy = items.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = randInt(rng, i + 1);
    var tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function fullDeck(): number[] {
  var deck: number[] = [];
  for (var c = 0; c < DECK_SIZE; c++) deck.push(c);
  return deck;
}

function handSizeFor(players: number): number {
  return players <= SMALL_TABLE_MAX ? HAND_SMALL_TABLE : HAND_LARGE_TABLE;
}

type DealPhase = 'open' | 'reply' | 'reveal' | 'done';

/** Public event of a deal. `cards` is private: only the owner's copy keeps it (match strips it). */
interface DealEvent {
  t: string; // draw | four | play | reveal | collect | turn | out | done
  seat: number;
  count?: number;
  rank?: number;
  card?: number;
  truth?: boolean;
  loser?: number;
  to?: number;
  open?: boolean;
  cards?: number[];
}

interface DealPlayer {
  seat: number;
  hand: number[];
  /** Ranks collected as fours (open minuses). */
  minus: number[];
  /** 0 = still in the deal, >0 = order of leaving with an empty hand and an empty deck. */
  exit: number;
}

interface RevealInfo {
  card: number;
  truth: boolean;
  /** Player index that takes the pile. */
  loser: number;
  checker: number;
  rank: number;
  count: number;
}

interface Standing {
  seat: number;
  minus: number;
  exit: number;
}

class Deal {
  players: DealPlayer[];
  deck: number[];
  pile: number[] = [];
  packet: number[] = [];
  /** Sizes of the packets in the pile (oldest first), for the table fan. */
  packets: number[] = [];
  handSize: number;
  first: number;
  actor: number;
  opener: number;
  last: number = -1;
  rank: number = -1;
  phase: DealPhase = 'open';
  reveal: RevealInfo | null = null;
  exitCount: number = 0;
  rounds: number = 0;
  events: DealEvent[] = [];

  /** `seats` in clockwise order; `first` is an index into it. `deck` (top = last) only for scripted deals. */
  constructor(seats: number[], first: number, rng: Rng, deck?: number[]) {
    this.players = [];
    for (var i = 0; i < seats.length; i++) this.players.push({seat: seats[i], hand: [], minus: [], exit: 0});
    this.deck = deck ? deck.slice() : shuffled(fullDeck(), rng);
    this.handSize = handSizeFor(seats.length);
    this.first = first;
    this.actor = first;
    this.opener = first;
    this.draw(first);
    this.actor = this.available(first);
    this.opener = this.actor;
    this.events.push({t: 'turn', seat: -1, to: this.players[this.actor].seat});
  }

  dead(): number[] {
    var ranks: number[] = [];
    for (var i = 0; i < this.players.length; i++) ranks = ranks.concat(this.players[i].minus);
    return ranks;
  }

  isDead(rank: number): boolean {
    return this.dead().indexOf(rank) >= 0;
  }

  /** The previous player put their last cards: the next one must check. */
  mandatory(): boolean {
    return this.phase === 'reply' && this.packet.length > 0 && this.last >= 0 && this.players[this.last].hand.length === 0;
  }

  indexOfSeat(seat: number): number {
    for (var i = 0; i < this.players.length; i++) if (this.players[i].seat === seat) return i;
    return -1;
  }

  /** Next player with cards, starting at `index` (wraps). */
  available(index: number): number {
    var n = this.players.length;
    for (var i = 0; i < n; i++) {
      var k = (((index + i) % n) + n) % n;
      if (this.players[k].hand.length > 0) return k;
    }
    return ((index % n) + n) % n;
  }

  /** Start a round («Сходить», phase open) or add to it («Перевести», phase reply). Returns an error code or ''. */
  play(index: number, cards: number[], rank: number): string {
    if (this.phase !== 'open' && this.phase !== 'reply') return 'bad_phase';
    if (index !== this.actor) return 'not_your_turn';
    if (this.mandatory()) return 'must_check';
    var p = this.players[index];
    if (!cards || cards.length === 0) return 'no_cards';
    for (var i = 0; i < cards.length; i++) {
      if (cards.indexOf(cards[i]) !== i) return 'duplicate_card';
      if (p.hand.indexOf(cards[i]) < 0) return 'card_not_in_hand';
    }
    var opening = this.phase === 'open';
    if (opening) {
      if (typeof rank !== 'number' || rank % 1 !== 0 || rank < 0 || rank >= RANK_COUNT) return 'bad_rank';
      if (this.isDead(rank)) return 'dead_rank';
      this.opener = index;
      this.rank = rank;
    }
    this.packet = cards.slice();
    this.packets.push(cards.length);
    this.pile = this.pile.concat(cards);
    p.hand = p.hand.filter(function (c) { return cards.indexOf(c) < 0; });
    this.last = index;
    this.actor = this.available(index + 1);
    this.phase = 'reply';
    this.events.push({t: 'play', seat: p.seat, count: cards.length, rank: this.rank, open: opening, cards: cards.slice()});
    this.events.push({t: 'turn', seat: p.seat, to: this.players[this.actor].seat});
    return '';
  }

  /** «Не верю»: open exactly one card of the last packet. */
  check(index: number, pick: number): string {
    if (this.phase !== 'reply') return 'bad_phase';
    if (index !== this.actor) return 'not_your_turn';
    if (this.packet.length === 0) return 'nothing_to_check';
    if (typeof pick !== 'number' || pick % 1 !== 0 || pick < 0 || pick >= this.packet.length) return 'bad_pick';
    var card = this.packet[pick];
    var truth = rankOf(card) === this.rank;
    var loser = truth ? index : this.last;
    this.reveal = {card: card, truth: truth, loser: loser, checker: index, rank: this.rank, count: this.pile.length};
    this.phase = 'reveal';
    this.events.push({
      t: 'reveal', seat: this.players[index].seat, card: card, truth: truth,
      loser: this.players[loser].seat, count: this.pile.length, rank: this.rank,
    });
    return '';
  }

  /** After the reveal pause: the loser takes the pile, fours burn, everybody draws, the next round opens. */
  settle(): void {
    if (this.phase !== 'reveal' || !this.reveal) return;
    var r = this.reveal;
    var loser = this.players[r.loser];
    this.events.push({t: 'collect', seat: loser.seat, count: this.pile.length, cards: this.pile.slice()});
    loser.hand = loser.hand.concat(this.pile);
    this.takeFours(loser);
    this.packet = [];
    this.pile = [];
    this.packets = [];
    this.draw(this.opener);
    var n = this.players.length;
    for (var i = 0; i < n; i++) {
      var p = this.players[(this.opener + i) % n];
      if (p.hand.length === 0 && this.deck.length === 0 && p.exit === 0) {
        p.exit = ++this.exitCount;
        this.events.push({t: 'out', seat: p.seat, count: p.exit});
      }
    }
    var from = this.players[r.checker].seat;
    this.actor = this.available(r.checker + (r.truth ? 1 : 0));
    this.opener = this.actor;
    this.rank = -1;
    this.last = -1;
    this.rounds++;
    this.reveal = null;
    if (this.dead().length === RANK_COUNT) {
      this.phase = 'done';
      this.events.push({t: 'done', seat: -1});
    } else {
      this.phase = 'open';
      this.events.push({t: 'turn', seat: from, to: this.players[this.actor].seat});
    }
  }

  /** Quick-game order: fewer minuses first, then who left the deal earlier. */
  standings(): Standing[] {
    var list: Standing[] = [];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      list.push({seat: p.seat, minus: p.minus.length, exit: p.exit === 0 ? 1000 + i : p.exit});
    }
    list.sort(function (a, b) { return a.minus - b.minus || a.exit - b.exit; });
    return list;
  }

  /** Drain the events produced since the last call. */
  takeEvents(): DealEvent[] {
    var out = this.events;
    this.events = [];
    return out;
  }

  /** Any four of a rank in the hand leaves at once as an open minus. Returns how many fours burned. */
  private takeFours(p: DealPlayer): number {
    var burned = 0;
    for (var rank = 0; rank < RANK_COUNT; rank++) {
      var same = p.hand.filter(function (c) { return rankOf(c) === rank; });
      if (same.length !== 4) continue;
      p.minus.push(rank);
      p.hand = p.hand.filter(function (c) { return rankOf(c) !== rank; });
      this.events.push({t: 'four', seat: p.seat, rank: rank, count: 4, cards: same});
      burned++;
    }
    return burned;
  }

  /** Everyone still in the deal draws up to the hand size, in order from `first`. A four burns
   *  as soon as it forms and the player keeps drawing to a full hand (prototype game.js). */
  private draw(first: number): void {
    var n = this.players.length;
    for (var offset = 0; offset < n; offset++) {
      var p = this.players[(first + offset) % n];
      if (p.exit !== 0) continue;
      var drawn: number[] = [];
      while (p.hand.length < this.handSize && this.deck.length > 0) {
        var card = this.deck.pop() as number;
        p.hand.push(card);
        drawn.push(card);
        var same = 0;
        for (var i = 0; i < p.hand.length; i++) if (rankOf(p.hand[i]) === rankOf(card)) same++;
        if (same === 4) {
          this.events.push({t: 'draw', seat: p.seat, count: drawn.length, cards: drawn});
          drawn = [];
          this.takeFours(p);
        }
      }
      if (drawn.length > 0) this.events.push({t: 'draw', seat: p.seat, count: drawn.length, cards: drawn});
    }
  }
}

interface DealResult {
  standings: Standing[];
  /** Seats leaving the series after this deal (empty in a quick game). */
  out: number[];
}

/** One table: a quick game (one deal) or a series to one winner («На вылет»). */
class Series {
  mode: string; // quick | series
  alive: number[];
  /** Eliminated groups in order (first group left first). */
  eliminated: number[][] = [];
  dealNo: number = 0;
  firstSeat: number = -1;
  lastResult: DealResult | null = null;
  quickOrder: Standing[] = [];
  /** All seats in clockwise order. */
  seats: number[];

  constructor(mode: string, seats: number[]) {
    this.mode = mode;
    this.seats = seats.slice();
    this.alive = seats.slice();
  }

  /** First deal: random player; later: next alive player clockwise after the previous starter. */
  nextDeal(rng: Rng, deck?: number[]): Deal {
    var first: number;
    if (this.firstSeat < 0) {
      first = randInt(rng, this.alive.length);
    } else {
      var at = this.seats.indexOf(this.firstSeat);
      var seat = this.firstSeat;
      for (var i = 1; i <= this.seats.length; i++) {
        seat = this.seats[(at + i) % this.seats.length];
        if (this.alive.indexOf(seat) >= 0) break;
      }
      first = this.alive.indexOf(seat);
    }
    this.firstSeat = this.alive[first];
    this.dealNo++;
    return new Deal(this.alive, first, rng, deck);
  }

  finishDeal(deal: Deal): DealResult {
    var standings = deal.standings();
    var out: number[] = [];
    if (this.mode === 'series') {
      var worst = standings[standings.length - 1].minus;
      for (var i = 0; i < standings.length; i++) if (standings[i].minus === worst) out.push(standings[i].seat);
      // A full tie cannot happen with 13 minuses and < 13 players; never empty the table anyway.
      if (out.length === this.alive.length) out = [];
      if (out.length > 0) {
        this.eliminated.push(out);
        this.alive = this.alive.filter(function (s) { return out.indexOf(s) < 0; });
      }
    } else {
      this.quickOrder = standings;
    }
    this.lastResult = {standings: standings, out: out};
    return this.lastResult;
  }

  isOver(): boolean {
    return this.mode === 'quick' ? this.dealNo > 0 && this.lastResult !== null : this.alive.length <= 1;
  }

  /** Place groups from the first place down (ties share a group). */
  placements(): number[][] {
    if (this.mode === 'quick') return this.quickOrder.map(function (s) { return [s.seat]; });
    var groups: number[][] = [];
    if (this.alive.length > 0) groups.push(this.alive.slice());
    for (var i = this.eliminated.length - 1; i >= 0; i--) groups.push(this.eliminated[i].slice());
    return groups;
  }
}

/** Free public tables (concept/economy.md): coins by place. */
var FREE_PRIZES: {[mode: string]: number[]} = {
  quick: [30, 15, 5, 5],
  series: [120, 60, 30, 10, 10, 10, 10, 10, 10, 10],
};
/** Paid club: shares of the bank by place. */
var PAID_SHARES = [0.55, 0.3, 0.15];
var PAID_SEATS = 6;
var PAID_FEES = [100, 500, 2500, 10000, 50000];

/**
 * Coins per seat. Tied players share the prizes of the places they occupy;
 * the remainder goes to the first seats of the group.
 * kind: public | friends | lesson; fee > 0 only for the paid club.
 */
function prizesFor(placements: number[][], kind: string, mode: string, fee: number): {[seat: number]: number} {
  var coins: {[seat: number]: number} = {};
  var start = 0;
  for (var g = 0; g < placements.length; g++) {
    var group = placements[g];
    var pool = 0;
    for (var k = 0; k < group.length; k++) {
      var place = start + k;
      if (kind !== 'public') continue;
      if (fee > 0) pool += Math.round(fee * PAID_SEATS * (PAID_SHARES[place] || 0));
      else pool += (FREE_PRIZES[mode] || [])[place] || 0;
    }
    var each = Math.floor(pool / group.length);
    var rest = pool % group.length;
    for (var m = 0; m < group.length; m++) coins[group[m]] = each + (m < rest ? 1 : 0);
    start += group.length;
  }
  return coins;
}

/** 1-based place of a seat in the placements (shared places get the group's best place). */
function placeOf(placements: number[][], seat: number): number {
  var start = 0;
  for (var g = 0; g < placements.length; g++) {
    if (placements[g].indexOf(seat) >= 0) return start + 1;
    start += placements[g].length;
  }
  return 0;
}
