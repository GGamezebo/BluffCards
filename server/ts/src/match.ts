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

var REACTION_KINDS: {[kind: string]: number} = {emoji: 8, phrase: 8, 'throw': 5};

interface Seat {
  /** Nakama user id, or a generated id for a bot (bots look like players at public tables). */
  id: string;
  name: string;
  avatar: number;
  /** Seat played by the server: a bot, or a player who left the table. */
  bot: boolean;
  human: boolean;
  left: boolean;
  style: number;
  presence: nkruntime.Presence | null;
  away: boolean;
  skips: number;
  respect: number;
  paid: number;
  ready: boolean;
  reacts: number[];
  respected: string[];
}

interface Watcher {
  id: string;
  name: string;
  presence: nkruntime.Presence;
}

interface TableResult {
  standings: {seat: number; minus: number; exit: number}[];
  out: number[];
  placements: number[][];
  prizes: {[seat: number]: number};
  final: boolean;
}

interface TableState {
  kind: string; // public | friends | lesson
  mode: string; // quick | series
  fee: number;
  size: number;
  timer: number;
  phase: string; // waiting | playing | interlude | finished
  seats: Seat[];
  watchers: Watcher[];
  host: string;
  code: string;
  company: string;
  owner: string;
  searchDeadline: number;
  series: Series | null;
  deal: Deal | null;
  rng: SeedRng;
  seed: number;
  actDue: number;
  turnDeadline: number;
  turnStarted: number;
  revealDue: number;
  phaseDue: number;
  emptySince: number;
  history: any[];
  result: TableResult | null;
  reactQueue: {due: number; seat: number; kind: string; id: number; target: number}[];
  label: string;
  tick: number;
}

/** Nakama hands the match state back as Go-wrapped data on every call (its arrays are not JS
 *  arrays: concat / sort misbehave). Copy it into plain JS and put the class methods back. */
function rehydrate(raw: TableState): TableState {
  var state = JSON.parse(JSON.stringify(raw)) as TableState;
  Object.setPrototypeOf(state.rng, SeedRng.prototype);
  if (state.deal) Object.setPrototypeOf(state.deal, Deal.prototype);
  if (state.series) Object.setPrototypeOf(state.series, Series.prototype);
  return state;
}

function secTicks(sec: number): number {
  return Math.max(1, Math.round(sec * CONFIG.tickRate));
}

function botDelay(state: TableState, min: number, max: number): number {
  var sec = (min + state.rng.next() * (max - min)) * CONFIG.botDelayScale;
  return Math.max(1, Math.round(sec * CONFIG.tickRate));
}

function humansSeated(state: TableState): Seat[] {
  return state.seats.filter(function (s) { return s.human && !s.left; });
}

function connectedHumans(state: TableState): Seat[] {
  return state.seats.filter(function (s) { return s.human && !s.left && s.presence !== null; });
}

function seatOfUser(state: TableState, userId: string): number {
  for (var i = 0; i < state.seats.length; i++) if (state.seats[i].human && state.seats[i].id === userId) return i;
  return -1;
}

