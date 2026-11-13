# Logging (always)
Goal: logs let AI agents (and humans) find bugs from a run log alone.
- Log every major event: HFSM transitions, scene `initialize`/`deinit`, match/round start/end, moves and their resolution, session connect/disconnect/desync, save/load, purchases, errors.
- Severity: `DEBUG` < `INFO` < `WARN` < `ERROR`. Min level per channel in a `.tres` settings Resource; release build default `WARN`, editor `DEBUG`.
- Logger lives in `core/lib/log/` (project-agnostic), no singleton: owner gets it via `@export` settings Resource / passes a channel instance to components.
- Line format, one line, greppable: `[<frame|ms>] <SEV> <channel> <event> key=value ...` (e.g. `INFO match move player=2 count=3`).
- `WARN`/`ERROR` also go to `push_warning`/`push_error`.
- Log facts with ids and values (state names, player ids, turn), not prose. No per-frame spam above `DEBUG`.
- Never log personal data, tokens, or free user text. Client never has other players' hands; server logs hands only at `DEBUG`.
- Server match logging must not change match behaviour (no logging-driven branches, no RNG use). Server logs are the dispute record: seed, every intent, result.
