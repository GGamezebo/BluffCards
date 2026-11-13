# core/ (always) — same layout as quizmatik / GoofyBalls
`core/` = code that works in any Godot project unchanged (copy the folder into another project → no edits). Never imports `src/`, no project `class_name`s, paths, game terms (card, deck, bluff, room). No singletons here either.
Folders (pick the first that fits; create a folder only on its first real use):
- `core/lib/{name}/` — stateless patterns, utils, pure math: `hfsm`, `EventListener`, `ResourceUtils`, `window_stack_manager`, `log`, `fsm` (quizmatik FSM ported to `RefCounted` + `restore_state`); later easing, deterministic RNG.
- `core/systems/{name}/` — self-contained subsystems with own state + default `.tres` (quizmatik `user_settings`): `user_settings`, `save`, `audio`, `input_remap`. Node or Resource the owner gets via `@export`, never an autoload.
- `core/theme/` — neutral base `Theme`/`StyleBox` with no game palette or `assets/` refs. Game theme → `src/ui/theme/`.
- `core/shaders/` — generic shaders/`ShaderMaterial` presets: outline, flash, dissolve, blur. Entity-specific shader stays with the entity.
- `core/editor/` — generic `@tool` helpers, editor previews, inspectors. Full `EditorPlugin`s live in `addons/` (Godot convention).
- `core/net/` — transport/net utils with no game or backend knowledge (packet codecs, lag emulation math). Backend/rooms wiring → `src/features/`.
Placement:
- `lib` vs `systems`: a thing you call/instantiate → `lib`; a running thing with data + lifecycle → `systems`.
- Mixed code → split: generic part to `core/`, game wiring/tuning `.tres` in `src/`.
- Game-dependent but shared → `src/entities/components/`, `src/common/`, `src/ui/` (`entities.md`).
- No "might be useful" moves: extract to `core/` only on a second real use or when copied from quizmatik/GoofyBalls (`core/lib/*` there is the source to copy from).