function updateLabel(state: TableState, dispatcher: nkruntime.MatchDispatcher): void {
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

function newBot(state: TableState, nk: nkruntime.Nakama, fixedName?: string, fixedAvatar?: number): Seat {
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

function humanSeat(nk: nkruntime.Nakama, presence: nkruntime.Presence): Seat {
  var profile = readProfile(nk, presence.userId);
  return {
    id: presence.userId, name: displayNameOf(nk, presence.userId), avatar: profile.avatar, bot: false,
    human: true, left: false, style: 0, presence: presence, away: false, skips: 0,
    respect: profile.respect, paid: 0, ready: false, reacts: [], respected: [],
  };
}

// ---------------------------------------------------------------- views

function dealIndex(state: TableState, seat: number): number {
  return state.deal ? state.deal.indexOfSeat(seat) : -1;
}

function seatOfIndex(state: TableState, index: number): number {
  return state.deal && index >= 0 ? state.deal.players[index].seat : -1;
}

function publicEvent(e: DealEvent, mySeat: number): any {
  var copy: any = {};
  for (var k in e) copy[k] = (e as any)[k];
  if (e.seat !== mySeat || mySeat < 0) delete copy.cards;
  return copy;
}

function viewFor(state: TableState, me: number): any {
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
  var d: any = null;
  if (deal) {
    var dead: any[] = [];
    for (var j = 0; j < deal.players.length; j++) {
      for (var m = 0; m < deal.players[j].minus.length; m++) dead.push({rank: deal.players[j].minus[m], seat: deal.players[j].seat});
    }
    var r = deal.reveal;
    var humanTurn = deal.phase === 'open' || deal.phase === 'reply';
    d = {
      phase: deal.phase, deck: deal.deck.length, pile: deal.pile.length, packets: deal.packets.slice(),
      packet: deal.packet.length, claim: deal.rank, actor: seatOfIndex(state, deal.actor),
      last: seatOfIndex(state, deal.last), opener: seatOfIndex(state, deal.opener),
      mandatory: deal.mandatory(), dead: dead, hand_size: deal.handSize, round: deal.rounds,
      reveal: r ? {card: r.card, truth: r.truth, loser: seatOfIndex(state, r.loser), checker: seatOfIndex(state, r.checker), rank: r.rank, count: r.count} : null,
      turn_total: humanTurn && state.turnDeadline > 0 ? state.timer : 0,
      turn_left: humanTurn && state.turnDeadline > 0 ? Math.max(0, (state.turnDeadline - state.tick) / CONFIG.tickRate - CONFIG.turnGraceSec) : 0,
    };
  }
  var hand: number[] = [];
  var mi = dealIndex(state, me);
  if (deal && mi >= 0) hand = deal.players[mi].hand.slice().sort(function (a, b) { return a - b; });
  var res: any = null;
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

function sendViews(state: TableState, dispatcher: nkruntime.MatchDispatcher, events: DealEvent[]): void {
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    if (!s.human || s.presence === null) continue;
    var mine = events.map(function (e) { return publicEvent(e, i); });
    dispatcher.broadcastMessage(OP_VIEW, JSON.stringify({view: viewFor(state, i), events: mine}), [s.presence]);
  }
  var watchers = state.watchers.map(function (w) { return w.presence; });
  if (watchers.length > 0) {
    var pub = events.map(function (e) { return publicEvent(e, -1); });
    dispatcher.broadcastMessage(OP_VIEW, JSON.stringify({view: viewFor(state, -1), events: pub}), watchers);
  }
}

function sendError(dispatcher: nkruntime.MatchDispatcher, presence: nkruntime.Presence, code: string): void {
  dispatcher.broadcastMessage(OP_ERROR, JSON.stringify({error: code}), [presence]);
}

/** Public history for the move log («История ходов»): no hidden cards. */
function recordHistory(state: TableState, events: DealEvent[]): void {
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.t === 'turn' || e.t === 'draw' || e.t === 'collect' || e.t === 'done') continue;
    var entry: any = {t: e.t, seat: e.seat};
    if (e.count !== undefined) entry.count = e.count;
    if (e.rank !== undefined) entry.rank = e.rank;
    if (e.t === 'reveal') {
      entry.card = e.card;
      entry.truth = e.truth;
      entry.loser = e.loser;
    }
    if (e.t === 'play') entry.open = e.open;
    state.history.push(entry);
  }
  if (state.history.length > CONFIG.historySize * 2) state.history = state.history.slice(-CONFIG.historySize);
}

// ---------------------------------------------------------------- flow

function startTable(state: TableState, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): DealEvent[] {
  if (state.kind === 'public') {
    while (state.seats.length < state.size) state.seats.push(newBot(state, nk));
  }
  var order: number[] = [];
  for (var i = 0; i < state.seats.length; i++) order.push(i);
  state.series = new Series(state.mode, order);
  state.result = null;
  state.history = [];
  for (var h = 0; h < state.seats.length; h++) {
    var s = state.seats[h];
    if (s.human && !s.left && state.kind !== 'lesson') setActiveMatch(nk, s.id, ctx.matchId as string);
  }
  logger.info('match start match=%s kind=%s mode=%s fee=%d seats=%d humans=%d',
    ctx.matchId, state.kind, state.mode, state.fee, state.seats.length, humansSeated(state).length);
  return beginDeal(state, logger, ctx);
}

