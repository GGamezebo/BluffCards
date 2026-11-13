---
paths:
  - "**/*.gd"
  - "**/*.tscn"
---
# GDScript conventions
- Typed GDScript, Godot 4.7. Files `snake_case`, shared types `PascalCase` + `class_name`.
- Signals `ev_*`; subscribe via `EventListener`, tear down in `deinit`/`_exit_tree`.
- Wire deps with `@export`; config copies via `ResourceUtils.update_resource()`.
- Pure logic → `RefCounted`; Nodes stay thin.
- UI built in the editor; repeated items = template `.tscn` + `instantiate()`; no `Label.new()` trees. Game theme lives in `src/ui/theme/`, set in `project.godot` (`gui/theme/custom`); scene roots may also set it for the editor preview. Shared UI rules: `ui.md`.
- InputMap actions only; keep touch working.
- Avoid: autoloads for flow, cross-context refs, project types in `core/`, drive-by renames, editing `addons/`.
