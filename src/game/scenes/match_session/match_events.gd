class_name MatchEvents
extends Resource

## Contract of the App/Online/Match context (shared `.tres`). Search, Room, Table and Result talk to
## the joined server table only through these signals; the latest view is in `TableView`.

# --- match → screens ---
## Every server update: the new view and the public events that led to it (for animations).
@warning_ignore("unused_signal")
signal ev_view(view: Dictionary, events: Array)
## {"seat", "kind": emoji|phrase|throw, "id", "target"}
@warning_ignore("unused_signal")
signal ev_reaction(data: Dictionary)
@warning_ignore("unused_signal")
signal ev_error(code: String)
## Socket to the table lost (false) or back with a fresh snapshot (true).
@warning_ignore("unused_signal")
signal ev_connection(online: bool)

# --- screens → match ---
## An intent for the server (MatchOps opcode + JSON payload).
@warning_ignore("unused_signal")
signal ev_intent(op: int, payload: Dictionary)
## Leave the table / room and go back to the lobby. `window` = lobby window to open ("" = home).
@warning_ignore("unused_signal")
signal ev_leave(window: String)