function beginDeal(state: TableState, logger: nkruntime.Logger, ctx: nkruntime.Context): DealEvent[] {
  state.seed = cryptoSeedFromRng(state);
  var dealRng = makeRng(state.seed);
  var series = state.series as Series;
  state.deal = state.kind === 'lesson' ? lessonDeal() : series.nextDeal(dealRng);
  if (state.kind === 'lesson') series.dealNo = 1;
  state.phase = 'playing';
  state.result = null;
  for (var i = 0; i < state.seats.length; i++) state.seats[i].ready = state.seats[i].bot;
  state.history.push({t: 'deal', seat: -1, count: series.dealNo});
  logger.info('match deal match=%s deal=%d seed=%d first=%d players=%d', ctx.matchId, series.dealNo, state.seed, series.firstSeat, state.deal.players.length);
  var events = state.deal.takeEvents();
  events.unshift({t: 'deal', seat: -1, count: series.dealNo});
  scheduleTurn(state);
  return events;
}

/** The match RNG is seeded from a crypto source at init; every deal draws a fresh seed from it. */
function cryptoSeedFromRng(state: TableState): number {
  return Math.floor(state.rng.next() * 4294967296) >>> 0;
}

/** Arm the timer / bot move for whoever acts now. */
function scheduleTurn(state: TableState): void {
  state.actDue = 0;
  state.turnDeadline = 0;
  state.revealDue = 0;
  var deal = state.deal;
  if (!deal || state.phase !== 'playing') return;
  if (deal.phase === 'reveal') {
    state.revealDue = state.tick + secTicks(CONFIG.revealSec);
    return;
  }
  if (deal.phase !== 'open' && deal.phase !== 'reply') return;
  var seat = state.seats[deal.players[deal.actor].seat];
  var nobody = connectedHumans(state).length === 0;
  if (seat.bot || nobody) {
    state.actDue = state.tick + (nobody ? 1 : botDelay(state, CONFIG.botMinSec, CONFIG.botMaxSec));
  } else if (seat.away) {
    state.actDue = state.tick + botDelay(state, CONFIG.autoMinSec, CONFIG.autoMaxSec);
  } else {
    var limit = state.timer > 0 ? state.timer : seat.presence === null ? CONFIG.offlineTurnSec : 0;
    if (limit > 0) state.turnDeadline = state.tick + secTicks(limit + CONFIG.turnGraceSec);
  }
  state.turnStarted = state.tick;
}

function afterAction(state: TableState, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): void {
  var deal = state.deal as Deal;
  if (deal.phase !== 'done' && deal.rounds > CONFIG.maxDealRounds) {
    logger.error('match deal_round_cap match=%s rounds=%d', ctx.matchId, deal.rounds);
    deal.phase = 'done';
  }
  var events = deal.takeEvents();
  recordHistory(state, events);
  queueBotReactions(state, events);
  if (deal.phase === 'done') {
    events = events.concat(endDeal(state, nk, logger, dispatcher, ctx));
  } else {
    scheduleTurn(state);
  }
  sendViews(state, dispatcher, events);
}

function endDeal(state: TableState, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): DealEvent[] {
  var series = state.series as Series;
  var deal = state.deal as Deal;
  if (state.kind === 'lesson') {
    state.phase = 'finished';
    state.phaseDue = state.tick + secTicks(CONFIG.finishedSec);
    state.result = {standings: deal.standings(), out: [], placements: [], prizes: {}, final: true};
    var owner = state.seats[0];
    if (owner.human) updateProfile(nk, owner.id, function (p) { p.lessonDone = true; p.visited = true; });
    logger.info('match lesson_done match=%s user=%s', ctx.matchId, owner.id);
    return [];
  }
  var res = series.finishDeal(deal);
  logger.info('match deal_end match=%s deal=%d rounds=%d out=%s minus=%s', ctx.matchId, series.dealNo, deal.rounds,
    JSON.stringify(res.out), JSON.stringify(res.standings.map(function (s) { return [s.seat, s.minus]; })));
  for (var i = 0; i < res.out.length; i++) state.history.push({t: 'eliminated', seat: res.out[i]});
  if (series.isOver()) return finishTable(state, nk, logger, ctx);
  state.phase = 'interlude';
  state.phaseDue = state.tick + secTicks(CONFIG.interludeSec);
  state.result = {standings: res.standings, out: res.out, placements: series.placements(), prizes: {}, final: false};
  for (var k = 0; k < state.seats.length; k++) state.seats[k].ready = state.seats[k].bot || series.alive.indexOf(k) < 0;
  return [];
}

