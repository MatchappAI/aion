# Troubleshooting

| What you see | What to do |
|---|---|
| Double-clicking `Start AION.command` does nothing / "can't be opened" | Right-click it → Open → Open (first time only). If an alert says Node is missing, install Node 22 from nodejs.org. |
| Alert: "The local server did not start" | It quotes the end of `workspace/server.log`. "Port 8765 is already in use" means AION is already running: just open http://localhost:8765. |
| A step says no AI is ready | Settings → log in to Claude Code (`claude`) or Codex (`codex login`) in Terminal, or save an API key, then press Test. |
| "Usage limit" / "rate limit" | Your plan ran out for now. AION skips that AI for an hour and uses the next ready one, so add a backup in Settings. Otherwise wait for the reset time in the message. |
| Invalid API key | Paste the whole key again (Anthropic keys start with `sk-ant-`, OpenAI with `sk-`). Billing errors mean the account needs credit. |
| Analysis stopped part way | Click Analyze again. Saved AI answers are reused, so finished steps don't re-run. "What the AI was sent" shows the exact prompt and reply. |
| Search "Partly complete" or no results | Some web searches failed (often a usage limit). Run it again later, widen the region or niche, or start from an example. Check the Rejected filter. |
| Books upload refused | Use QuickBooks General Ledger or P&L Detail exported to Excel/CSV, or a PDF. A summary P&L (one total per account) won't work. |
| PDF CIM numbers look doubled | Full years and a trailing-12-month column are never added together; check "Questions & checks" for which column was skipped. |
| PDF export fails | Google Chrome must be installed at /Applications. Excel export doesn't need it. |
| Blank or stuck page | Reload (⌘R). Work is saved as you go; a running analysis resumes its progress view. |
| Something else | Look at `workspace/server.log` and the run log for that deal. |
