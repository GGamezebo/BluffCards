# BluffCards
Godot 4.7 card bluff game («Верю — не верю: Одна карта»): one card of the last packet is checked. Mobile first, then web/PC.
Client: Godot (HFSM, isolated scenes, Resource events, editor-first UI — same approach as `GoofyBalls` / `GGamezebo/quizmatik`).
Server: Nakama authoritative match in TypeScript (`server/`); the client holds no rules.
Core rules: `.claude/rules/` (auto-loaded; path-scoped ones load only for matching files). Layout: `project.md`.
Commands:
- client tests: `godot --headless --path . --script res://tests/run_all.gd`
- server: `cd server/ts && npm install && npm run build && npm test`; `cd server && docker compose up -d`
- live smoke vs local server: `godot --path . --script res://tests/e2e/play_smoke.gd -- --shots=<dir>`
Read docs ONLY when the task needs them:
- first release scope, screens, transitions → `concept/design/index.html` (catalog.js, map.js, atlas.js) + `concept/README.md`
- game rules, table types → `concept/rules.md`
- game formats (lesson, friends, matchmaking, timer) → `concept/formats.md`
- chips economy, paid club, leaderboard → `concept/economy.md`
- table reactions, phrases, drama moments → `concept/reactions.md`
- target audience, markets, platforms → `concept/audience.md`
- technical requirements (server, protocol, bots, platforms) → `concept/tech.md`
- visual style («Яркая настолка»), table layout, cards → `concept/art-direction.md`
- server setup, ports, local run → `server/README.md`