/** Placements, prizes (public tables only; bots and players who left get nothing), recent players. */
function finishTable(state: TableState, nk: nkruntime.Nakama, logger: nkruntime.Logger, ctx: nkruntime.Context): DealEvent[] {
  var series = state.series as Series;
  var placements = series.placements();
  var prizes = prizesFor(placements, state.kind, state.mode, state.fee);
  var paid: {[seat: number]: number} = {};
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    var coins = prizes[i] || 0;
    if (!s.human || s.left) {
      if (coins > 0) logger.info('match prize_burned match=%s seat=%d coins=%d', ctx.matchId, i, coins);
      continue;
    }
    paid[i] = coins;
    if (coins > 0) {
      try {
        changeChips(nk, logger, s.id, coins, 'table_prize', {match: ctx.matchId, place: placeOf(placements, i)});
      } catch (e) {
        logger.error('match prize_failed match=%s user=%s error=%s', ctx.matchId, s.id, String(e));
      }
    }
    clearActiveMatch(nk, s.id, ctx.matchId as string);
  }
  var humans = humansSeated(state);
  for (var h = 0; h < humans.length; h++) {
    var others: RecentPlayer[] = humans.filter(function (o) { return o.id !== humans[h].id; })
      .map(function (o) { return {id: o.id, name: o.name, avatar: o.avatar, time: Date.now()}; });
    if (others.length > 0 && state.kind !== 'lesson') addRecent(nk, humans[h].id, others);
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

function queueBotReactions(state: TableState, events: DealEvent[]): void {
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.t !== 'reveal' || e.loser === undefined) continue;
    var checker = state.seats[e.seat];
    var loser = state.seats[e.loser];
    if (checker && checker.bot && !checker.human && state.rng.next() < CONFIG.botReactChance) {
      // phrase 4 «Блефуешь!» when catching, emoji 4 😎 when the check went wrong.
      state.reactQueue.push(e.truth
        ? {due: state.tick + botDelay(state, 1, 3), seat: e.seat, kind: 'emoji', id: 2, target: -1}
        : {due: state.tick + botDelay(state, 1, 3), seat: e.seat, kind: 'phrase', id: 4, target: -1});
    } else if (loser && loser.bot && !loser.human && (e.count || 0) >= 8 && state.rng.next() < CONFIG.botReactChance) {
      state.reactQueue.push({due: state.tick + botDelay(state, 1, 3), seat: e.loser, kind: 'emoji', id: 2, target: -1});
    }
  }
}

