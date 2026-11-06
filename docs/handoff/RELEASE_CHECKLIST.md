# Release checklist (personal copy)

- ✅ `npm test` 64/64 · `tests/ui/run.mjs` 73/73 · `tests/ui/crawl.mjs` 622 controls, 0 errors
- ✅ `npm audit` 0 vulnerabilities; no keys or secrets in source
- ✅ Backups before changes in `archive/`
- ✅ `Start AION.command` launcher tested
- ✅ Docs in `docs/handoff/` match the app (Settings, Help, Documents, Search modes, Value Creation tabs)
- ☐ Optional: add a Codex login or an API key in Settings as a backup to Claude Code
- ☐ Optional: press Test on any new AI you add
- ☐ When changing code: rerun the three test commands in ARCHITECTURE.md against a copy of `workspace/`
