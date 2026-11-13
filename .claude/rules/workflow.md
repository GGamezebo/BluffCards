# Workflow (always)
- Docs in Russian; code, identifiers, commits in English.
- Commits: imperative, ≤ 72 chars subject (`Add single-card check resolution`); one logical change per commit, no refactor + feature mix.
- Branches: `main` stable (PR only), `develop` integration; short-lived `feature/…`, `fix/…`, `docs/…`, `chore/…`.
- Mobile + Steam + HTML5: touch and KBM/gamepad; platform code only in platform HFSM contexts (`architecture.md`).
- No pay-to-win: cosmetics never touch game rules.
- `concept/` = design docs and art, Godot-ignored (`.gdignore`).
- Structural/convention change → update matching rule + doc in same commit; rules ≤ ~50 lines, one concern each; path-scope rules that apply only to some folders.