/** Lesson (concept/formats.md «Учебная миссия»): Маша claims three kings, you open one card. */
function lessonDeal(): Deal {
  var d = new Deal([0, 1, 2, 3], 0, makeRng(42));
  var take: number[] = [];
  var keep = function (cards: number[]): number[] { take = take.concat(cards); return cards; };
  d.players[0].minus = [0];
  d.players[1].minus = [1];
  keep([0, 1, 2, 3, 4, 5, 6, 7]);
  d.packet = keep([44, 21, 46]);
  d.pile = keep([12, 15, 23, 28, 30, 32, 36, 41]).concat(d.packet);
  d.packets = [5, 3, 3];
  d.players[0].hand = keep([8, 17, 27, 38, 48, 34, 43]);
  var rest = fullDeck().filter(function (c) { return take.indexOf(c) < 0; });
  for (var p = 1; p < 4; p++) {
    var hand: number[] = [];
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

function handleMessage(state: TableState, m: nkruntime.MatchMessage, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): void {
  var data: any = {};
  try {
    var text = nk.binaryToString(m.data);
    data = text ? JSON.parse(text) : {};
  } catch (e) {
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
      if (!isHost || state.phase !== 'waiting') return sendError(dispatcher, m.sender, 'not_host');
      if (data.mode === 'quick' || data.mode === 'series') state.mode = data.mode;
      if (typeof data.size === 'number' && data.size >= CONFIG.minSeats && data.size <= CONFIG.maxSeats) {
        state.size = Math.max(Math.floor(data.size), state.seats.length);
      }
      if (CONFIG.roomTimers.indexOf(data.timer) >= 0) state.timer = data.timer;
      sendViews(state, dispatcher, []);
      return;
    case OP_ADD_BOT:
      if (!isHost || state.phase !== 'waiting') return sendError(dispatcher, m.sender, 'not_host');
      if (state.seats.length >= state.size) return sendError(dispatcher, m.sender, 'room_full');
      state.seats.push(newBot(state, nk));
      sendViews(state, dispatcher, []);
      return;
    case OP_REMOVE_BOT:
      if (!isHost || state.phase !== 'waiting') return sendError(dispatcher, m.sender, 'not_host');
      var b = Number(data.seat);
      if (state.seats[b] && state.seats[b].bot && !state.seats[b].human) state.seats.splice(b, 1);
      sendViews(state, dispatcher, []);
      return;
    case OP_START:
      if (!isHost || state.phase !== 'waiting') return sendError(dispatcher, m.sender, 'not_host');
      if (state.seats.length < CONFIG.minSeats) return sendError(dispatcher, m.sender, 'need_players');
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

function handleMove(state: TableState, seat: number, m: nkruntime.MatchMessage, data: any, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): void {
  var deal = state.deal;
  if (state.phase !== 'playing' || !deal || seat < 0) return sendError(dispatcher, m.sender, 'bad_phase');
  var index = deal.indexOfSeat(seat);
  if (index < 0 || index !== deal.actor) return sendError(dispatcher, m.sender, 'not_your_turn');
  if (state.seats[seat].away) return sendError(dispatcher, m.sender, 'away');
  var err: string;
  if (m.opCode === OP_PLAY) {
    if (state.kind === 'lesson') return sendError(dispatcher, m.sender, 'lesson_check_only');
    var cards = Array.isArray(data.cards) ? data.cards.map(Number) : [];
    err = deal.play(index, cards, Number(data.rank));
    logger.info('match move match=%s seat=%d kind=%s count=%d claim=%d err=%s', ctx.matchId, seat,
      deal.phase === 'reply' && err === '' && deal.packets.length === 1 ? 'open' : 'play', cards.length, deal.rank, err || 'ok');
  } else {
    err = deal.check(index, Number(data.index));
    logger.info('match check match=%s seat=%d pick=%d err=%s', ctx.matchId, seat, Number(data.index), err || 'ok');
  }
  if (err) return sendError(dispatcher, m.sender, err);
  state.seats[seat].skips = 0;
  afterAction(state, nk, logger, dispatcher, ctx);
}

function handleReact(state: TableState, seat: number, sender: nkruntime.Presence, data: any, dispatcher: nkruntime.MatchDispatcher): void {
  if (seat < 0) return;
  var kind = String(data.kind);
  var id = Number(data.id);
  if (!(kind in REACTION_KINDS) || id % 1 !== 0 || id < 0 || id >= REACTION_KINDS[kind]) return sendError(dispatcher, sender, 'bad_reaction');
  var s = state.seats[seat];
  var now = state.tick;
  var windowTicks = secTicks(CONFIG.reactWindowSec);
  s.reacts = s.reacts.filter(function (t) { return now - t < windowTicks; });
  var lastAt = s.reacts.length ? s.reacts[s.reacts.length - 1] : -1000000;
  if (now - lastAt < secTicks(CONFIG.reactGapSec) || s.reacts.length >= CONFIG.reactMax) return sendError(dispatcher, sender, 'reaction_rate');
  s.reacts.push(now);
  var target = kind === 'throw' ? Number(data.target) : -1;
  if (kind === 'throw' && (!state.seats[target] || target === seat)) return sendError(dispatcher, sender, 'bad_target');
  broadcastReaction(state, dispatcher, seat, kind, id, target);
}

function broadcastReaction(state: TableState, dispatcher: nkruntime.MatchDispatcher, seat: number, kind: string, id: number, target: number): void {
  var presences = connectedHumans(state).map(function (s) { return s.presence as nkruntime.Presence; })
    .concat(state.watchers.map(function (w) { return w.presence; }));
  if (presences.length) dispatcher.broadcastMessage(OP_REACTION, JSON.stringify({seat: seat, kind: kind, id: id, target: target}), presences);
}

function giveRespect(state: TableState, seat: number, target: number, nk: nkruntime.Nakama, logger: nkruntime.Logger, ctx: nkruntime.Context): void {
  if (state.phase !== 'finished' || seat < 0 || target === seat || !state.seats[target]) return;
  var giver = state.seats[seat];
  var to = state.seats[target];
  if (giver.respected.indexOf(to.id) >= 0) return;
  giver.respected.push(to.id);
  to.respect++;
  if (to.human) updateProfile(nk, to.id, function (p) { p.respect++; });
  logger.info('match respect match=%s from=%d to=%d', ctx.matchId, seat, target);
}

/** Friends room «Ещё раз»: same company back to the room, queued friends take free seats. */
function resetRoom(state: TableState): void {
  state.seats = state.seats.filter(function (s) { return !s.human || (!s.left && s.presence !== null); });
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    s.away = false;
    s.skips = 0;
    s.ready = false;
    s.respected = [];
  }
  while (state.watchers.length > 0 && state.seats.length < state.size) {
    var w = state.watchers.shift() as Watcher;
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
function leaveTable(state: TableState, presence: nkruntime.Presence, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context, voluntary: boolean): void {
  state.watchers = state.watchers.filter(function (w) { return w.presence.sessionId !== presence.sessionId; });
  var seat = seatOfUser(state, presence.userId);
  if (seat < 0) return;
  var s = state.seats[seat];
  if (s.presence && s.presence.sessionId !== presence.sessionId) return;
  if (state.phase === 'waiting') {
    if (s.paid > 0) {
      try {
        changeChips(nk, logger, s.id, s.paid, 'fee_refund', {match: ctx.matchId});
      } catch (e) {
        logger.error('match refund_failed user=%s error=%s', s.id, String(e));
      }
    }
    state.seats.splice(seat, 1);
    if (state.kind === 'friends' && s.id === state.host) {
      var next = humansSeated(state);
      state.host = next.length ? next[0].id : '';
    }
    logger.info('match seat_free match=%s user=%s', ctx.matchId, s.id);
  } else if (voluntary && state.phase !== 'finished') {
    s.left = true;
    s.bot = true;
    s.presence = null;
    clearActiveMatch(nk, s.id, ctx.matchId as string);
    logger.info('match left match=%s seat=%d fee_burned=%d', ctx.matchId, seat, s.paid);
    scheduleTurnIfActor(state, seat);
  } else {
    s.presence = null;
    if (voluntary) clearActiveMatch(nk, s.id, ctx.matchId as string);
    logger.info('match disconnect match=%s seat=%d', ctx.matchId, seat);
    scheduleTurnIfActor(state, seat);
  }
  updateLabel(state, dispatcher);
  sendViews(state, dispatcher, []);
}

function scheduleTurnIfActor(state: TableState, seat: number): void {
  var deal = state.deal;
  if (state.phase === 'playing' && deal && (deal.phase === 'open' || deal.phase === 'reply') && deal.players[deal.actor].seat === seat) {
    scheduleTurn(state);
  }
}

// ---------------------------------------------------------------- handler

var matchInit: nkruntime.MatchInitFunction<TableState> = function (ctx, logger, nk, params) {
  var kind = String(params.kind || 'public');
  var mode = params.mode === 'series' ? 'series' : 'quick';
  var fee = Number(params.fee || 0);
  if (kind === 'public' && fee > 0) mode = 'series';
  var state: TableState = {
    kind: kind, mode: mode, fee: fee,
    size: kind === 'public' ? CONFIG.publicSeats[mode] : kind === 'lesson' ? 4 : Number(params.size || 4),
    timer: kind === 'public' ? CONFIG.turnSec : kind === 'lesson' ? 0 : CONFIG.roomTimers[0],
    phase: 'waiting', seats: [], watchers: [], host: String(params.host || ''), code: String(params.code || ''),
    company: String(params.company || ''), owner: String(params.owner || ''),
    searchDeadline: 0, series: null, deal: null, rng: new SeedRng(cryptoSeed(nk)), seed: 0,
    actDue: 0, turnDeadline: 0, turnStarted: 0, revealDue: 0, phaseDue: 0, emptySince: 0,
    history: [], result: null, reactQueue: [], label: '', tick: 0,
  };
  state.label = JSON.stringify({k: kind, m: mode, f: fee, o: kind === 'public' ? 1 : 0, u: []});
  logger.info('match init kind=%s mode=%s fee=%d code=%s', kind, mode, fee, state.code);
  return {state: state, tickRate: CONFIG.tickRate, label: state.label};
};

var matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state, presence) {
  state = rehydrate(state);
  if (seatOfUser(state, presence.userId) >= 0) return {state: state, accept: true};
  if (state.kind === 'lesson') return {state: state, accept: presence.userId === state.owner, rejectMessage: 'lesson'};
  if (state.kind === 'public') {
    if (state.phase !== 'waiting' || state.seats.length >= state.size) return {state: state, accept: false, rejectMessage: 'table_full'};
    if (state.fee > 0 && chipsOf(nk, presence.userId) < state.fee) return {state: state, accept: false, rejectMessage: 'not_enough_chips'};
  }
  return {state: state, accept: true};
};

var matchJoin: nkruntime.MatchJoinFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  state = rehydrate(state);
  state.tick = tick;
  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    var seat = seatOfUser(state, p.userId);
    if (seat >= 0) {
      var s = state.seats[seat];
      if (s.left) {
        // Left the table on purpose: the bot keeps the seat, the player only watches.
        state.watchers.push({id: p.userId, name: s.name, presence: p});
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
          changeChips(nk, logger, p.userId, -state.fee, 'table_fee', {match: ctx.matchId});
          ns.paid = state.fee;
        } catch (e) {
          sendError(dispatcher, p, 'not_enough_chips');
          dispatcher.matchKick([p]);
          continue;
        }
      }
      if (state.kind === 'friends' && !state.host) state.host = p.userId;
      state.seats.push(ns);
      if (state.kind === 'public' && state.searchDeadline === 0) state.searchDeadline = tick + secTicks(CONFIG.searchSec);
      logger.info('match seat match=%s user=%s seat=%d paid=%d', ctx.matchId, p.userId, state.seats.length - 1, ns.paid);
    } else {
      state.watchers.push({id: p.userId, name: displayNameOf(nk, p.userId), presence: p});
      logger.info('match watcher match=%s user=%s', ctx.matchId, p.userId);
    }
  }
  var events: DealEvent[] = [];
  if (state.phase === 'waiting' && (state.kind === 'lesson' || (state.kind === 'public' && state.seats.length >= state.size))) {
    if (state.kind === 'lesson') {
      state.seats.push(newBot(state, nk, 'Ира', 0), newBot(state, nk, 'Макс', 2), newBot(state, nk, 'Маша', 1));
    }
    events = startTable(state, nk, logger, dispatcher, ctx);
  }
  updateLabel(state, dispatcher);
  sendViews(state, dispatcher, events);
  return {state: state};
};

var matchLeave: nkruntime.MatchLeaveFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  state = rehydrate(state);
  state.tick = tick;
  for (var i = 0; i < presences.length; i++) leaveTable(state, presences[i], nk, logger, dispatcher, ctx, false);
  return {state: state};
};

