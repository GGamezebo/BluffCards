---
paths:
  - "src/ui/**"
  - "src/game/scenes/**"
  - "src/features/**/*.tscn"
---
# Shared UI (`src/ui/`)
Holds game UI used by ≥2 scenes/features. A widget used by one screen stays next to that screen (`src/game/scenes/menu/...`); move it here on the second real use.
Folders (each item = `{category}/{name}/` with `{name}.tscn` + `{name}.gd`; create a category only on first use):
- `theme/` — game `Theme` `.tres`: palette, fonts, StyleBoxes, type variations (e.g. `PrimaryButton`, `DangerButton`, `GhostButton`, `CardPanel`, `TitleLabel`, `MutedLabel`).
- `components/` — small reusable building blocks: button kinds, chip, badge, icon+label, counter, avatar, progress bar, toggle.
- `dialogs/` — modals and sheets built from components (confirm, settings). Not on the window stack (`menu.md`).
- `overlays/` — full-screen layers above scenes: `loading_screen`; later toast, transition, reconnect.
- `backgrounds/` — screen backdrops. Shared base script at the category root once a second backdrop exists.
Components:
- Look first via theme type variations (`theme_type_variation`); a new variant = new type variation in the theme or an inherited scene, never `if kind ==` / style bool flags. Colors follow meaning (defined in `concept/`).
- No per-node theme overrides for colors/fonts/sizes that belong to a type variation.
- Public API = `@export` props with setters that update nodes (`text`, `icon`, `value`), `setup(data)` for dynamic data, signals out. `@tool` when exports must preview in the editor.
- Knows no game state: no `RootEvents`/`GameEvents`, HFSM, rules, network. The screen/dialog owning it wires signals and passes data down.
- Bigger UI composes smaller by instancing their `.tscn`; lists = template `.tscn` + `instantiate()`; no `Control.new()` trees.
- Runs alone (F6) with sensible defaults; touch ≥ 88 px, visible focus for gamepad/keyboard.
