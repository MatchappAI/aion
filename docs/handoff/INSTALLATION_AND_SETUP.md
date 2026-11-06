# Installation and setup

## Needs
- A Mac with Node.js 22 or newer (nodejs.org).
- Google Chrome (only for the 1-page PDF export).
- One AI: Claude Code logged in (run `claude` once in Terminal), or Codex (`codex login`), or an Anthropic or OpenAI API key.

## First time
```
cd ~/Desktop/AION/demo
npm install
```

## Start it (no terminal needed after the first time)
Double-click **`Start AION.command`** in the `demo` folder. It starts AION if it isn't running and opens http://localhost:8765. If Node is missing or the server can't start, it shows an alert saying why. (The first time, macOS may ask you to confirm opening it: right-click → Open.)

From a terminal: `npm start`, then open http://localhost:8765.

## Choose the AI
Open **Settings**. Claude Code is used first when it's logged in. Add Codex or an API key as a backup: when one hits its usage limit, AION moves to the next ready option for an hour. Press **Test** to check one.

## Where data lives
Everything is in `demo/workspace/`: `deals/` (each deal's upload, parsed rows, state and run log), `archive/` (closed deals; nothing is deleted), `searches/`, `docs/`, `cache/` (saved AI answers, reused unless you click "Run the AI again"), `engine.json`, `keys.json` (owner-only permissions), `benchmarks.json`. Copy the folder to back up.

## Updating the code
Code and data are separate: replacing files outside `workspace/` never touches your deals or searches. Backups taken before the October 24, 2026 changes are in `demo/archive/demo-before-qa-2026-10-24.tgz` and `demo-before-engine-port-2026-10-24.tgz`.
