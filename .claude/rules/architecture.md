# Architecture (always)
Reference implementations: `D:\Godot\MyProjects\GoofyBalls` and `D:\Godot\MyProjects\quizmatik` (`GGamezebo/quizmatik`). In doubt → copy their pattern; never invent a parallel system.
Layers (code split by layer; deps point down only):
- `src/game/` HFSM bootstrap, contexts, scenes (orchestration + the context's own rules/FSM, like quizmatik `game_logic`; features never import it, they get its `state`/`cfg` as data) → `src/features/` isolated features / `src/entities/` entities built from `src/entities/components/` (`entities.md`) → `src/ui/`, `src/common/` shared game widgets/Resources → `core/` project-agnostic libs (never import `src/`).
HFSM:
- HFSM creates states, mounts their scenes, drives all transitions between app phases/scenes.
- Each large context = own HFSM state + scene: phases, platforms, onboarding/tutorial, server-driven features. Host scenes expose only passive hooks (Resource `ev_*`).
- Platform code lives only in platform HFSM contexts (`App/Platform` → `WEB`/`Android`/`Desktop`/…); parent checks `OS.has_feature` once and opens only the running platform's branch. Game/features stay platform-agnostic, talk to platform via Resource events.
Context scene:
- Every scene runs standalone (F6), without HFSM/parent/siblings: defaults = `@export` `.tres` (data + events); empty payload never crashes.
- In app: HFSM activates state → `initialize(data)` → `ResourceUtils.update_resource(live, data)` overrides defaults.
- State's events Resource (`ev_*` signals in `.tres`) is global within that state; contexts talk to each other only through these events. No direct refs across contexts.
UI:
- Static UI (all elements known upfront) = nodes in `.tscn` built in editor; script only sets state/text/visibility, connects signals.
- Only dynamic UI in code, via editor-made template `.tscn` + `instantiate()`; never `Control.new()` trees.
- Game entities with visuals: at least a node skeleton in `.tscn`, editable in the editor; script only drives it, no `_draw()` art (`view.md`).
No singletons:
- No autoloads, static global state, or self-registering instances. Only third-party plugins may bring one.
Reuse placement:
- Generic and truly project-independent (patterns, utils; e.g. `hfsm`, `fsm`, `EventListener`) → `core/lib/{name}/`. Mixed code → split: generic part to `core/`, game wiring in `src/`.
- Reusable but game-dependent entity parts → `src/entities/components/{name}/` (`entities.md`).
- Exception: features keep all their deps inside their folder, even if duplicated.
Components:
- Split big objects into small components by logical responsibility.
- Parent creates children in the scene tree and calls their methods directly; children only emit `ev_*`; only the parent subscribes. Children never hold/fetch parent (`get_parent()`, `owner`, injected ref). Siblings never call each other.
- Reusable, but no over-engineering: no abstraction without a second real use.
Game rules (`server.md`):
- Match rules, deal, bots, timer live only on the server (Nakama TS match handler). Client has no rules: it sends intents, renders the server's per-player view.
- Client table state = plain-data view from server (Dictionary/Arrays) held by the `game` context; views read it as data, never write to it. Client-side checks only for UI (which ranks/actions are enabled); server is the truth.
SOLID: one reason to change per script; extend via new component/Resource/state, not `if kind ==`; subclasses keep base contract; small public surface; depend on exported Resources/signals/`class_name`, not paths/globals.
Balance knobs: every gameplay/feel number (rules, AI, timings, FX) is an `@export` with a `##` tooltip in a `.tres` Resource or scene; no magic numbers in rules/AI/view code.
Godot best practices: scene composition, signals up / calls down, typed GDScript, `@export` over `res://`, Resources for data, `RefCounted` for pure logic.
Logging: `logging.md`.
