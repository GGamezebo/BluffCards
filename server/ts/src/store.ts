// Server-side data: wallet + chips leaderboard, player profile, recent opponents, companies,
// room codes, block list, active table. Only server code writes these (clients read via RPC).

interface Profile {
  visited: boolean;
  lessonDone: boolean;
  respect: number;
  avatar: number;
}

function readObject(nk: nkruntime.Nakama, userId: string, key: string): {value: any; version: string} | null {
  var objects = nk.storageRead([{collection: COLLECTION, key: key, userId: userId}]);
  if (!objects || objects.length === 0) return null;
  return {value: objects[0].value, version: objects[0].version};
}

function writeObject(nk: nkruntime.Nakama, userId: string, key: string, value: any, version?: string): void {
  var req: nkruntime.StorageWriteRequest = {
    collection: COLLECTION, key: key, userId: userId, value: value, permissionRead: 1, permissionWrite: 0,
  };
  if (version !== undefined) req.version = version;
  nk.storageWrite([req]);
}

function hashString(text: string): number {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function defaultAvatar(userId: string): number {
  return hashString(userId) % AVATAR_COUNT;
}

function readProfile(nk: nkruntime.Nakama, userId: string): Profile {
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
function updateProfile(nk: nkruntime.Nakama, userId: string, change: (p: Profile) => void): void {
  for (var attempt = 0; attempt < 3; attempt++) {
    var obj = readObject(nk, userId, 'profile');
    var p = readProfile(nk, userId);
    change(p);
    try {
      writeObject(nk, userId, 'profile', p, obj ? obj.version : '*');
      return;
    } catch (e) {
      // Version conflict: retry with the fresh object.
    }
  }
}

function chipsOf(nk: nkruntime.Nakama, userId: string): number {
  var account = nk.accountGetId(userId);
  return Number((account.wallet || {})[WALLET_KEY] || 0);
}

function displayNameOf(nk: nkruntime.Nakama, userId: string): string {
  var account = nk.accountGetId(userId);
  return account.user.displayName || account.user.username;
}

/** Change chips and refresh the leaderboard. Throws when the wallet would go negative. */
function changeChips(nk: nkruntime.Nakama, logger: nkruntime.Logger, userId: string, delta: number, reason: string, meta: {[k: string]: any}): number {
  var changeset: {[key: string]: number} = {};
  changeset[WALLET_KEY] = delta;
  var metadata: {[k: string]: any} = {reason: reason};
  for (var k in meta) metadata[k] = meta[k];
  var result = nk.walletUpdate(userId, changeset, metadata, true);
  var balance = Number(result.updated[WALLET_KEY] || 0);
  writeChipsRecord(nk, userId, balance);
  logger.info('wallet change user=%s delta=%d balance=%d reason=%s', userId, delta, balance, reason);
  return balance;
}

function writeChipsRecord(nk: nkruntime.Nakama, userId: string, balance: number): void {
  var account = nk.accountGetId(userId);
  var name = account.user.displayName || account.user.username;
  nk.leaderboardRecordWrite(LEADERBOARD_CHIPS, userId, name, balance, 0,
    {avatar: readProfile(nk, userId).avatar}, nkruntime.OverrideOperator.SET);
}

function setActiveMatch(nk: nkruntime.Nakama, userId: string, matchId: string): void {
  writeObject(nk, userId, 'active', {matchId: matchId});
}

function clearActiveMatch(nk: nkruntime.Nakama, userId: string, matchId: string): void {
  var obj = readObject(nk, userId, 'active');
  if (obj && obj.value.matchId === matchId) writeObject(nk, userId, 'active', {matchId: ''});
}

function activeMatchOf(nk: nkruntime.Nakama, userId: string): string {
  var obj = readObject(nk, userId, 'active');
  return obj ? String(obj.value.matchId || '') : '';
}

interface RecentPlayer {
  id: string;
  name: string;
  avatar: number;
  time: number;
}

function addRecent(nk: nkruntime.Nakama, userId: string, others: RecentPlayer[]): void {
  var obj = readObject(nk, userId, 'recent');
  var list: RecentPlayer[] = obj ? obj.value.players || [] : [];
  var ids = others.map(function (o) { return o.id; });
  list = others.concat(list.filter(function (r) { return ids.indexOf(r.id) < 0; })).slice(0, CONFIG.recentSize);
  writeObject(nk, userId, 'recent', {players: list});
}

function readRecent(nk: nkruntime.Nakama, userId: string): RecentPlayer[] {
  var obj = readObject(nk, userId, 'recent');
  return obj ? obj.value.players || [] : [];
}

interface Company {
  id: string;
  name: string;
  code: string;
  members: string[];
}

function readCompanies(nk: nkruntime.Nakama, userId: string): Company[] {
  var obj = readObject(nk, userId, 'companies');
  return obj ? obj.value.companies || [] : [];
}

function writeCompanies(nk: nkruntime.Nakama, userId: string, list: Company[]): void {
  writeObject(nk, userId, 'companies', {companies: list});
}

function readBlocked(nk: nkruntime.Nakama, userId: string): string[] {
  var obj = readObject(nk, userId, 'blocked');
  return obj ? obj.value.ids || [] : [];
}

function newRoomCode(): string {
  var code = '';
  for (var i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length));
  }
  return code;
}

/** Room code → match id (system-owned, so codes are global). */
function roomMatchOf(nk: nkruntime.Nakama, code: string): string {
  var objects = nk.storageRead([{collection: ROOM_CODES, key: code, userId: SYSTEM_USER}]);
  if (!objects || objects.length === 0) return '';
  var matchId = String(objects[0].value.matchId || '');
  if (matchId && nk.matchGet(matchId) === null) return '';
  return matchId;
}

function setRoomMatch(nk: nkruntime.Nakama, code: string, matchId: string): void {
  nk.storageWrite([{
    collection: ROOM_CODES, key: code, userId: SYSTEM_USER,
    value: {matchId: matchId}, permissionRead: 0, permissionWrite: 0,
  }]);
}

function clearRoomMatch(nk: nkruntime.Nakama, code: string, matchId: string): void {
  if (roomMatchOf(nk, code) === matchId || roomMatchOf(nk, code) === '') {
    nk.storageDelete([{collection: ROOM_CODES, key: code, userId: SYSTEM_USER}]);
  }
}

/** Seed from a crypto source (uuid v4 uses the OS CSPRNG); logged per deal for disputes. */
function cryptoSeed(nk: nkruntime.Nakama): number {
  return parseInt(nk.uuidv4().replace(/-/g, '').slice(0, 8), 16) >>> 0;
}
