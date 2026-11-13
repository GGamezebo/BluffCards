---
paths:
  - "src/features/*_view/**"
  - "src/entities/**"
  - "src/game/scenes/game/**"
  - "src/ui/**"
---
# View / game scene
- Views = pure function of game state (+ local animation/interpolation); never write to game state.
- Look = nodes in the view's `.tscn` (Sprite2D, TextureRect, Line2D, materials), drawn at a design size and tuned in the editor; script only moves/scales/rotates/tints them. No `_draw()` art. Runtime colors: parts drawn white, script tints listed nodes (`self_modulate`). Repeated parts = template `.tscn` + `instantiate()`.
- `game` scene only orchestrates: joins the server match, holds the latest table view, composes views/HUD; HUD listens to `GameEvents`.
- Server messages (move, check reveal, pile taken, four burned, player out) → `GameEvents` signals → views play animations; views queue animations so fast server updates never skip a reveal.
- Keep 60fps on low-end phones; Compatibility-renderer-safe effects.
- Exit game via `root_events.ev_exit_game` with post-game payload.
