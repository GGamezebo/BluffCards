---
paths:
  - "src/game/scenes/menu/**"
  - "src/game/scenes/post_battle/**"
  - "core/lib/window_stack_manager/**"
---
# Menu & navigation
- Scenes switch only via `RootEvents` (`ev_start_game`, `ev_exit_game`, `ev_return_to_menu`).
- Full-screen windows only via one `WindowStackManager`; forward `ButtonWindowTransition`, back = pop (`ButtonWindowBack`/`ui_cancel`), never "open MainMenu".
- Dialogs/overlays (confirm, pause) are not on the stack.
- Game payload = one typed setup Resource (e.g. `{"match_setup": MatchSetup}`); never load the game scene from menu scripts.
