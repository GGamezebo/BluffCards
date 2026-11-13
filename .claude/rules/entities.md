# Entities & shared components (always)
Feature vs entity:
- `src/features/{name}/` = isolated feature: everything it needs lives in its folder (duplicated if needed), talks out only via `ev_*` + `initialize`/`setup`. Deletable/movable alone.
- `src/entities/{name}/` = game entity built on purpose from shared components. Entities never import each other; `game` scenes compose them.
- `src/entities/components/{name}/` = reusable game-dependent entity parts. Reserved folder name, not an entity.
Deps (down only): `src/game` → `src/features` / `src/entities` → `src/entities/components` → `core/lib`.
- Components know no entity and no other component; only entities use them.
- Features never import `src/entities/**`. A feature that needs a component is an entity → move it.
Placement (pick the first that fits):
- Works in any project unchanged (pure math/pattern) → `core/lib/{name}/`.
- Shared by ≥2 entities, game-dependent → `src/entities/components/{name}/`.
- Used by one entity → stays inside that entity.
- Shared UI widget or the game theme → `src/ui/`; shared data/presets → `src/common/`.
Component shape:
- One responsibility; `class_name`; Node (with its node skeleton in the entity `.tscn`) or `RefCounted` for pure logic.
- Tuning numbers in a config `Resource` (`@export` + `##`), default `.tres` next to the entity that uses it; runtime state in the component, never written into the shared `.tres`.
- Owner holds it via `@export` / creates it, calls it down; component only emits signals. No `get_parent()`/`owner`.
- Varying behaviour stays in the owner, passed in as data; no `if kind ==` inside the component.
- Extract only on a second real use; first use stays in the entity.
