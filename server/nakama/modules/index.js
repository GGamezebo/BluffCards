"use strict";
// Balance and timing knobs of the server (one place, no literals in handler code).
// Env overrides come from nakama/local.yml `runtime.env` (tests speed bots up).
var CONFIG = {
    tickRate: 5,
    searchSec: 20,
    turnSec: 20,
    roomTimers: [20, 60, 0],
    turnGraceSec: 2,
    offlineTurnSec: 20,
    awaySkips: 2,
    revealSec: 2.5,
    botMinSec: 1,
    botMaxSec: 6,
    autoMinSec: 1,
    autoMaxSec: 2,
    botDelayScale: 1,
    interludeSec: 15,
    finishedSec: 90,
    emptyRoomSec: 30,
    publicSeats: { quick: 4, series: 6 },
    maxSeats: 10,
    minSeats: 2,
    startingChips: 1000,
    reactGapSec: 3,
    reactWindowSec: 10,
    reactMax: 3,
    botReactChance: 0.3,
    historySize: 40,
    maxDealRounds: 1500,
    recentSize: 20,
};
function applyEnvConfig(env) {
    if (!env)
        return;
    if (env['BC_SEARCH_SEC'])
        CONFIG.searchSec = Number(env['BC_SEARCH_SEC']);
    if (env['BC_BOT_DELAY_SCALE'])
        CONFIG.botDelayScale = Number(env['BC_BOT_DELAY_SCALE']);
    if (env['BC_REVEAL_SEC'])
        CONFIG.revealSec = Number(env['BC_REVEAL_SEC']);
}
/** Bot names look like players' names: bots are not marked at public tables (concept/formats.md). */
var BOT_NAMES = ['Ира', 'Макс', 'Маша', 'Глеб', 'Лена', 'Саша', 'Ника', 'Олег', 'Яна', 'Вера',
    'Тимур', 'Аня', 'Боря', 'Зоя', 'Кирилл', 'Лиза', 'Миша', 'Нина', 'Паша', 'Рита'];
/** Avatar ids known to the client (src/ui/components/avatar). */
var AVATAR_COUNT = 10;
var WALLET_KEY = 'chips';
var LEADERBOARD_CHIPS = 'chips';
var COLLECTION = 'bluff';
var ROOM_CODES = 'room_codes';
var ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var ROOM_CODE_LENGTH = 6;
var MATCH_MODULE = 'bluff_table';
/** Owner of global storage (room codes, reports). */
var SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
// BluffCards rules: one deal («партия») and the table result («серия» / быстрая игра).
// Pure logic, no Nakama types: the match handler owns timers, seats and messages.
// Source of truth: concept/rules.md. Cards are ints 0..51, rank = card / 4 (0 = «2» … 12 = «Т»).
var RANK_COUNT = 13;
var DECK_SIZE = 52;
/** Hand size by players in the deal (concept/rules.md «Раздача и добор»). */
var HAND_SMALL_TABLE = 7;
var HAND_LARGE_TABLE = 5;
var SMALL_TABLE_MAX = 4;
function rankOf(card) {
    return Math.floor(card / 4);
}
/** mulberry32: small deterministic PRNG; the seed comes from a crypto source (match).
 *  A class with plain number state: Nakama keeps match state as plain data between calls. */
