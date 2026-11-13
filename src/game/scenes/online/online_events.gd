class_name OnlineEvents
extends Resource

## Contract of the App/Online context (shared `.tres`): the lobby and the result screen ask for
## tables, rooms and lobby data here; nobody holds a reference to the context.

# --- requests (screens → online) ---
@warning_ignore("unused_signal")
signal ev_find_table(mode: String, fee: int)
## New friends room; `invite_ids` get an in-app invite once it exists.
@warning_ignore("unused_signal")
signal ev_create_room(invite_ids: Array)
@warning_ignore("unused_signal")
signal ev_join_room(code: String)
@warning_ignore("unused_signal")
signal ev_open_company(company_id: String)
@warning_ignore("unused_signal")
signal ev_start_lesson
@warning_ignore("unused_signal")
signal ev_refresh_profile
@warning_ignore("unused_signal")
signal ev_mark_visited
@warning_ignore("unused_signal")
signal ev_load_leaders(scope: String)
@warning_ignore("unused_signal")
signal ev_load_social
@warning_ignore("unused_signal")
signal ev_add_friend(user_id: String)
@warning_ignore("unused_signal")
signal ev_create_company(company_name: String, members: Array)
@warning_ignore("unused_signal")
signal ev_invite(code: String, user_ids: Array, company_id: String)
@warning_ignore("unused_signal")
signal ev_report(user_id: String, reason: String)
@warning_ignore("unused_signal")
signal ev_block(user_id: String)
@warning_ignore("unused_signal")
signal ev_link_account(provider: String)
@warning_ignore("unused_signal")
signal ev_delete_account

# --- answers (online → screens) ---
## Progress / waiting line for the lobby ("" hides it).
@warning_ignore("unused_signal")
signal ev_status(text: String)
## Short message for the toast overlay.
@warning_ignore("unused_signal")
signal ev_toast(text: String)
@warning_ignore("unused_signal")
signal ev_leaders(data: Dictionary)
@warning_ignore("unused_signal")
signal ev_social(data: Dictionary)
@warning_ignore("unused_signal")
signal ev_company_created(company: Dictionary)
## A friend calls you to a room (socket notification).
@warning_ignore("unused_signal")
signal ev_invite_received(code: String, from_name: String)
@warning_ignore("unused_signal")
signal ev_account_deleted