var matchLoop: nkruntime.MatchLoopFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state, messages) {
  state = rehydrate(state);
  state.tick = tick;
  for (var i = 0; i < messages.length; i++) handleMessage(state, messages[i], nk, logger, dispatcher, ctx);

  var anyone = connectedHumans(state).length + state.watchers.length > 0;
  if (!anyone) {
    if (state.emptySince === 0) state.emptySince = tick;
  } else {
    state.emptySince = 0;
  }

  // Reactions of bots, after a human-like pause.
  var due = state.reactQueue.filter(function (r) { return r.due <= tick; });
  state.reactQueue = state.reactQueue.filter(function (r) { return r.due > tick; });
  for (var q = 0; q < due.length; q++) broadcastReaction(state, dispatcher, due[q].seat, due[q].kind, due[q].id, due[q].target);

  switch (state.phase) {
    case 'waiting':
      // A new table waits for its first player; an abandoned lobby closes.
      if (!anyone && state.emptySince > 0 && tick - state.emptySince > secTicks(CONFIG.emptyRoomSec)) return null;
      if (state.kind === 'public' && state.seats.length > 0 && state.searchDeadline > 0 && tick >= state.searchDeadline) {
        sendViews(state, dispatcher, startTable(state, nk, logger, dispatcher, ctx));
        updateLabel(state, dispatcher);
      }
      break;
    case 'playing':
      loopPlaying(state, nk, logger, dispatcher, ctx);
      break;
    case 'interlude':
      var alive = (state.series as Series).alive;
      var allReady = state.seats.every(function (s, k) { return s.ready || s.presence === null || alive.indexOf(k) < 0; });
      if (tick >= state.phaseDue || allReady || !anyone) {
        sendViews(state, dispatcher, beginDeal(state, logger, ctx));
      }
      break;
    case 'finished':
      if (state.kind === 'friends') {
        if (!anyone && tick - state.emptySince > secTicks(CONFIG.emptyRoomSec)) return null;
      } else if (tick >= state.phaseDue || (!anyone && tick - state.emptySince > secTicks(2))) {
        return null;
      }
      break;
  }
  return {state: state};
};

