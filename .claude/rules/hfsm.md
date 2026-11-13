---
paths:
  - "core/lib/hfsm/**"
  - "src/game/hfsm/**"
  - "src/game/main.gd"
  - "src/game/scenes/app_root/**"
  - "**/*hfsm*.json"
---
# HFSM (ported from quizmatik; keep semantics)
- `HFSM.new(tree, entities, scene_config)`; scenes extend `IScene` (`initialize`/`deinit`/`on_event`).
- JSON: one root; reserved `enter`,`leave`,`consume`,`states`,`scene`; other keys = binding slots. Events `ev.*`, trailing `*` wildcard; omitted `enter` = `["sys.enter"]`.
- `scene: {id, loading_screen, async_loading, on_event}`; id → `HfsmScenePaths.PATHS`.
- Transitions post-order (children first); `consume` stops bubbling. Don't change casually.
- A context with a lifetime (online session, room, tutorial) gets its own state, so no scene has to remember to close it. AppRoot emits `ev.open_platform` → `App/Platform` router opens one branch (`WEB`/`Android`/`Desktop` → store contexts), like quizmatik.
- RootEvents → `hfsm.add_event` bridge lives on app_root scene, not `main.gd`. Start HFSM after 2 idle frames.
- BoundEntities are light `RefCounted`, never mount scenes. Menu windows are NOT HFSM states.
- `core/lib/hfsm` has no project types.
