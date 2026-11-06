# User guide (for a busy owner or deal lead)

## 1. Install (once, about 10 minutes)
1. Install **Node.js 22** from nodejs.org (click through the installer).
2. Install **Google Chrome** if you don't have it (only needed for the 1-page PDF).
3. Have one AI ready: **Claude Code** (install, then type `claude` once in Terminal and log in) or **Codex** (`codex login`), or an **Anthropic or OpenAI API key**.
4. In Terminal, once: `cd ~/Desktop/AION/demo && npm install`.

## 2. Start
Double-click **`Start AION.command`** in the `demo` folder. Your browser opens AION at http://localhost:8765. (First time only: right-click → Open → Open.) If something's wrong, an alert says what.

## 3. Set up the AI
Click **Settings**. Claude Code is used first if it's logged in. Press **Test**: "Works" means you're ready. Add a second option (Codex or a key) as a backup; AION switches to it automatically if the first hits its usage limit.

## 4. Use it
**Analyze a company (Value Creation)**
1. Drop the seller's books on the page: QuickBooks → Reports → General Ledger, 24–36 months, all accounts, Export to Excel. (P&L Detail or a PDF/CIM also work.)
2. Wait about a minute (a few minutes for a PDF).
3. Read *Overview* (real profit and the plan), answer the one big question it asks, then check *AION fit*, *Plan* and *Deal*.
4. Click **1-page PDF** or **Excel**; files go to Downloads.

**Find companies (Proprietary Search)**
1. Choose *Find firms to buy*, *Find clients* or *Find people*.
2. Type one sentence (or click an example) → **Search**. About 4–8 minutes.
3. Open results: every fact has a link; save the good ones, set a deal stage, press **Watch weekly**.

**Draft documents (Documents)**: upload an RFP or pick a candidate; edit the draft; you send it.

## 5. If something goes wrong
- *"No AI is ready"*: Settings → log in to Claude Code or Codex, or paste a key → Test.
- *"Usage limit"*: add a backup AI in Settings or wait for the time shown.
- *Upload refused*: use the General Ledger or P&L Detail export, not a summary P&L.
- *Blank page*: press ⌘R. Your work is saved.
- More: **Help** tab in the app, or `docs/handoff/TROUBLESHOOTING.md`.

## 6. Updating
New code replaces files outside `workspace/`; your deals and searches in `workspace/` stay. Back up `workspace/` first (copy the folder).

## 7. Your data and privacy
- Everything stays in `demo/workspace/` on this Mac.
- Only prompts go to the AI you chose: account names and totals (never the full ledger), with customer and staff names hidden by default.
- Nothing sends email, posts or contacts anyone. Keys are stored owner-only in `workspace/keys.json`.
- Check your NDA allows sending account totals to your AI provider before uploading a seller's books.
