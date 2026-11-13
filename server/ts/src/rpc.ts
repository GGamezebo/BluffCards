// RPCs of the lobby (concept/design catalog): profile, tables, friends rooms and companies,
// leaderboard, friends, report / block, account. Payloads are JSON; errors come back as {error}.

var NOTIFY_ROOM_INVITE = 100;

function ok(value: {[key: string]: any}): string {
  return JSON.stringify(value);
}

function fail(code: string): string {
  return JSON.stringify({error: code});
}

function parse(payload: string): any {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (e) {
    return {};
  }
}

function providerOf(account: nkruntime.Account): string {
  if (account.user.appleId) return 'Apple';
  if (account.user.googleId) return 'Google';
  if (account.customId && account.customId.indexOf('tg_') === 0) return 'Telegram';
  return 'guest';
}

/** Still-seated table of the player (rejoin after a restart), else ''. */
function liveActiveMatch(nk: nkruntime.Nakama, userId: string): string {
  var matchId = activeMatchOf(nk, userId);
  if (!matchId) return '';
  try {
    if (nk.matchGet(matchId) === null) return '';
    return nk.matchSignal(matchId, 'seated:' + userId) === 'yes' ? matchId : '';
  } catch (e) {
    return '';
  }
}

var rpcProfile: nkruntime.RpcFunction = function (ctx, logger, nk) {
  var userId = ctx.userId as string;
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

var rpcMarkVisited: nkruntime.RpcFunction = function (ctx, logger, nk) {
  updateProfile(nk, ctx.userId as string, function (p) { p.visited = true; });
  return ok({ok: true});
};

/** Matchmaking: an open table of this kind without blocked players, else a new one. */
var rpcFindTable: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var req = parse(payload);
  var userId = ctx.userId as string;
  var mode = req.mode === 'series' ? 'series' : 'quick';
  var fee = Number(req.fee || 0);
  if (fee > 0) {
    if (PAID_FEES.indexOf(fee) < 0) return fail('bad_fee');
    mode = 'series';
    if (chipsOf(nk, userId) < fee) return fail('not_enough_chips');
  }
  var blocked = readBlocked(nk, userId);
  var query = '+label.k:public +label.m:' + mode + ' +label.f:' + fee + ' +label.o:1';
  var matches = nk.matchList(20, true, null, 0, CONFIG.publicSeats[mode], query) || [];
  for (var i = 0; i < matches.length; i++) {
    var label: any = {};
    try {
      label = JSON.parse(matches[i].label);
    } catch (e) {
      continue;
    }
    var users: string[] = label.u || [];
    if (users.indexOf(userId) >= 0) return ok({match_id: matches[i].matchId});
    var clash = users.some(function (u) { return blocked.indexOf(u) >= 0 || readBlocked(nk, u).indexOf(userId) >= 0; });
    if (!clash) return ok({match_id: matches[i].matchId});
  }
  var matchId = nk.matchCreate(MATCH_MODULE, {kind: 'public', mode: mode, fee: fee});
  logger.info('rpc find_table created match=%s mode=%s fee=%d user=%s', matchId, mode, fee, userId);
  return ok({match_id: matchId});
};

function createRoomMatch(nk: nkruntime.Nakama, logger: nkruntime.Logger, userId: string, code: string, company: string): string {
  var matchId = nk.matchCreate(MATCH_MODULE, {kind: 'friends', host: userId, code: code, company: company});
  setRoomMatch(nk, code, matchId);
  logger.info('rpc room_created match=%s code=%s user=%s', matchId, code, userId);
  return matchId;
}

function freeRoomCode(nk: nkruntime.Nakama): string {
  for (var i = 0; i < 10; i++) {
    var code = newRoomCode();
    var taken = nk.storageRead([{collection: ROOM_CODES, key: code, userId: SYSTEM_USER}]);
    if (!taken || taken.length === 0) return code;
  }
  return newRoomCode();
}

var rpcCreateRoom: nkruntime.RpcFunction = function (ctx, logger, nk) {
  var userId = ctx.userId as string;
  var code = freeRoomCode(nk);
  var name = displayNameOf(nk, userId);
  return ok({match_id: createRoomMatch(nk, logger, userId, code, 'Стол · ' + name), code: code});
};

