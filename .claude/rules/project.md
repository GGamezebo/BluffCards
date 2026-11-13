# Project layout (always)
- `main.tscn` → `src/game/main.gd` HFSM bootstrap · `src/game/hfsm/app_hfsm.json` app phases:
  `App` → `Platform` (router → WEB/Android/Desktop) · `Online` (session, socket, lobby RPCs) → `Match` (one server table: join → views → leave) · screens `Lobby` | `Search` | `Room` | `Table` | `Result`.
- `src/game/scenes/{app_root,online,match_session,lobby,search,room,table,result}` — contexts / screens. `match_session` routes the screen by the server view (`ev.open_search|room|table|result`); screens never pick each other.
- Contracts between contexts: `OnlineEvents` (lobby ↔ online), `MatchEvents` (screens ↔ match), `RootEvents`; live data `TableView` (last server view), `PlayerProfile`, `OnlineLink` (socket for the match context).
- Screen-local widgets stay next to the screen (`lobby/*_window.gd`, `table/table_seat`, `table/hand_view`, …); shared UI in `src/ui/{theme,components,dialogs,overlays}`; `src/common/` = shared data (`Cards` wording, `MatchOps`, `TableView`, `PlayerProfile`, `PlatformCaps`).
- `src/features/online/` Nakama client/config/link. `core/lib/` copied from GoofyBalls/quizmatik (`hfsm`, `log`, `window_stack_manager`, `event_listener`, `ResourceUtils`, `center_column`).
- `server/` Nakama + Postgres (Docker) · `server/ts/` TypeScript sources → `server/nakama/modules/index.js` (`npm run build`), rules tests `npm test`.
- `assets/` fonts (Nunito, OFL) and art (`club_lobby.webp`, generated SVG suits / card back / icons / reactions).
- `tests/` headless suite `godot --headless --path . --script res://tests/run_all.gd`; `tests/e2e/play_smoke.gd` live run against a local server (screenshots).
- `concept/` design docs + HTML atlas (Godot-ignored) — the source of truth for screens and rules.
Must:
- Every screen runs alone (F6) on its `demo_view.tres`; in the app it reads the live `TableView`.
- Client keeps no rules: it renders the server view and sends intents (`server.md`).
- Local server for dev: `online_local.tres` (git-ignored, see `online_local.tres.example`).
