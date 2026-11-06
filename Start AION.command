#!/bin/bash
# Double-click to start AION and open it in your browser. Safe to run again: it reuses a copy that is already running.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$PATH:$d"; done
cd "$(dirname "$0")" || exit 1
URL="http://localhost:8765"
say_error() { osascript -e "display alert \"AION could not start\" message \"$1\" as critical" >/dev/null 2>&1; echo "$1"; }
if ! command -v node >/dev/null; then say_error "Node.js is not installed. Install it from nodejs.org (version 22 or newer), then double-click this again."; exit 1; fi
mkdir -p workspace
if ! curl -s -o /dev/null --max-time 2 "$URL/api/deals"; then
  nohup node server.mjs >> workspace/server.log 2>&1 &
  for i in $(seq 1 60); do curl -s -o /dev/null --max-time 1 "$URL/api/deals" && break; sleep 0.25; done
  if ! curl -s -o /dev/null --max-time 2 "$URL/api/deals"; then say_error "The local server did not start. The last lines of workspace/server.log say why: $(tail -3 workspace/server.log | tr '\n"' ' ')"; exit 1; fi
fi
open "$URL"
echo "AION is running at $URL. You can close this window."