/** A code from an invite: the room alive now, or a fresh room for a company's permanent code. */
var rpcJoinRoom: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var code = String(parse(payload).code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return fail('bad_code');
  var objects = nk.storageRead([{collection: ROOM_CODES, key: code, userId: SYSTEM_USER}]);
  if (!objects || objects.length === 0) return fail('room_not_found');
  var value = objects[0].value;
  var matchId = String(value.matchId || '');
  if (matchId && nk.matchGet(matchId) !== null) return ok({match_id: matchId, code: code});
  if (!value.company) return fail('room_not_found');
  return ok({match_id: createRoomMatch(nk, logger, ctx.userId as string, code, String(value.company)), code: code});
};

var rpcLesson: nkruntime.RpcFunction = function (ctx, logger, nk) {
  var matchId = nk.matchCreate(MATCH_MODULE, {kind: 'lesson', owner: ctx.userId});
  return ok({match_id: matchId});
};

var rpcLeaders: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var userId = ctx.userId as string;
  var scope = parse(payload).scope === 'friends' ? 'friends' : 'all';
  var rows: any[] = [];
  var mine: any = null;
  var toRow = function (r: nkruntime.LeaderboardRecord): any {
    return {rank: r.rank, user_id: r.ownerId, name: r.username, score: r.score, avatar: (r.metadata || {}).avatar || 0, me: r.ownerId === userId};
  };
  if (scope === 'all') {
    var list = nk.leaderboardRecordsList(LEADERBOARD_CHIPS, [userId], 50);
    rows = (list.records || []).map(toRow);
    if (list.ownerRecords && list.ownerRecords.length) mine = toRow(list.ownerRecords[0]);
  } else {
    var owners = [userId];
    var friends = nk.friendsList(userId, 100, 0).friends || [];
    for (var i = 0; i < friends.length; i++) if (friends[i].user) owners.push((friends[i].user as nkruntime.User).userId);
    var fl = nk.leaderboardRecordsList(LEADERBOARD_CHIPS, owners, 0);
    rows = (fl.ownerRecords || []).map(toRow).sort(function (a: any, b: any) { return b.score - a.score; });
    for (var k = 0; k < rows.length; k++) {
      rows[k].rank = k + 1;
      if (rows[k].me) mine = rows[k];
    }
  }
  return ok({scope: scope, rows: rows, me: mine});
};

var rpcSocial: nkruntime.RpcFunction = function (ctx, logger, nk) {
  var userId = ctx.userId as string;
  var friends = (nk.friendsList(userId, 100).friends || []).filter(function (f) { return f.user && f.state !== 3; })
    .map(function (f) {
      var u = f.user as nkruntime.User;
      return {id: u.userId, name: u.displayName || u.username, online: u.online, state: f.state,
        avatar: readProfile(nk, u.userId).avatar};
    });
  return ok({friends: friends, recent: readRecent(nk, userId), companies: readCompanies(nk, userId)});
};

/** Friend request (mutual once the other side adds back). Bots' ids are ignored quietly. */
var rpcAddFriend: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var target = String(parse(payload).user_id || '');
  if (!target || target === ctx.userId) return fail('bad_user');
  try {
    nk.friendsAdd(ctx.userId as string, ctx.username as string, [target], [], {});
  } catch (e) {
    logger.debug('rpc add_friend skipped user=%s target=%s', ctx.userId, target);
  }
  return ok({ok: true});
};

var rpcCreateCompany: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var req = parse(payload);
  var userId = ctx.userId as string;
  var name = String(req.name || '').trim().slice(0, 24);
  if (!name) return fail('bad_name');
  var members: string[] = Array.isArray(req.members) ? req.members.map(String).slice(0, 9) : [];
  var list = readCompanies(nk, userId);
  var code = freeRoomCode(nk);
  var company: Company = {id: nk.uuidv4(), name: name, code: code, members: members};
  list.push(company);
  writeCompanies(nk, userId, list);
  nk.storageWrite([{
    collection: ROOM_CODES, key: code, userId: SYSTEM_USER,
    value: {matchId: '', company: name, owner: userId}, permissionRead: 0, permissionWrite: 0,
  }]);
  logger.info('rpc company_created user=%s code=%s members=%d', userId, code, members.length);
  return ok({company: company});
};