var SeedRng = /** @class */ (function () {
    function SeedRng(seed) {
        this.a = seed >>> 0;
    }
    SeedRng.prototype.next = function () {
        this.a = (this.a + 0x6d2b79f5) >>> 0;
        var t = this.a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return SeedRng;
}());
function makeRng(seed) {
    return new SeedRng(seed);
}
function randInt(rng, n) {
    return Math.floor(rng.next() * n);
}
function shuffled(items, rng) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
        var j = randInt(rng, i + 1);
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy;
}
function fullDeck() {
    var deck = [];
    for (var c = 0; c < DECK_SIZE; c++)
        deck.push(c);
    return deck;
}
function handSizeFor(players) {
    return players <= SMALL_TABLE_MAX ? HAND_SMALL_TABLE : HAND_LARGE_TABLE;
}
var Deal = /** @class */ (function () {
    /** `seats` in clockwise order; `first` is an index into it. `deck` (top = last) only for scripted deals. */
    function Deal(seats, first, rng, deck) {
        this.pile = [];
        this.packet = [];
        /** Sizes of the packets in the pile (oldest first), for the table fan. */
        this.packets = [];
        this.last = -1;
        this.rank = -1;
        this.phase = 'open';
        this.reveal = null;
        this.exitCount = 0;
        this.rounds = 0;
        this.events = [];
        this.players = [];
        for (var i = 0; i < seats.length; i++)
            this.players.push({ seat: seats[i], hand: [], minus: [], exit: 0 });
        this.deck = deck ? deck.slice() : shuffled(fullDeck(), rng);
        this.handSize = handSizeFor(seats.length);
        this.first = first;
        this.actor = first;
        this.opener = first;
        this.draw(first);
        this.actor = this.available(first);
        this.opener = this.actor;
        this.events.push({ t: 'turn', seat: -1, to: this.players[this.actor].seat });
    }
    Deal.prototype.dead = function () {
        var ranks = [];
        for (var i = 0; i < this.players.length; i++)
            ranks = ranks.concat(this.players[i].minus);
        return ranks;
    };
    Deal.prototype.isDead = function (rank) {
        return this.dead().indexOf(rank) >= 0;
    };
    /** The previous player put their last cards: the next one must check. */
    Deal.prototype.mandatory = function () {
        return this.phase === 'reply' && this.packet.length > 0 && this.last >= 0 && this.players[this.last].hand.length === 0;
    };
    Deal.prototype.indexOfSeat = function (seat) {
        for (var i = 0; i < this.players.length; i++)
            if (this.players[i].seat === seat)
                return i;
        return -1;
    };
    /** Next player with cards, starting at `index` (wraps). */
    Deal.prototype.available = function (index) {
        var n = this.players.length;
        for (var i = 0; i < n; i++) {
            var k = (((index + i) % n) + n) % n;
            if (this.players[k].hand.length > 0)
                return k;
        }
        return ((index % n) + n) % n;
    };
    /** Start a round («Сходить», phase open) or add to it («Перевести», phase reply). Returns an error code or ''. */
    Deal.prototype.play = function (index, cards, rank) {
        if (this.phase !== 'open' && this.phase !== 'reply')
            return 'bad_phase';
        if (index !== this.actor)
            return 'not_your_turn';
        if (this.mandatory())
            return 'must_check';
        var p = this.players[index];
        if (!cards || cards.length === 0)
            return 'no_cards';
        for (var i = 0; i < cards.length; i++) {
            if (cards.indexOf(cards[i]) !== i)
                return 'duplicate_card';
            if (p.hand.indexOf(cards[i]) < 0)
                return 'card_not_in_hand';
        }
        var opening = this.phase === 'open';
        if (opening) {
            if (typeof rank !== 'number' || rank % 1 !== 0 || rank < 0 || rank >= RANK_COUNT)
                return 'bad_rank';
            if (this.isDead(rank))
                return 'dead_rank';
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
        this.events.push({ t: 'play', seat: p.seat, count: cards.length, rank: this.rank, open: opening, cards: cards.slice() });
        this.events.push({ t: 'turn', seat: p.seat, to: this.players[this.actor].seat });
        return '';
    };
    /** «Не верю»: open exactly one card of the last packet. */
    Deal.prototype.check = function (index, pick) {
        if (this.phase !== 'reply')
            return 'bad_phase';
        if (index !== this.actor)
            return 'not_your_turn';
        if (this.packet.length === 0)
            return 'nothing_to_check';
        if (typeof pick !== 'number' || pick % 1 !== 0 || pick < 0 || pick >= this.packet.length)
            return 'bad_pick';
        var card = this.packet[pick];
        var truth = rankOf(card) === this.rank;
        var loser = truth ? index : this.last;
        this.reveal = { card: card, truth: truth, loser: loser, checker: index, rank: this.rank, count: this.pile.length };
        this.phase = 'reveal';
        this.events.push({
            t: 'reveal', seat: this.players[index].seat, card: card, truth: truth,
            loser: this.players[loser].seat, count: this.pile.length, rank: this.rank,
        });
        return '';
    };
    /** After the reveal pause: the loser takes the pile, fours burn, everybody draws, the next round opens. */
    Deal.prototype.settle = function () {
        if (this.phase !== 'reveal' || !this.reveal)
            return;
        var r = this.reveal;
        var loser = this.players[r.loser];
        this.events.push({ t: 'collect', seat: loser.seat, count: this.pile.length, cards: this.pile.slice() });
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
                this.events.push({ t: 'out', seat: p.seat, count: p.exit });
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
            this.events.push({ t: 'done', seat: -1 });
        }
        else {
            this.phase = 'open';
            this.events.push({ t: 'turn', seat: from, to: this.players[this.actor].seat });
        }
    };
    /** Quick-game order: fewer minuses first, then who left the deal earlier. */
    Deal.prototype.standings = function () {
        var list = [];
        for (var i = 0; i < this.players.length; i++) {
            var p = this.players[i];
            list.push({ seat: p.seat, minus: p.minus.length, exit: p.exit === 0 ? 1000 + i : p.exit });
        }
        list.sort(function (a, b) { return a.minus - b.minus || a.exit - b.exit; });
        return list;
    };
    /** Drain the events produced since the last call. */
    Deal.prototype.takeEvents = function () {
        var out = this.events;
        this.events = [];
        return out;
    };
    /** Any four of a rank in the hand leaves at once as an open minus. Returns how many fours burned. */
    Deal.prototype.takeFours = function (p) {
        var burned = 0;
        for (var rank = 0; rank < RANK_COUNT; rank++) {
            var same = p.hand.filter(function (c) { return rankOf(c) === rank; });
            if (same.length !== 4)
                continue;
            p.minus.push(rank);
            p.hand = p.hand.filter(function (c) { return rankOf(c) !== rank; });
            this.events.push({ t: 'four', seat: p.seat, rank: rank, count: 4, cards: same });
            burned++;
        }
        return burned;
    };
    /** Everyone still in the deal draws up to the hand size, in order from `first`. A four burns
     *  as soon as it forms and the player keeps drawing to a full hand (prototype game.js). */
    Deal.prototype.draw = function (first) {
        var n = this.players.length;
        for (var offset = 0; offset < n; offset++) {
            var p = this.players[(first + offset) % n];
            if (p.exit !== 0)
                continue;
            var drawn = [];
            while (p.hand.length < this.handSize && this.deck.length > 0) {
                var card = this.deck.pop();
                p.hand.push(card);
                drawn.push(card);
                var same = 0;
                for (var i = 0; i < p.hand.length; i++)
                    if (rankOf(p.hand[i]) === rankOf(card))
                        same++;
                if (same === 4) {
                    this.events.push({ t: 'draw', seat: p.seat, count: drawn.length, cards: drawn });
                    drawn = [];
                    this.takeFours(p);
                }
            }
            if (drawn.length > 0)
                this.events.push({ t: 'draw', seat: p.seat, count: drawn.length, cards: drawn });
        }
    };
    return Deal;
}());
/** One table: a quick game (one deal) or a series to one winner («На вылет»). */
var Series = /** @class */ (function () {
    function Series(mode, seats) {
        /** Eliminated groups in order (first group left first). */
        this.eliminated = [];
        this.dealNo = 0;
        this.firstSeat = -1;
        this.lastResult = null;
        this.quickOrder = [];
        this.mode = mode;
        this.seats = seats.slice();
        this.alive = seats.slice();
    }
    /** First deal: random player; later: next alive player clockwise after the previous starter. */
    Series.prototype.nextDeal = function (rng, deck) {
        var first;
        if (this.firstSeat < 0) {
            first = randInt(rng, this.alive.length);
        }
        else {
            var at = this.seats.indexOf(this.firstSeat);
            var seat = this.firstSeat;
            for (var i = 1; i <= this.seats.length; i++) {
                seat = this.seats[(at + i) % this.seats.length];
                if (this.alive.indexOf(seat) >= 0)
                    break;
            }
            first = this.alive.indexOf(seat);
        }
        this.firstSeat = this.alive[first];
        this.dealNo++;
        return new Deal(this.alive, first, rng, deck);
    };
    Series.prototype.finishDeal = function (deal) {
        var standings = deal.standings();
        var out = [];
        if (this.mode === 'series') {
            var worst = standings[standings.length - 1].minus;
            for (var i = 0; i < standings.length; i++)
                if (standings[i].minus === worst)
                    out.push(standings[i].seat);
            // A full tie cannot happen with 13 minuses and < 13 players; never empty the table anyway.
            if (out.length === this.alive.length)
                out = [];
            if (out.length > 0) {
                this.eliminated.push(out);
                this.alive = this.alive.filter(function (s) { return out.indexOf(s) < 0; });
            }
        }
        else {
            this.quickOrder = standings;
        }
        this.lastResult = { standings: standings, out: out };
        return this.lastResult;
    };
    Series.prototype.isOver = function () {
        return this.mode === 'quick' ? this.dealNo > 0 && this.lastResult !== null : this.alive.length <= 1;
    };
    /** Place groups from the first place down (ties share a group). */
    Series.prototype.placements = function () {
        if (this.mode === 'quick')
            return this.quickOrder.map(function (s) { return [s.seat]; });
        var groups = [];
        if (this.alive.length > 0)
            groups.push(this.alive.slice());
        for (var i = this.eliminated.length - 1; i >= 0; i--)
            groups.push(this.eliminated[i].slice());
        return groups;
    };
    return Series;
}());
/** Free public tables (concept/economy.md): coins by place. */
var FREE_PRIZES = {
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
function prizesFor(placements, kind, mode, fee) {
    var coins = {};
    var start = 0;
    for (var g = 0; g < placements.length; g++) {
        var group = placements[g];
        var pool = 0;
        for (var k = 0; k < group.length; k++) {
            var place = start + k;
            if (kind !== 'public')
                continue;
            if (fee > 0)
                pool += Math.round(fee * PAID_SEATS * (PAID_SHARES[place] || 0));
            else
                pool += (FREE_PRIZES[mode] || [])[place] || 0;
        }
        var each = Math.floor(pool / group.length);
        var rest = pool % group.length;
        for (var m = 0; m < group.length; m++)
            coins[group[m]] = each + (m < rest ? 1 : 0);
        start += group.length;
    }
    return coins;
}
/** 1-based place of a seat in the placements (shared places get the group's best place). */
function placeOf(placements, seat) {
    var start = 0;
    for (var g = 0; g < placements.length; g++) {
        if (placements[g].indexOf(seat) >= 0)
            return start + 1;
        start += placements[g].length;
    }
    return 0;
}
// Server bots (concept/tech.md «Боты»): they see only what a human in their seat would see —
// their own hand, packet / pile sizes, the claim, open minuses and the cards revealed so far.
// Same strength on free and paid tables; styles only change the taste for risk.
var BOT_STYLES = [
    { id: 'careful', suspicion: 0.3, padding: 0.12, pureBluff: 0.05, pileFear: 0.02 },
    { id: 'bold', suspicion: 0.22, padding: 0.45, pureBluff: 0.2, pileFear: 0.008 },
    { id: 'detective', suspicion: 0.42, padding: 0.25, pureBluff: 0.1, pileFear: 0.012 },
];
function botCounts(hand) {
    var counts = [];
    for (var r = 0; r < RANK_COUNT; r++)
        counts.push(0);
    for (var i = 0; i < hand.length; i++)
        counts[rankOf(hand[i])]++;
    return counts;
}
/** Cards to get rid of first: ranks with the most copies (they become a minus once the 4th arrives). */
function botJunk(hand, exclude, howMany, rng) {
    var counts = botCounts(hand);
    var pool = hand.filter(function (c) { return rankOf(c) !== exclude; });
    pool = shuffled(pool, rng);
    pool.sort(function (a, b) { return counts[rankOf(b)] - counts[rankOf(a)]; });
    return pool.slice(0, Math.max(0, Math.min(howMany, pool.length)));
}
function botDecide(view, style, rng) {
    var counts = botCounts(view.hand);
    if (view.phase === 'reply') {
        if (view.mandatory || view.hand.length === 0) {
            return { kind: 'check', cards: [], rank: -1, pick: randInt(rng, view.packetSize) };
        }
        // Copies of the claimed rank outside my hand; more claimed than that means a lie is in the packet.
        var possible = 4 - counts[view.claim];
        var sureLie = view.packetSize > possible ? (view.packetSize - possible) / view.packetSize : 0;
        var chance = style.suspicion + 0.7 * sureLie + 0.05 * (view.packetSize - 1) - style.pileFear * view.pileSize;
        if (counts[view.claim] === 0 && view.hand.length <= 2)
            chance += 0.15;
        chance = Math.max(0.05, Math.min(0.95, chance));
        if (rng.next() < chance) {
            return { kind: 'check', cards: [], rank: -1, pick: randInt(rng, view.packetSize) };
        }
        var honest = view.hand.filter(function (c) { return rankOf(c) === view.claim; });
        var cards = honest.slice();
        if (cards.length === 0 || rng.next() < style.padding) {
            var extra = 1 + (rng.next() < 0.35 ? 1 : 0);
            cards = cards.concat(botJunk(view.hand, view.claim, extra, rng));
        }
        if (cards.length === 0)
            cards = [view.hand[0]];
        return { kind: 'play', cards: cards, rank: view.claim, pick: -1 };
    }
    // Opening a round: dump the rank with the most copies (honest), sometimes padded or a pure bluff.
    var best = -1;
    for (var r = 0; r < RANK_COUNT; r++) {
        if (counts[r] > 0 && view.dead.indexOf(r) < 0 && (best < 0 || counts[r] > counts[best]))
            best = r;
    }
    if (best < 0)
        best = rankOf(view.hand[0]);
    var rank = best;
    var openCards = view.hand.filter(function (c) { return rankOf(c) === best; });
    if (rng.next() < style.pureBluff) {
        var alive = [];
        for (var q = 0; q < RANK_COUNT; q++)
            if (view.dead.indexOf(q) < 0 && counts[q] === 0)
                alive.push(q);
        if (alive.length > 0) {
            rank = alive[randInt(rng, alive.length)];
            openCards = botJunk(view.hand, -1, 1 + randInt(rng, 2), rng);
        }
    }
    else if (rng.next() < style.padding && openCards.length < view.hand.length) {
        openCards = openCards.concat(botJunk(view.hand, best, 1, rng));
    }
    return { kind: 'play', cards: openCards, rank: rank, pick: -1 };
}
/** Bot view of the current turn of a deal (no peeking at other hands or the deck). */
function botViewOf(deal, index) {
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
function botAct(deal, style, rng) {
    var index = deal.actor;
    var d = botDecide(botViewOf(deal, index), style, rng);
    var err = d.kind === 'check' ? deal.check(index, d.pick) : deal.play(index, d.cards, d.rank);
    if (err === '')
        return;
    if (deal.phase === 'reply') {
        deal.check(index, 0);
    }
    else {
        var hand = deal.players[index].hand;
        deal.play(index, [hand[0]], rankOf(hand[0]));
    }
}
// Server-side data: wallet + chips leaderboard, player profile, recent opponents, companies,
// room codes, block list, active table. Only server code writes these (clients read via RPC).
function readObject(nk, userId, key) {
    var objects = nk.storageRead([{ collection: COLLECTION, key: key, userId: userId }]);
    if (!objects || objects.length === 0)
        return null;
    return { value: objects[0].value, version: objects[0].version };
}
function writeObject(nk, userId, key, value, version) {
    var req = {
        collection: COLLECTION, key: key, userId: userId, value: value, permissionRead: 1, permissionWrite: 0,
    };
    if (version !== undefined)
        req.version = version;
    nk.storageWrite([req]);
}
function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function defaultAvatar(userId) {
    return hashString(userId) % AVATAR_COUNT;
}
function readProfile(nk, userId) {
    var obj = readObject(nk, userId, 'profile');
    var v = obj ? obj.value : {};
    return {
        visited: !!v.visited,
        lessonDone: !!v.lessonDone,
        respect: Number(v.respect || 0),
        avatar: v.avatar === undefined ? defaultAvatar(userId) : Number(v.avatar),
    };
}
/** Read-modify-write with optimistic locking (respect may arrive from several matches). */
function updateProfile(nk, userId, change) {
    for (var attempt = 0; attempt < 3; attempt++) {
        var obj = readObject(nk, userId, 'profile');
        var p = readProfile(nk, userId);
        change(p);
        try {
            writeObject(nk, userId, 'profile', p, obj ? obj.version : '*');
            return;
        }
        catch (e) {
            // Version conflict: retry with the fresh object.
        }
    }
}
function chipsOf(nk, userId) {
    var account = nk.accountGetId(userId);
    return Number((account.wallet || {})[WALLET_KEY] || 0);
}
function displayNameOf(nk, userId) {
    var account = nk.accountGetId(userId);
    return account.user.displayName || account.user.username;
}
/** Change chips and refresh the leaderboard. Throws when the wallet would go negative. */
function changeChips(nk, logger, userId, delta, reason, meta) {
    var changeset = {};
    changeset[WALLET_KEY] = delta;
    var metadata = { reason: reason };
    for (var k in meta)
        metadata[k] = meta[k];
    var result = nk.walletUpdate(userId, changeset, metadata, true);
    var balance = Number(result.updated[WALLET_KEY] || 0);
    writeChipsRecord(nk, userId, balance);
    logger.info('wallet change user=%s delta=%d balance=%d reason=%s', userId, delta, balance, reason);
    return balance;
}
function writeChipsRecord(nk, userId, balance) {
    var account = nk.accountGetId(userId);
    var name = account.user.displayName || account.user.username;
    nk.leaderboardRecordWrite(LEADERBOARD_CHIPS, userId, name, balance, 0, { avatar: readProfile(nk, userId).avatar }, "set" /* nkruntime.OverrideOperator.SET */);
}
function setActiveMatch(nk, userId, matchId) {
    writeObject(nk, userId, 'active', { matchId: matchId });
}
function clearActiveMatch(nk, userId, matchId) {
    var obj = readObject(nk, userId, 'active');
    if (obj && obj.value.matchId === matchId)
        writeObject(nk, userId, 'active', { matchId: '' });
}
function activeMatchOf(nk, userId) {
    var obj = readObject(nk, userId, 'active');
    return obj ? String(obj.value.matchId || '') : '';
}
function addRecent(nk, userId, others) {
    var obj = readObject(nk, userId, 'recent');
    var list = obj ? obj.value.players || [] : [];
    var ids = others.map(function (o) { return o.id; });
    list = others.concat(list.filter(function (r) { return ids.indexOf(r.id) < 0; })).slice(0, CONFIG.recentSize);
    writeObject(nk, userId, 'recent', { players: list });
}
function readRecent(nk, userId) {
    var obj = readObject(nk, userId, 'recent');
    return obj ? obj.value.players || [] : [];
}
function readCompanies(nk, userId) {
    var obj = readObject(nk, userId, 'companies');
    return obj ? obj.value.companies || [] : [];
}
function writeCompanies(nk, userId, list) {
    writeObject(nk, userId, 'companies', { companies: list });
}
function readBlocked(nk, userId) {
    var obj = readObject(nk, userId, 'blocked');
    return obj ? obj.value.ids || [] : [];
}
function newRoomCode() {
    var code = '';
    for (var i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length));
    }
    return code;
}
/** Room code → match id (system-owned, so codes are global). */
function roomMatchOf(nk, code) {
    var objects = nk.storageRead([{ collection: ROOM_CODES, key: code, userId: SYSTEM_USER }]);
    if (!objects || objects.length === 0)
        return '';
    var matchId = String(objects[0].value.matchId || '');
    if (matchId && nk.matchGet(matchId) === null)
        return '';
    return matchId;
}
function setRoomMatch(nk, code, matchId) {
    nk.storageWrite([{
            collection: ROOM_CODES, key: code, userId: SYSTEM_USER,
            value: { matchId: matchId }, permissionRead: 0, permissionWrite: 0,
        }]);
}
function clearRoomMatch(nk, code, matchId) {
    if (roomMatchOf(nk, code) === matchId || roomMatchOf(nk, code) === '') {
        nk.storageDelete([{ collection: ROOM_CODES, key: code, userId: SYSTEM_USER }]);
    }
}
/** Seed from a crypto source (uuid v4 uses the OS CSPRNG); logged per deal for disputes. */
function cryptoSeed(nk) {
    return parseInt(nk.uuidv4().replace(/-/g, '').slice(0, 8), 16) >>> 0;
}
// Authoritative table (concept/tech.md «Протокол партии»). One Nakama match = one table:
// public («Быстрая игра» / «На вылет» / клуб профессионалов), a friends room or the lesson.
// Clients send intents only; every client gets its own view (own hand, public data of the rest).
/** Client → server. */
var OP_PLAY = 1;
var OP_CHECK = 2;
var OP_REACT = 3;
var OP_BACK = 4;
var OP_LEAVE = 5;
var OP_CONFIG = 6;
var OP_ADD_BOT = 7;
var OP_START = 8;
var OP_RESPECT = 9;
var OP_AGAIN = 10;
var OP_NEXT = 11;
var OP_REMOVE_BOT = 12;
/** Server → client. */
var OP_VIEW = 100;
var OP_REACTION = 101;
var OP_ERROR = 102;
var REACTION_KINDS = { emoji: 8, phrase: 8, 'throw': 5 };
/** Nakama hands the match state back as Go-wrapped data on every call (its arrays are not JS
 *  arrays: concat / sort misbehave). Copy it into plain JS and put the class methods back. */
