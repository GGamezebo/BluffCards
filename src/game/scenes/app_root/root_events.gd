class_name RootEvents
extends Resource

## App-wide events (shared `.tres`, no autoload). AppRoot bridges them into the HFSM.

## Back to the lobby. Payload: {"window": "pro" | "friends" | "" (home)}.
@warning_ignore("unused_signal")
signal ev_return_to_menu(data: Dictionary)