/** Company room by its permanent code: join the live one or open it. */
var rpcOpenCompany: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var userId = ctx.userId as string;
  var id = String(parse(payload).company_id || '');
  var company = readCompanies(nk, userId).filter(function (c) { return c.id === id; })[0];
  if (!company) return fail('company_not_found');
  var live = roomMatchOf(nk, company.code);
  if (live) return ok({match_id: live, code: company.code});
  var matchId = nk.matchCreate(MATCH_MODULE, {kind: 'friends', host: userId, code: company.code, company: company.name});
  nk.storageWrite([{
    collection: ROOM_CODES, key: company.code, userId: SYSTEM_USER,
    value: {matchId: matchId, company: company.name, owner: userId}, permissionRead: 0, permissionWrite: 0,
  }]);
  return ok({match_id: matchId, code: company.code});
};

/** In-app invites (socket notifications); push services come with the platform builds. */
var rpcInvite: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var req = parse(payload);
  var userId = ctx.userId as string;
  var code = String(req.code || '').toUpperCase();
  if (!roomMatchOf(nk, code)) return fail('room_not_found');
  var ids: string[] = Array.isArray(req.user_ids) ? req.user_ids.map(String) : [];
  if (req.company_id) {
    var company = readCompanies(nk, userId).filter(function (c) { return c.id === String(req.company_id); })[0];
    if (company) ids = ids.concat(company.members);
  }
  var name = displayNameOf(nk, userId);
  var sent = 0;
  for (var i = 0; i < ids.length && i < 20; i++) {
    if (ids[i] === userId) continue;
    try {
      nk.notificationSend(ids[i], name + ' зовёт за стол', {code: code, from: name}, NOTIFY_ROOM_INVITE, userId, true);
      sent++;
    } catch (e) {
      logger.debug('rpc invite skipped target=%s', ids[i]);
    }
  }
  logger.info('rpc invite user=%s code=%s sent=%d', userId, code, sent);
  return ok({sent: sent});
};

var rpcReport: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var req = parse(payload);
  nk.storageWrite([{
    collection: 'reports', key: nk.uuidv4(), userId: SYSTEM_USER,
    value: {from: ctx.userId, target: String(req.user_id || ''), reason: String(req.reason || '').slice(0, 40), time: Date.now()},
    permissionRead: 0, permissionWrite: 0,
  }]);
  logger.info('rpc report from=%s target=%s', ctx.userId, String(req.user_id || ''));
  return ok({ok: true});
};

var rpcBlock: nkruntime.RpcFunction = function (ctx, logger, nk, payload) {
  var userId = ctx.userId as string;
  var target = String(parse(payload).user_id || '');
  if (!target) return fail('bad_user');
  var ids = readBlocked(nk, userId);
  if (ids.indexOf(target) < 0) ids.push(target);
  writeObject(nk, userId, 'blocked', {ids: ids.slice(-200)});
  return ok({ok: true});
};

/** Store requirement: delete the account from inside the app. */
var rpcDeleteAccount: nkruntime.RpcFunction = function (ctx, logger, nk) {
  var userId = ctx.userId as string;
  logger.info('rpc delete_account user=%s', userId);
  nk.leaderboardRecordDelete(LEADERBOARD_CHIPS, userId);
  nk.accountDeleteId(userId, false);
  return ok({ok: true});
};

/** Platform sign-in (Google / Apple / Telegram) needs the platform SDKs of the store builds. */
var rpcLink: nkruntime.RpcFunction = function () {
  return fail('provider_unavailable');
};

/** New player: guest name, starting chips, leaderboard row. */
var afterAuthenticateDevice: nkruntime.AfterHookFunction<nkruntime.Session, nkruntime.AuthenticateDeviceRequest> = function (ctx, logger, nk, session) {
  if (!session || !session.created) return;
  var userId = ctx.userId as string;
  var name = 'Гость ' + userId.replace(/-/g, '').slice(0, 4).toUpperCase();
  nk.accountUpdateId(userId, null, name, null, null, null, null, null);
  changeChips(nk, logger, userId, CONFIG.startingChips, 'starting_chips', {});
  logger.info('account created user=%s name=%s', userId, name);
};