function rehydrate(raw) {
    var state = JSON.parse(JSON.stringify(raw));
    Object.setPrototypeOf(state.rng, SeedRng.prototype);
    if (state.deal)
        Object.setPrototypeOf(state.deal, Deal.prototype);
    if (state.series)
        Object.setPrototypeOf(state.series, Series.prototype);
    return state;
}
function secTicks(sec) {
    return Math.max(1, Math.round(sec * CONFIG.tickRate));
}
function botDelay(state, min, max) {
    var sec = (min + state.rng.next() * (max - min)) * CONFIG.botDelayScale;
    return Math.max(1, Math.round(sec * CONFIG.tickRate));
}
function humansSeated(state) {
    return state.seats.filter(function (s) { return s.human && !s.left; });
}
function connectedHumans(state) {
    return state.seats.filter(function (s) { return s.human && !s.left && s.presence !== null; });
}
function seatOfUser(state, userId) {
    for (var i = 0; i < state.seats.length; i++)
        if (state.seats[i].human && state.seats[i].id === userId)
            return i;
    return -1;
}
function updateLabel(state, dispatcher) {
    var label = JSON.stringify({
        k: state.kind, m: state.mode, f: state.fee,
        o: state.kind === 'public' && state.phase === 'waiting' && state.seats.length < state.size ? 1 : 0,
        u: humansSeated(state).map(function (s) { return s.id; }),
    });
    if (label !== state.label) {
        state.label = label;
        dispatcher.matchLabelUpdate(label);
    }
}
function newBot(state, nk, fixedName, fixedAvatar) {
    var used = state.seats.map(function (s) { return s.name; });
    var free = BOT_NAMES.filter(function (n) { return used.indexOf(n) < 0; });
    var name = fixedName || (free.length ? free[randInt(state.rng, free.length)] : 'Гость');
    var usedAvatars = state.seats.map(function (s) { return s.avatar; });
    var avatar = fixedAvatar !== undefined ? fixedAvatar : randInt(state.rng, AVATAR_COUNT);
    for (var k = 0; k < AVATAR_COUNT && fixedAvatar === undefined && usedAvatars.indexOf(avatar) >= 0; k++) {
        avatar = (avatar + 1) % AVATAR_COUNT;
    }
    return {
        id: nk.uuidv4(), name: name, avatar: avatar, bot: true, human: false, left: false,
        style: randInt(state.rng, BOT_STYLES.length), presence: null, away: false, skips: 0,
        respect: 3 + randInt(state.rng, 40), paid: 0, ready: true, reacts: [], respected: [],
    };
}
function humanSeat(nk, presence) {
    var profile = readProfile(nk, presence.userId);
    return {
        id: presence.userId, name: displayNameOf(nk, presence.userId), avatar: profile.avatar, bot: false,
        human: true, left: false, style: 0, presence: presence, away: false, skips: 0,
        respect: profile.respect, paid: 0, ready: false, reacts: [], respected: [],
    };
}
// ---------------------------------------------------------------- views
function dealIndex(state, seat) {
    return state.deal ? state.deal.indexOfSeat(seat) : -1;
}
function seatOfIndex(state, index) {
    return state.deal && index >= 0 ? state.deal.players[index].seat : -1;
}
function publicEvent(e, mySeat) {
    var copy = {};
    for (var k in e)
        copy[k] = e[k];
    if (e.seat !== mySeat || mySeat < 0)
        delete copy.cards;
    return copy;
}
function viewFor(state, me) {
    var deal = state.deal;
    var alive = state.series ? state.series.alive : [];
    var seats = state.seats.map(function (s, i) {
        var idx = dealIndex(state, i);
        var p = idx >= 0 && deal ? deal.players[idx] : null;
        return {
            seat: i, id: s.id, name: s.name, avatar: s.avatar,
            // Bots are named only in friends rooms (the host adds them); public bots look like players.
            bot: state.kind !== 'public' && s.bot && !s.human,
            host: state.kind === 'friends' && s.id === state.host,
            connected: !s.human || s.presence !== null,
            away: s.away, left: s.left, respect: s.respect, ready: s.ready,
            alive: state.series ? alive.indexOf(i) >= 0 : true,
            cards: p ? p.hand.length : 0,
            minus: p ? p.minus.slice() : [],
            out: p ? p.exit > 0 : false,
        };
    });
    var d = null;
    if (deal) {
        var dead = [];
        for (var j = 0; j < deal.players.length; j++) {
            for (var m = 0; m < deal.players[j].minus.length; m++)
                dead.push({ rank: deal.players[j].minus[m], seat: deal.players[j].seat });
        }
        var r = deal.reveal;
        var humanTurn = deal.phase === 'open' || deal.phase === 'reply';
        d = {
            phase: deal.phase, deck: deal.deck.length, pile: deal.pile.length, packets: deal.packets.slice(),
            packet: deal.packet.length, claim: deal.rank, actor: seatOfIndex(state, deal.actor),
            last: seatOfIndex(state, deal.last), opener: seatOfIndex(state, deal.opener),
            mandatory: deal.mandatory(), dead: dead, hand_size: deal.handSize, round: deal.rounds,
            reveal: r ? { card: r.card, truth: r.truth, loser: seatOfIndex(state, r.loser), checker: seatOfIndex(state, r.checker), rank: r.rank, count: r.count } : null,
            turn_total: humanTurn && state.turnDeadline > 0 ? state.timer : 0,
            turn_left: humanTurn && state.turnDeadline > 0 ? Math.max(0, (state.turnDeadline - state.tick) / CONFIG.tickRate - CONFIG.turnGraceSec) : 0,
        };
    }
    var hand = [];
    var mi = dealIndex(state, me);
    if (deal && mi >= 0)
        hand = deal.players[mi].hand.slice().sort(function (a, b) { return a - b; });
    var res = null;
    if (state.result) {
        res = {
            standings: state.result.standings, out: state.result.out, placements: state.result.placements,
            prizes: state.result.prizes, final: state.result.final,
            coins: me >= 0 ? state.result.prizes[me] || 0 : 0,
            place: me >= 0 ? placeOf(state.result.placements, me) : 0,
        };
    }
    return {
        kind: state.kind, mode: state.mode, fee: state.fee, size: state.size, timer: state.timer,
        phase: state.phase, code: state.code, company: state.company, me: me,
        search_left: state.phase === 'waiting' && state.kind === 'public' && state.searchDeadline > 0
            ? Math.max(0, (state.searchDeadline - state.tick) / CONFIG.tickRate) : 0,
        search_total: CONFIG.searchSec,
        deal_no: state.series ? state.series.dealNo : 0,
        seats: seats, deal: d, hand: hand, history: state.history.slice(-CONFIG.historySize), result: res,
        watchers: state.watchers.map(function (w) { return w.name; }),
        next_left: state.phase === 'interlude' ? Math.max(0, (state.phaseDue - state.tick) / CONFIG.tickRate) : 0,
    };
}
function sendViews(state, dispatcher, events) {
    for (var i = 0; i < state.seats.length; i++) {
        var s = state.seats[i];
        if (!s.human || s.presence === null)
            continue;
        var mine = events.map(function (e) { return publicEvent(e, i); });
        dispatcher.broadcastMessage(OP_VIEW, JSON.stringify({ view: viewFor(state, i), events: mine }), [s.presence]);
    }
    var watchers = state.watchers.map(function (w) { return w.presence; });
    if (watchers.length > 0) {
        var pub = events.map(function (e) { return publicEvent(e, -1); });
        dispatcher.broadcastMessage(OP_VIEW, JSON.stringify({ view: viewFor(state, -1), events: pub }), watchers);
    }
}
function sendError(dispatcher, presence, code) {
    dispatcher.broadcastMessage(OP_ERROR, JSON.stringify({ error: code }), [presence]);
}
/** Public history for the move log («История ходов»): no hidden cards. */
function recordHistory(state, events) {
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.t === 'turn' || e.t === 'draw' || e.t === 'collect' || e.t === 'done')
            continue;
        var entry = { t: e.t, seat: e.seat };
        if (e.count !== undefined)
            entry.count = e.count;
        if (e.rank !== undefined)
            entry.rank = e.rank;
        if (e.t === 'reveal') {
            entry.card = e.card;
            entry.truth = e.truth;
            entry.loser = e.loser;
        }
        if (e.t === 'play')
            entry.open = e.open;
        state.history.push(entry);
    }
    if (state.history.length > CONFIG.historySize * 2)
        state.history = state.history.slice(-CONFIG.historySize);
}
// ---------------------------------------------------------------- flow
function startTable(state, nk, logger, dispatcher, ctx) {
    if (state.kind === 'public') {
        while (state.seats.length < state.size)
            state.seats.push(newBot(state, nk));
    }
    var order = [];
    for (var i = 0; i < state.seats.length; i++)
        order.push(i);
    state.series = new Series(state.mode, order);
    state.result = null;
    state.history = [];
    for (var h = 0; h < state.seats.length; h++) {
        var s = state.seats[h];
        if (s.human && !s.left && state.kind !== 'lesson')
            setActiveMatch(nk, s.id, ctx.matchId);
    }
    logger.info('match start match=%s kind=%s mode=%s fee=%d seats=%d humans=%d', ctx.matchId, state.kind, state.mode, state.fee, state.seats.length, humansSeated(state).length);
    return beginDeal(state, logger, ctx);
}
function beginDeal(state, logger, ctx) {
    state.seed = cryptoSeedFromRng(state);
    var dealRng = makeRng(state.seed);
    var series = state.series;
    state.deal = state.kind === 'lesson' ? lessonDeal() : series.nextDeal(dealRng);
    if (state.kind === 'lesson')
        series.dealNo = 1;
    state.phase = 'playing';
    state.result = null;
    for (var i = 0; i < state.seats.length; i++)
        state.seats[i].ready = state.seats[i].bot;
    state.history.push({ t: 'deal', seat: -1, count: series.dealNo });
    logger.info('match deal match=%s deal=%d seed=%d first=%d players=%d', ctx.matchId, series.dealNo, state.seed, series.firstSeat, state.deal.players.length);
    var events = state.deal.takeEvents();
    events.unshift({ t: 'deal', seat: -1, count: series.dealNo });
    scheduleTurn(state);
    return events;
}
/** The match RNG is seeded from a crypto source at init; every deal draws a fresh seed from it. */
function cryptoSeedFromRng(state) {
    return Math.floor(state.rng.next() * 4294967296) >>> 0;
}
/** Arm the timer / bot move for whoever acts now. */
function scheduleTurn(state) {
    state.actDue = 0;
    state.turnDeadline = 0;
    state.revealDue = 0;
    var deal = state.deal;
    if (!deal || state.phase !== 'playing')
        return;
    if (deal.phase === 'reveal') {
        state.revealDue = state.tick + secTicks(CONFIG.revealSec);
        return;
    }
    if (deal.phase !== 'open' && deal.phase !== 'reply')
        return;
    var seat = state.seats[deal.players[deal.actor].seat];
    var nobody = connectedHumans(state).length === 0;
    if (seat.bot || nobody) {
        state.actDue = state.tick + (nobody ? 1 : botDelay(state, CONFIG.botMinSec, CONFIG.botMaxSec));
    }
    else if (seat.away) {
        state.actDue = state.tick + botDelay(state, CONFIG.autoMinSec, CONFIG.autoMaxSec);
    }
    else {
        var limit = state.timer > 0 ? state.timer : seat.presence === null ? CONFIG.offlineTurnSec : 0;
        if (limit > 0)
            state.turnDeadline = state.tick + secTicks(limit + CONFIG.turnGraceSec);
    }
    state.turnStarted = state.tick;
}
function afterAction(state, nk, logger, dispatcher, ctx) {
    var deal = state.deal;
    if (deal.phase !== 'done' && deal.rounds > CONFIG.maxDealRounds) {
        logger.error('match deal_round_cap match=%s rounds=%d', ctx.matchId, deal.rounds);
        deal.phase = 'done';
    }
    var events = deal.takeEvents();
    recordHistory(state, events);
    queueBotReactions(state, events);
    if (deal.phase === 'done') {
        events = events.concat(endDeal(state, nk, logger, dispatcher, ctx));
    }
    else {
        scheduleTurn(state);
    }
    sendViews(state, dispatcher, events);
}
function endDeal(state, nk, logger, dispatcher, ctx) {
    var series = state.series;
    var deal = state.deal;
    if (state.kind === 'lesson') {
        state.phase = 'finished';
        state.phaseDue = state.tick + secTicks(CONFIG.finishedSec);
        state.result = { standings: deal.standings(), out: [], placements: [], prizes: {}, final: true };
        var owner = state.seats[0];
        if (owner.human)
            updateProfile(nk, owner.id, function (p) { p.lessonDone = true; p.visited = true; });
        logger.info('match lesson_done match=%s user=%s', ctx.matchId, owner.id);
        return [];
    }
    var res = series.finishDeal(deal);
    logger.info('match deal_end match=%s deal=%d rounds=%d out=%s minus=%s', ctx.matchId, series.dealNo, deal.rounds, JSON.stringify(res.out), JSON.stringify(res.standings.map(function (s) { return [s.seat, s.minus]; })));
    for (var i = 0; i < res.out.length; i++)
        state.history.push({ t: 'eliminated', seat: res.out[i] });
    if (series.isOver())
        return finishTable(state, nk, logger, ctx);
    state.phase = 'interlude';
    state.phaseDue = state.tick + secTicks(CONFIG.interludeSec);
    state.result = { standings: res.standings, out: res.out, placements: series.placements(), prizes: {}, final: false };
    for (var k = 0; k < state.seats.length; k++)
        state.seats[k].ready = state.seats[k].bot || series.alive.indexOf(k) < 0;
    return [];
}
/** Placements, prizes (public tables only; bots and players who left get nothing), recent players. */
function finishTable(state, nk, logger, ctx) {
    var series = state.series;
    var placements = series.placements();
    var prizes = prizesFor(placements, state.kind, state.mode, state.fee);
    var paid = {};
    for (var i = 0; i < state.seats.length; i++) {
        var s = state.seats[i];
        var coins = prizes[i] || 0;
        if (!s.human || s.left) {
            if (coins > 0)
                logger.info('match prize_burned match=%s seat=%d coins=%d', ctx.matchId, i, coins);
            continue;
        }
        paid[i] = coins;
        if (coins > 0) {
            try {
                changeChips(nk, logger, s.id, coins, 'table_prize', { match: ctx.matchId, place: placeOf(placements, i) });
            }
            catch (e) {
                logger.error('match prize_failed match=%s user=%s error=%s', ctx.matchId, s.id, String(e));
            }
        }
        clearActiveMatch(nk, s.id, ctx.matchId);
    }
    var humans = humansSeated(state);
    for (var h = 0; h < humans.length; h++) {
        var others = humans.filter(function (o) { return o.id !== humans[h].id; })
            .map(function (o) { return { id: o.id, name: o.name, avatar: o.avatar, time: Date.now() }; });
        if (others.length > 0 && state.kind !== 'lesson')
            addRecent(nk, humans[h].id, others);
    }
    state.phase = 'finished';
    state.phaseDue = state.tick + secTicks(CONFIG.finishedSec);
    var last = series.lastResult;
    state.result = {
        standings: last ? last.standings : [], out: last ? last.out : [], placements: placements, prizes: paid, final: true,
    };
    logger.info('match finish match=%s placements=%s prizes=%s', ctx.matchId, JSON.stringify(placements), JSON.stringify(paid));
    return [];
}
function queueBotReactions(state, events) {
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.t !== 'reveal' || e.loser === undefined)
            continue;
        var checker = state.seats[e.seat];
        var loser = state.seats[e.loser];
        if (checker && checker.bot && !checker.human && state.rng.next() < CONFIG.botReactChance) {
            // phrase 4 «Блефуешь!» when catching, emoji 4 😎 when the check went wrong.
            state.reactQueue.push(e.truth
                ? { due: state.tick + botDelay(state, 1, 3), seat: e.seat, kind: 'emoji', id: 2, target: -1 }
                : { due: state.tick + botDelay(state, 1, 3), seat: e.seat, kind: 'phrase', id: 4, target: -1 });
        }
        else if (loser && loser.bot && !loser.human && (e.count || 0) >= 8 && state.rng.next() < CONFIG.botReactChance) {
            state.reactQueue.push({ due: state.tick + botDelay(state, 1, 3), seat: e.loser, kind: 'emoji', id: 2, target: -1 });
        }
    }
}
/** Lesson (concept/formats.md «Учебная миссия»): Маша claims three kings, you open one card. */
function lessonDeal() {
    var d = new Deal([0, 1, 2, 3], 0, makeRng(42));
    var take = [];
    var keep = function (cards) { take = take.concat(cards); return cards; };
    d.players[0].minus = [0];
    d.players[1].minus = [1];
    keep([0, 1, 2, 3, 4, 5, 6, 7]);
    d.packet = keep([44, 21, 46]);
    d.pile = keep([12, 15, 23, 28, 30, 32, 36, 41]).concat(d.packet);
    d.packets = [5, 3, 3];
    d.players[0].hand = keep([8, 17, 27, 38, 48, 34, 43]);
    var rest = fullDeck().filter(function (c) { return take.indexOf(c) < 0; });
    for (var p = 1; p < 4; p++) {
        var hand = [];
        for (var i = 0; i < rest.length && hand.length < 5; i++) {
            var rank = rankOf(rest[i]);
            if (hand.filter(function (c) { return rankOf(c) === rank; }).length < 2) {
                hand.push(rest[i]);
                rest.splice(i, 1);
                i--;
            }
        }
        d.players[p].hand = hand;
    }
    d.deck = rest;
    d.actor = 0;
    d.opener = 1;
    d.last = 3;
    d.rank = 11;
    d.phase = 'reply';
    d.takeEvents();
    return d;
}
// ---------------------------------------------------------------- intents
function handleMessage(state, m, nk, logger, dispatcher, ctx) {
    var data = {};
    try {
        var text = nk.binaryToString(m.data);
        data = text ? JSON.parse(text) : {};
    }
    catch (e) {
        sendError(dispatcher, m.sender, 'bad_payload');
        return;
    }
    var seat = seatOfUser(state, m.sender.userId);
    var isHost = state.kind === 'friends' && m.sender.userId === state.host;
    logger.debug('match intent match=%s user=%s seat=%d op=%d', ctx.matchId, m.sender.userId, seat, m.opCode);
    switch (m.opCode) {
        case OP_PLAY:
        case OP_CHECK:
            handleMove(state, seat, m, data, nk, logger, dispatcher, ctx);
            return;
        case OP_REACT:
            handleReact(state, seat, m.sender, data, dispatcher);
            return;
        case OP_BACK:
            if (seat >= 0 && state.seats[seat].away) {
                state.seats[seat].away = false;
                state.seats[seat].skips = 0;
                logger.info('match back match=%s seat=%d', ctx.matchId, seat);
                scheduleTurn(state);
                sendViews(state, dispatcher, []);
            }
            return;
        case OP_LEAVE:
            leaveTable(state, m.sender, nk, logger, dispatcher, ctx, true);
            return;
        case OP_CONFIG:
            if (!isHost || state.phase !== 'waiting')
                return sendError(dispatcher, m.sender, 'not_host');
            if (data.mode === 'quick' || data.mode === 'series')
                state.mode = data.mode;
            if (typeof data.size === 'number' && data.size >= CONFIG.minSeats && data.size <= CONFIG.maxSeats) {
                state.size = Math.max(Math.floor(data.size), state.seats.length);
            }
            if (CONFIG.roomTimers.indexOf(data.timer) >= 0)
                state.timer = data.timer;
            sendViews(state, dispatcher, []);
            return;
        case OP_ADD_BOT:
            if (!isHost || state.phase !== 'waiting')
                return sendError(dispatcher, m.sender, 'not_host');
            if (state.seats.length >= state.size)
                return sendError(dispatcher, m.sender, 'room_full');
            state.seats.push(newBot(state, nk));
            sendViews(state, dispatcher, []);
            return;
        case OP_REMOVE_BOT:
            if (!isHost || state.phase !== 'waiting')
                return sendError(dispatcher, m.sender, 'not_host');
            var b = Number(data.seat);
            if (state.seats[b] && state.seats[b].bot && !state.seats[b].human)
                state.seats.splice(b, 1);
            sendViews(state, dispatcher, []);
            return;
        case OP_START:
            if (!isHost || state.phase !== 'waiting')
                return sendError(dispatcher, m.sender, 'not_host');
            if (state.seats.length < CONFIG.minSeats)
                return sendError(dispatcher, m.sender, 'need_players');
            sendViews(state, dispatcher, startTable(state, nk, logger, dispatcher, ctx));
            return;
        case OP_RESPECT:
            giveRespect(state, seat, Number(data.seat), nk, logger, ctx);
            return;
        case OP_AGAIN:
            if (state.kind === 'friends' && state.phase === 'finished') {
                resetRoom(state);
                logger.info('match again match=%s seats=%d', ctx.matchId, state.seats.length);
                sendViews(state, dispatcher, []);
            }
            return;
        case OP_NEXT:
            if (state.phase === 'interlude' && seat >= 0) {
                state.seats[seat].ready = true;
                sendViews(state, dispatcher, []);
            }
            return;
    }
}
function handleMove(state, seat, m, data, nk, logger, dispatcher, ctx) {
    var deal = state.deal;
    if (state.phase !== 'playing' || !deal || seat < 0)
        return sendError(dispatcher, m.sender, 'bad_phase');
    var index = deal.indexOfSeat(seat);
    if (index < 0 || index !== deal.actor)
        return sendError(dispatcher, m.sender, 'not_your_turn');
    if (state.seats[seat].away)
        return sendError(dispatcher, m.sender, 'away');
    var err;
    if (m.opCode === OP_PLAY) {
        if (state.kind === 'lesson')
            return sendError(dispatcher, m.sender, 'lesson_check_only');
        var cards = Array.isArray(data.cards) ? data.cards.map(Number) : [];
        err = deal.play(index, cards, Number(data.rank));
        logger.info('match move match=%s seat=%d kind=%s count=%d claim=%d err=%s', ctx.matchId, seat, deal.phase === 'reply' && err === '' && deal.packets.length === 1 ? 'open' : 'play', cards.length, deal.rank, err || 'ok');
    }
    else {
        err = deal.check(index, Number(data.index));
        logger.info('match check match=%s seat=%d pick=%d err=%s', ctx.matchId, seat, Number(data.index), err || 'ok');
    }
    if (err)
        return sendError(dispatcher, m.sender, err);
    state.seats[seat].skips = 0;
    afterAction(state, nk, logger, dispatcher, ctx);
}
function handleReact(state, seat, sender, data, dispatcher) {
    if (seat < 0)
        return;
    var kind = String(data.kind);
    var id = Number(data.id);
    if (!(kind in REACTION_KINDS) || id % 1 !== 0 || id < 0 || id >= REACTION_KINDS[kind])
        return sendError(dispatcher, sender, 'bad_reaction');
    var s = state.seats[seat];
    var now = state.tick;
    var windowTicks = secTicks(CONFIG.reactWindowSec);
    s.reacts = s.reacts.filter(function (t) { return now - t < windowTicks; });
    var lastAt = s.reacts.length ? s.reacts[s.reacts.length - 1] : -1000000;
    if (now - lastAt < secTicks(CONFIG.reactGapSec) || s.reacts.length >= CONFIG.reactMax)
        return sendError(dispatcher, sender, 'reaction_rate');
    s.reacts.push(now);
    var target = kind === 'throw' ? Number(data.target) : -1;
    if (kind === 'throw' && (!state.seats[target] || target === seat))
        return sendError(dispatcher, sender, 'bad_target');
    broadcastReaction(state, dispatcher, seat, kind, id, target);
}
function broadcastReaction(state, dispatcher, seat, kind, id, target) {
    var presences = connectedHumans(state).map(function (s) { return s.presence; })
        .concat(state.watchers.map(function (w) { return w.presence; }));
    if (presences.length)
        dispatcher.broadcastMessage(OP_REACTION, JSON.stringify({ seat: seat, kind: kind, id: id, target: target }), presences);
}
function giveRespect(state, seat, target, nk, logger, ctx) {
    if (state.phase !== 'finished' || seat < 0 || target === seat || !state.seats[target])
        return;
    var giver = state.seats[seat];
    var to = state.seats[target];
    if (giver.respected.indexOf(to.id) >= 0)
        return;
    giver.respected.push(to.id);
    to.respect++;
    if (to.human)
        updateProfile(nk, to.id, function (p) { p.respect++; });
    logger.info('match respect match=%s from=%d to=%d', ctx.matchId, seat, target);
}
/** Friends room «Ещё раз»: same company back to the room, queued friends take free seats. */
function resetRoom(state) {
    state.seats = state.seats.filter(function (s) { return !s.human || (!s.left && s.presence !== null); });
    for (var i = 0; i < state.seats.length; i++) {
        var s = state.seats[i];
        s.away = false;
        s.skips = 0;
        s.ready = false;
        s.respected = [];
    }
    while (state.watchers.length > 0 && state.seats.length < state.size) {
        var w = state.watchers.shift();
        state.seats.push({
            id: w.id, name: w.name, avatar: 0, bot: false, human: true, left: false, style: 0, presence: w.presence,
            away: false, skips: 0, respect: 0, paid: 0, ready: false, reacts: [], respected: [],
        });
    }
    state.phase = 'waiting';
    state.deal = null;
    state.series = null;
    state.result = null;
    state.history = [];
}
/** Voluntary leave: in the lobby the seat frees (paid fee back); in a game a bot plays it out. */
function leaveTable(state, presence, nk, logger, dispatcher, ctx, voluntary) {
    state.watchers = state.watchers.filter(function (w) { return w.presence.sessionId !== presence.sessionId; });
    var seat = seatOfUser(state, presence.userId);
    if (seat < 0)
        return;
    var s = state.seats[seat];
    if (s.presence && s.presence.sessionId !== presence.sessionId)
        return;
    if (state.phase === 'waiting') {
        if (s.paid > 0) {
            try {
                changeChips(nk, logger, s.id, s.paid, 'fee_refund', { match: ctx.matchId });
            }
            catch (e) {
                logger.error('match refund_failed user=%s error=%s', s.id, String(e));
            }
        }
        state.seats.splice(seat, 1);
        if (state.kind === 'friends' && s.id === state.host) {
            var next = humansSeated(state);
            state.host = next.length ? next[0].id : '';
        }
        logger.info('match seat_free match=%s user=%s', ctx.matchId, s.id);
    }
    else if (voluntary && state.phase !== 'finished') {
        s.left = true;
        s.bot = true;
        s.presence = null;
        clearActiveMatch(nk, s.id, ctx.matchId);
        logger.info('match left match=%s seat=%d fee_burned=%d', ctx.matchId, seat, s.paid);
        scheduleTurnIfActor(state, seat);
    }
    else {
        s.presence = null;
        if (voluntary)
            clearActiveMatch(nk, s.id, ctx.matchId);
        logger.info('match disconnect match=%s seat=%d', ctx.matchId, seat);
        scheduleTurnIfActor(state, seat);
    }
    updateLabel(state, dispatcher);
    sendViews(state, dispatcher, []);
}
function scheduleTurnIfActor(state, seat) {
    var deal = state.deal;
    if (state.phase === 'playing' && deal && (deal.phase === 'open' || deal.phase === 'reply') && deal.players[deal.actor].seat === seat) {
        scheduleTurn(state);
    }
}
// ---------------------------------------------------------------- handler
var matchInit = function (ctx, logger, nk, params) {
    var kind = String(params.kind || 'public');
    var mode = params.mode === 'series' ? 'series' : 'quick';
    var fee = Number(params.fee || 0);
    if (kind === 'public' && fee > 0)
        mode = 'series';
    var state = {
        kind: kind, mode: mode, fee: fee,
        size: kind === 'public' ? CONFIG.publicSeats[mode] : kind === 'lesson' ? 4 : Number(params.size || 4),
        timer: kind === 'public' ? CONFIG.turnSec : kind === 'lesson' ? 0 : CONFIG.roomTimers[0],
        phase: 'waiting', seats: [], watchers: [], host: String(params.host || ''), code: String(params.code || ''),
        company: String(params.company || ''), owner: String(params.owner || ''),
        searchDeadline: 0, series: null, deal: null, rng: new SeedRng(cryptoSeed(nk)), seed: 0,
        actDue: 0, turnDeadline: 0, turnStarted: 0, revealDue: 0, phaseDue: 0, emptySince: 0,
        history: [], result: null, reactQueue: [], label: '', tick: 0,
    };
    state.label = JSON.stringify({ k: kind, m: mode, f: fee, o: kind === 'public' ? 1 : 0, u: [] });
    logger.info('match init kind=%s mode=%s fee=%d code=%s', kind, mode, fee, state.code);
    return { state: state, tickRate: CONFIG.tickRate, label: state.label };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence) {
    state = rehydrate(state);
    if (seatOfUser(state, presence.userId) >= 0)
        return { state: state, accept: true };
    if (state.kind === 'lesson')
        return { state: state, accept: presence.userId === state.owner, rejectMessage: 'lesson' };
    if (state.kind === 'public') {
        if (state.phase !== 'waiting' || state.seats.length >= state.size)
            return { state: state, accept: false, rejectMessage: 'table_full' };
        if (state.fee > 0 && chipsOf(nk, presence.userId) < state.fee)
            return { state: state, accept: false, rejectMessage: 'not_enough_chips' };
    }
    return { state: state, accept: true };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    state = rehydrate(state);
    state.tick = tick;
    for (var i = 0; i < presences.length; i++) {
        var p = presences[i];
        var seat = seatOfUser(state, p.userId);
        if (seat >= 0) {
            var s = state.seats[seat];
            if (s.left) {
                // Left the table on purpose: the bot keeps the seat, the player only watches.
                state.watchers.push({ id: p.userId, name: s.name, presence: p });
                continue;
            }
            s.presence = p;
            logger.info('match rejoin match=%s seat=%d', ctx.matchId, seat);
            scheduleTurnIfActor(state, seat);
            continue;
        }
        if (state.phase === 'waiting' && state.seats.length < state.size) {
            var ns = humanSeat(nk, p);
            if (state.kind === 'public' && state.fee > 0) {
                try {
                    changeChips(nk, logger, p.userId, -state.fee, 'table_fee', { match: ctx.matchId });
                    ns.paid = state.fee;
                }
                catch (e) {
                    sendError(dispatcher, p, 'not_enough_chips');
                    dispatcher.matchKick([p]);
                    continue;
                }
            }
            if (state.kind === 'friends' && !state.host)
                state.host = p.userId;
            state.seats.push(ns);
            if (state.kind === 'public' && state.searchDeadline === 0)
                state.searchDeadline = tick + secTicks(CONFIG.searchSec);
            logger.info('match seat match=%s user=%s seat=%d paid=%d', ctx.matchId, p.userId, state.seats.length - 1, ns.paid);
        }
        else {
            state.watchers.push({ id: p.userId, name: displayNameOf(nk, p.userId), presence: p });
            logger.info('match watcher match=%s user=%s', ctx.matchId, p.userId);
        }
    }
    var events = [];
    if (state.phase === 'waiting' && (state.kind === 'lesson' || (state.kind === 'public' && state.seats.length >= state.size))) {
        if (state.kind === 'lesson') {
            state.seats.push(newBot(state, nk, 'Ира', 0), newBot(state, nk, 'Макс', 2), newBot(state, nk, 'Маша', 1));
        }
        events = startTable(state, nk, logger, dispatcher, ctx);
    }
    updateLabel(state, dispatcher);
    sendViews(state, dispatcher, events);
    return { state: state };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    state = rehydrate(state);
    state.tick = tick;
    for (var i = 0; i < presences.length; i++)
        leaveTable(state, presences[i], nk, logger, dispatcher, ctx, false);
    return { state: state };
};
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    state = rehydrate(state);
    state.tick = tick;
    for (var i = 0; i < messages.length; i++)
        handleMessage(state, messages[i], nk, logger, dispatcher, ctx);
    var anyone = connectedHumans(state).length + state.watchers.length > 0;
    if (!anyone) {
        if (state.emptySince === 0)
            state.emptySince = tick;
    }
    else {
        state.emptySince = 0;
    }
    // Reactions of bots, after a human-like pause.
    var due = state.reactQueue.filter(function (r) { return r.due <= tick; });
    state.reactQueue = state.reactQueue.filter(function (r) { return r.due > tick; });
    for (var q = 0; q < due.length; q++)
        broadcastReaction(state, dispatcher, due[q].seat, due[q].kind, due[q].id, due[q].target);
    switch (state.phase) {
        case 'waiting':
            // A new table waits for its first player; an abandoned lobby closes.
            if (!anyone && state.emptySince > 0 && tick - state.emptySince > secTicks(CONFIG.emptyRoomSec))
                return null;
            if (state.kind === 'public' && state.seats.length > 0 && state.searchDeadline > 0 && tick >= state.searchDeadline) {
                sendViews(state, dispatcher, startTable(state, nk, logger, dispatcher, ctx));
                updateLabel(state, dispatcher);
            }
            break;
        case 'playing':
            loopPlaying(state, nk, logger, dispatcher, ctx);
            break;
        case 'interlude':
            var alive = state.series.alive;
            var allReady = state.seats.every(function (s, k) { return s.ready || s.presence === null || alive.indexOf(k) < 0; });
            if (tick >= state.phaseDue || allReady || !anyone) {
                sendViews(state, dispatcher, beginDeal(state, logger, ctx));
            }
            break;
        case 'finished':
            if (state.kind === 'friends') {
                if (!anyone && tick - state.emptySince > secTicks(CONFIG.emptyRoomSec))
                    return null;
            }
            else if (tick >= state.phaseDue || (!anyone && tick - state.emptySince > secTicks(2))) {
                return null;
            }
            break;
    }
    return { state: state };
};
function loopPlaying(state, nk, logger, dispatcher, ctx) {
    var deal = state.deal;
    var tick = state.tick;
    if (deal.phase === 'reveal') {
        if (state.revealDue > 0 && tick >= state.revealDue) {
            deal.settle();
            // The lesson is one check: once the pile has moved, the mission is over.
            if (state.kind === 'lesson')
                deal.phase = 'done';
            afterAction(state, nk, logger, dispatcher, ctx);
        }
        return;
    }
    if (deal.phase !== 'open' && deal.phase !== 'reply')
        return;
    var seatIndex = deal.players[deal.actor].seat;
    var seat = state.seats[seatIndex];
    if (state.actDue > 0 && tick >= state.actDue) {
        botAct(deal, BOT_STYLES[seat.style % BOT_STYLES.length], state.rng);
        logger.info('match auto match=%s seat=%d reason=%s', ctx.matchId, seatIndex, seat.bot ? 'bot' : seat.away ? 'away' : 'offline');
        afterAction(state, nk, logger, dispatcher, ctx);
        return;
    }
    if (state.turnDeadline > 0 && tick >= state.turnDeadline) {
        seat.skips++;
        if (seat.skips >= CONFIG.awaySkips)
            seat.away = true;
        logger.info('match timeout match=%s seat=%d skips=%d away=%s', ctx.matchId, seatIndex, seat.skips, String(seat.away));
        botAct(deal, BOT_STYLES[0], state.rng);
        afterAction(state, nk, logger, dispatcher, ctx);
    }
}
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state) {
    state = rehydrate(state);
    if (state.code)
        clearRoomMatch(nk, state.code, ctx.matchId);
    for (var i = 0; i < state.seats.length; i++) {
        if (state.seats[i].human)
            clearActiveMatch(nk, state.seats[i].id, ctx.matchId);
    }
    logger.info('match terminate match=%s phase=%s', ctx.matchId, state.phase);
    return { state: state };
};
/** Signals: `seated:<userId>` → "yes" while that player still has a seat (rejoin after restart). */
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
    state = rehydrate(state);
    var parts = String(data).split(':');
    if (parts[0] === 'seated') {
        var seat = seatOfUser(state, parts[1]);
        var ok = seat >= 0 && !state.seats[seat].left && state.phase !== 'finished';
        return { state: state, data: ok ? 'yes' : 'no' };
    }
    return { state: state, data: '' };
};
// RPCs of the lobby (concept/design catalog): profile, tables, friends rooms and companies,
// leaderboard, friends, report / block, account. Payloads are JSON; errors come back as {error}.
var NOTIFY_ROOM_INVITE = 100;
function ok(value) {
    return JSON.stringify(value);
}
function fail(code) {
    return JSON.stringify({ error: code });
}
function parse(payload) {
    if (!payload)
        return {};
    try {
        return JSON.parse(payload);
    }
    catch (e) {
        return {};
    }
}
function providerOf(account) {
    if (account.user.appleId)
        return 'Apple';
    if (account.user.googleId)
        return 'Google';
    if (account.customId && account.customId.indexOf('tg_') === 0)
        return 'Telegram';
    return 'guest';
}
/** Still-seated table of the player (rejoin after a restart), else ''. */
function liveActiveMatch(nk, userId) {
    var matchId = activeMatchOf(nk, userId);
    if (!matchId)
        return '';
    try {
        if (nk.matchGet(matchId) === null)
            return '';
        return nk.matchSignal(matchId, 'seated:' + userId) === 'yes' ? matchId : '';
    }
    catch (e) {
        return '';
    }
}
var rpcProfile = function (ctx, logger, nk) {
    var userId = ctx.userId;
    var account = nk.accountGetId(userId);
    var profile = readProfile(nk, userId);
    return ok({
        user_id: userId,
        name: account.user.displayName || account.user.username,
        balance: Number((account.wallet || {})[WALLET_KEY] || 0),
        avatar: profile.avatar,
        visited: profile.visited,
        lesson_done: profile.lessonDone,
        respect: profile.respect,
        provider: providerOf(account),
        active_match: liveActiveMatch(nk, userId),
        fees: PAID_FEES,
    });
};
var rpcMarkVisited = function (ctx, logger, nk) {
    updateProfile(nk, ctx.userId, function (p) { p.visited = true; });
    return ok({ ok: true });
};
/** Matchmaking: an open table of this kind without blocked players, else a new one. */
var rpcFindTable = function (ctx, logger, nk, payload) {
    var req = parse(payload);
    var userId = ctx.userId;
    var mode = req.mode === 'series' ? 'series' : 'quick';
    var fee = Number(req.fee || 0);
    if (fee > 0) {
        if (PAID_FEES.indexOf(fee) < 0)
            return fail('bad_fee');
        mode = 'series';
        if (chipsOf(nk, userId) < fee)
            return fail('not_enough_chips');
    }
    var blocked = readBlocked(nk, userId);
    var query = '+label.k:public +label.m:' + mode + ' +label.f:' + fee + ' +label.o:1';
    var matches = nk.matchList(20, true, null, 0, CONFIG.publicSeats[mode], query) || [];
    for (var i = 0; i < matches.length; i++) {
        var label = {};
        try {
            label = JSON.parse(matches[i].label);
        }
        catch (e) {
            continue;
        }
        var users = label.u || [];
        if (users.indexOf(userId) >= 0)
            return ok({ match_id: matches[i].matchId });
        var clash = users.some(function (u) { return blocked.indexOf(u) >= 0 || readBlocked(nk, u).indexOf(userId) >= 0; });
        if (!clash)
            return ok({ match_id: matches[i].matchId });
    }
    var matchId = nk.matchCreate(MATCH_MODULE, { kind: 'public', mode: mode, fee: fee });
    logger.info('rpc find_table created match=%s mode=%s fee=%d user=%s', matchId, mode, fee, userId);
    return ok({ match_id: matchId });
};
function createRoomMatch(nk, logger, userId, code, company) {
    var matchId = nk.matchCreate(MATCH_MODULE, { kind: 'friends', host: userId, code: code, company: company });
    setRoomMatch(nk, code, matchId);
    logger.info('rpc room_created match=%s code=%s user=%s', matchId, code, userId);
    return matchId;
}
function freeRoomCode(nk) {
    for (var i = 0; i < 10; i++) {
        var code = newRoomCode();
        var taken = nk.storageRead([{ collection: ROOM_CODES, key: code, userId: SYSTEM_USER }]);
        if (!taken || taken.length === 0)
            return code;
    }
    return newRoomCode();
}
var rpcCreateRoom = function (ctx, logger, nk) {
    var userId = ctx.userId;
    var code = freeRoomCode(nk);
    var name = displayNameOf(nk, userId);
    return ok({ match_id: createRoomMatch(nk, logger, userId, code, 'Стол · ' + name), code: code });
};
/** A code from an invite: the room alive now, or a fresh room for a company's permanent code. */
var rpcJoinRoom = function (ctx, logger, nk, payload) {
    var code = String(parse(payload).code || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code))
        return fail('bad_code');
    var objects = nk.storageRead([{ collection: ROOM_CODES, key: code, userId: SYSTEM_USER }]);
    if (!objects || objects.length === 0)
        return fail('room_not_found');
    var value = objects[0].value;
    var matchId = String(value.matchId || '');
    if (matchId && nk.matchGet(matchId) !== null)
        return ok({ match_id: matchId, code: code });
    if (!value.company)
        return fail('room_not_found');
    return ok({ match_id: createRoomMatch(nk, logger, ctx.userId, code, String(value.company)), code: code });
};
var rpcLesson = function (ctx, logger, nk) {
    var matchId = nk.matchCreate(MATCH_MODULE, { kind: 'lesson', owner: ctx.userId });
    return ok({ match_id: matchId });
};
var rpcLeaders = function (ctx, logger, nk, payload) {
    var userId = ctx.userId;
    var scope = parse(payload).scope === 'friends' ? 'friends' : 'all';
    var rows = [];
    var mine = null;
    var toRow = function (r) {
        return { rank: r.rank, user_id: r.ownerId, name: r.username, score: r.score, avatar: (r.metadata || {}).avatar || 0, me: r.ownerId === userId };
    };
    if (scope === 'all') {
        var list = nk.leaderboardRecordsList(LEADERBOARD_CHIPS, [userId], 50);
        rows = (list.records || []).map(toRow);
        if (list.ownerRecords && list.ownerRecords.length)
            mine = toRow(list.ownerRecords[0]);
    }
    else {
        var owners = [userId];
        var friends = nk.friendsList(userId, 100, 0).friends || [];
        for (var i = 0; i < friends.length; i++)
            if (friends[i].user)
                owners.push(friends[i].user.userId);
        var fl = nk.leaderboardRecordsList(LEADERBOARD_CHIPS, owners, 0);
        rows = (fl.ownerRecords || []).map(toRow).sort(function (a, b) { return b.score - a.score; });
        for (var k = 0; k < rows.length; k++) {
            rows[k].rank = k + 1;
            if (rows[k].me)
                mine = rows[k];
        }
    }
    return ok({ scope: scope, rows: rows, me: mine });
};
var rpcSocial = function (ctx, logger, nk) {
    var userId = ctx.userId;
    var friends = (nk.friendsList(userId, 100).friends || []).filter(function (f) { return f.user && f.state !== 3; })
        .map(function (f) {
        var u = f.user;
        return { id: u.userId, name: u.displayName || u.username, online: u.online, state: f.state,
            avatar: readProfile(nk, u.userId).avatar };
    });
    return ok({ friends: friends, recent: readRecent(nk, userId), companies: readCompanies(nk, userId) });
};
/** Friend request (mutual once the other side adds back). Bots' ids are ignored quietly. */
var rpcAddFriend = function (ctx, logger, nk, payload) {
    var target = String(parse(payload).user_id || '');
    if (!target || target === ctx.userId)
        return fail('bad_user');
    try {
        nk.friendsAdd(ctx.userId, ctx.username, [target], [], {});
    }
    catch (e) {
        logger.debug('rpc add_friend skipped user=%s target=%s', ctx.userId, target);
    }
    return ok({ ok: true });
};
var rpcCreateCompany = function (ctx, logger, nk, payload) {
    var req = parse(payload);
    var userId = ctx.userId;
    var name = String(req.name || '').trim().slice(0, 24);
    if (!name)
        return fail('bad_name');
    var members = Array.isArray(req.members) ? req.members.map(String).slice(0, 9) : [];
    var list = readCompanies(nk, userId);
    var code = freeRoomCode(nk);
    var company = { id: nk.uuidv4(), name: name, code: code, members: members };
    list.push(company);
    writeCompanies(nk, userId, list);
    nk.storageWrite([{
            collection: ROOM_CODES, key: code, userId: SYSTEM_USER,
            value: { matchId: '', company: name, owner: userId }, permissionRead: 0, permissionWrite: 0,
        }]);
    logger.info('rpc company_created user=%s code=%s members=%d', userId, code, members.length);
    return ok({ company: company });
};
/** Company room by its permanent code: join the live one or open it. */
var rpcOpenCompany = function (ctx, logger, nk, payload) {
    var userId = ctx.userId;
    var id = String(parse(payload).company_id || '');
    var company = readCompanies(nk, userId).filter(function (c) { return c.id === id; })[0];
    if (!company)
        return fail('company_not_found');
    var live = roomMatchOf(nk, company.code);
    if (live)
        return ok({ match_id: live, code: company.code });
    var matchId = nk.matchCreate(MATCH_MODULE, { kind: 'friends', host: userId, code: company.code, company: company.name });
    nk.storageWrite([{
            collection: ROOM_CODES, key: company.code, userId: SYSTEM_USER,
            value: { matchId: matchId, company: company.name, owner: userId }, permissionRead: 0, permissionWrite: 0,
        }]);
    return ok({ match_id: matchId, code: company.code });
};
/** In-app invites (socket notifications); push services come with the platform builds. */
var rpcInvite = function (ctx, logger, nk, payload) {
    var req = parse(payload);
    var userId = ctx.userId;
    var code = String(req.code || '').toUpperCase();
    if (!roomMatchOf(nk, code))
        return fail('room_not_found');
    var ids = Array.isArray(req.user_ids) ? req.user_ids.map(String) : [];
    if (req.company_id) {
        var company = readCompanies(nk, userId).filter(function (c) { return c.id === String(req.company_id); })[0];
        if (company)
            ids = ids.concat(company.members);
    }
    var name = displayNameOf(nk, userId);
    var sent = 0;
    for (var i = 0; i < ids.length && i < 20; i++) {
        if (ids[i] === userId)
            continue;
        try {
            nk.notificationSend(ids[i], name + ' зовёт за стол', { code: code, from: name }, NOTIFY_ROOM_INVITE, userId, true);
            sent++;
        }
        catch (e) {
            logger.debug('rpc invite skipped target=%s', ids[i]);
        }
    }
    logger.info('rpc invite user=%s code=%s sent=%d', userId, code, sent);
    return ok({ sent: sent });
};
var rpcReport = function (ctx, logger, nk, payload) {
    var req = parse(payload);
    nk.storageWrite([{
            collection: 'reports', key: nk.uuidv4(), userId: SYSTEM_USER,
            value: { from: ctx.userId, target: String(req.user_id || ''), reason: String(req.reason || '').slice(0, 40), time: Date.now() },
            permissionRead: 0, permissionWrite: 0,
        }]);
    logger.info('rpc report from=%s target=%s', ctx.userId, String(req.user_id || ''));
    return ok({ ok: true });
};
var rpcBlock = function (ctx, logger, nk, payload) {
    var userId = ctx.userId;
    var target = String(parse(payload).user_id || '');
    if (!target)
        return fail('bad_user');
    var ids = readBlocked(nk, userId);
    if (ids.indexOf(target) < 0)
        ids.push(target);
    writeObject(nk, userId, 'blocked', { ids: ids.slice(-200) });
    return ok({ ok: true });
};
/** Store requirement: delete the account from inside the app. */
var rpcDeleteAccount = function (ctx, logger, nk) {
    var userId = ctx.userId;
    logger.info('rpc delete_account user=%s', userId);
    nk.leaderboardRecordDelete(LEADERBOARD_CHIPS, userId);
    nk.accountDeleteId(userId, false);
    return ok({ ok: true });
};
/** Platform sign-in (Google / Apple / Telegram) needs the platform SDKs of the store builds. */
var rpcLink = function () {
    return fail('provider_unavailable');
};
/** New player: guest name, starting chips, leaderboard row. */
var afterAuthenticateDevice = function (ctx, logger, nk, session) {
    if (!session || !session.created)
        return;
    var userId = ctx.userId;
    var name = 'Гость ' + userId.replace(/-/g, '').slice(0, 4).toUpperCase();
    nk.accountUpdateId(userId, null, name, null, null, null, null, null);
    changeChips(nk, logger, userId, CONFIG.startingChips, 'starting_chips', {});
    logger.info('account created user=%s name=%s', userId, name);
};
// Nakama entry point: registers the table match, the lobby RPCs and the account hook.
// Built by `npm run build` into ../nakama/modules/index.js (one ES5 file, global functions).
var InitModule = function (ctx, logger, nk, initializer) {
    applyEnvConfig(ctx.env);
    nk.leaderboardCreate(LEADERBOARD_CHIPS, true, "descending" /* nkruntime.SortOrder.DESCENDING */, "set" /* nkruntime.Operator.SET */, null, {}, true);
    initializer.registerMatch(MATCH_MODULE, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
    initializer.registerRpc('bc_profile', rpcProfile);
    initializer.registerRpc('bc_mark_visited', rpcMarkVisited);
    initializer.registerRpc('bc_find_table', rpcFindTable);
    initializer.registerRpc('bc_create_room', rpcCreateRoom);
    initializer.registerRpc('bc_join_room', rpcJoinRoom);
    initializer.registerRpc('bc_lesson', rpcLesson);
    initializer.registerRpc('bc_leaders', rpcLeaders);
    initializer.registerRpc('bc_social', rpcSocial);
    initializer.registerRpc('bc_add_friend', rpcAddFriend);
    initializer.registerRpc('bc_create_company', rpcCreateCompany);
    initializer.registerRpc('bc_open_company', rpcOpenCompany);
    initializer.registerRpc('bc_invite', rpcInvite);
    initializer.registerRpc('bc_report', rpcReport);
    initializer.registerRpc('bc_block', rpcBlock);
    initializer.registerRpc('bc_delete_account', rpcDeleteAccount);
    initializer.registerRpc('bc_link', rpcLink);
    initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
    logger.info('bluffcards module loaded search=%d bot_scale=%d', CONFIG.searchSec, CONFIG.botDelayScale);
};
