---
paths:
  - "server/**"
  - "src/features/online/**"
  - "src/game/scenes/game/**"
---
# Server / match (Nakama, authoritative)
- All match rules run in a Nakama TypeScript match handler (`server/`). Client never computes outcomes, deals, or bot moves.
- Hidden info: each player gets only their own hand; others = card counts + minuses; pile = card counts per batch; revealed check card → everyone. Never send another player's cards, deck order, or seed to clients.
- Client → server: intents only (`MatchOps`: `PLAY {cards, rank}` opens or transfers, `CHECK {index}`, `REACT {kind, id, target}`, room / series ops). Server validates every intent; invalid → `ERROR {error}` + log, never trust client.
- Shuffle with a crypto RNG on the server; store the seed + move log per match for disputes.
- Chips, rating (Glicko-2), leagues, leaderboards change only in server code (wallet ledger), never via client RPC payload values.
- Bots run inside the match, see only what a human in their seat would see; same strength on paid and free tables.
- Turn timer and disconnect handling on the server; reconnect = full snapshot of the player's view.
- Rules in TS keep scenario tests (seed → moves → expected state) for every edge case in `concept/rules.md`.
- Balance numbers (hand size, timer, payouts, rake) in server config, not literals in handler code.
- Nakama returns the match state as Go-wrapped data on every call (arrays are not JS arrays): each handler starts with `state = rehydrate(state)` (JSON copy + class prototypes). Keep the state plain data; no closures.
- Sources in `server/ts/src` (ES5 script files sharing one global scope, no imports); `npm run build` writes `server/nakama/modules/index.js`, `npm test` runs rule scenarios + bot-vs-bot deals.
- Game design source of truth: `concept/rules.md`, `concept/economy.md`, `concept/tech.md`.