function loopPlaying(state: TableState, nk: nkruntime.Nakama, logger: nkruntime.Logger, dispatcher: nkruntime.MatchDispatcher, ctx: nkruntime.Context): void {
  var deal = state.deal as Deal;
  var tick = state.tick;
  if (deal.phase === 'reveal') {
    if (state.revealDue > 0 && tick >= state.revealDue) {
      deal.settle();
      // The lesson is one check: once the pile has moved, the mission is over.
      if (state.kind === 'lesson') deal.phase = 'done';
      afterAction(state, nk, logger, dispatcher, ctx);
    }
    return;
  }
  if (deal.phase !== 'open' && deal.phase !== 'reply') return;
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
    if (seat.skips >= CONFIG.awaySkips) seat.away = true;
    logger.info('match timeout match=%s seat=%d skips=%d away=%s', ctx.matchId, seatIndex, seat.skips, String(seat.away));
    botAct(deal, BOT_STYLES[0], state.rng);
    afterAction(state, nk, logger, dispatcher, ctx);
  }
}

var matchTerminate: nkruntime.MatchTerminateFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state) {
  state = rehydrate(state);
  if (state.code) clearRoomMatch(nk, state.code, ctx.matchId as string);
  for (var i = 0; i < state.seats.length; i++) {
    if (state.seats[i].human) clearActiveMatch(nk, state.seats[i].id, ctx.matchId as string);
  }
  logger.info('match terminate match=%s phase=%s', ctx.matchId, state.phase);
  return {state: state};
};

/** Signals: `seated:<userId>` → "yes" while that player still has a seat (rejoin after restart). */
var matchSignal: nkruntime.MatchSignalFunction<TableState> = function (ctx, logger, nk, dispatcher, tick, state, data) {
  state = rehydrate(state);
  var parts = String(data).split(':');
  if (parts[0] === 'seated') {
    var seat = seatOfUser(state, parts[1]);
    var ok = seat >= 0 && !state.seats[seat].left && state.phase !== 'finished';
    return {state: state, data: ok ? 'yes' : 'no'};
  }
  return {state: state, data: ''};
};
