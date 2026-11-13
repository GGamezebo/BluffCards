// Balance and timing knobs of the server (one place, no literals in handler code).
// Env overrides come from nakama/local.yml `runtime.env` (tests speed bots up).

interface ServerConfig {
  /** Match loop ticks per second. */
  tickRate: number;
  /** Public table: seconds of waiting before bots take the free seats. */
  searchSec: number;
  /** Turn timer of public tables. */
  turnSec: number;
  /** Friends room timer choices (0 = off). */
  roomTimers: number[];
  /** Extra seconds on top of the turn timer for the client's animations. */
  turnGraceSec: number;
  /** A disconnected player with the timer off still gets replaced after this many seconds. */
  offlineTurnSec: number;
  /** Consecutive timeouts before the player is marked «отошёл». */
  awaySkips: number;
  /** Pause on the revealed card before the pile moves. */
  revealSec: number;
  /** Human-like bot thinking time, seconds. */
  botMinSec: number;
  botMaxSec: number;
  /** Bot moves for an away / left player. */
  autoMinSec: number;
  autoMaxSec: number;
  /** Multiplier for all bot delays (tests set it near 0). */
  botDelayScale: number;
  /** Series: pause between deals unless everybody pressed «Дальше». */
  interludeSec: number;
  /** Finished public / lesson table stays open for respect and results. */
  finishedSec: number;
  /** Empty friends room (or lobby) closes after this many seconds. */
  emptyRoomSec: number;
  /** Seats of the public tables («Быстрая игра» 4, «На вылет» 6). */
  publicSeats: {[mode: string]: number};
  maxSeats: number;
  minSeats: number;
  startingChips: number;
  /** Reactions anti-spam: min gap and max count in a window. */
  reactGapSec: number;
  reactWindowSec: number;
  reactMax: number;
  /** Chance a bot reacts to a reveal that involves it. */
  botReactChance: number;
  historySize: number;
  /** Safety net: a deal longer than this many rounds is closed (never seen in 3000 bot deals: max ~110). */
  maxDealRounds: number;
  recentSize: number;
}

var CONFIG: ServerConfig = {
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
  publicSeats: {quick: 4, series: 6},
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

function applyEnvConfig(env: {[key: string]: string}): void {
  if (!env) return;
  if (env['BC_SEARCH_SEC']) CONFIG.searchSec = Number(env['BC_SEARCH_SEC']);
  if (env['BC_BOT_DELAY_SCALE']) CONFIG.botDelayScale = Number(env['BC_BOT_DELAY_SCALE']);
  if (env['BC_REVEAL_SEC']) CONFIG.revealSec = Number(env['BC_REVEAL_SEC']);
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
