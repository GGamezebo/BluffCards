// Nakama entry point: registers the table match, the lobby RPCs and the account hook.
// Built by `npm run build` into ../nakama/modules/index.js (one ES5 file, global functions).

var InitModule: nkruntime.InitModule = function (ctx, logger, nk, initializer) {
  applyEnvConfig(ctx.env);
  nk.leaderboardCreate(LEADERBOARD_CHIPS, true, nkruntime.SortOrder.DESCENDING, nkruntime.Operator.SET, null, {}, true);
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
