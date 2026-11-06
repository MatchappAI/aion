#!/bin/bash
# Starts the AION app (if it isn't already running) and opens it in the browser.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")" || exit 1
URL="http://localhost:8765"
if ! curl -s -o /dev/null --max-time 2 "$URL/api/deals"; then
  nohup node server.mjs >> workspace/server.log 2>&1 &
  for i in $(seq 1 40); do curl -s -o /dev/null --max-time 1 "$URL/api/deals" && break; sleep 0.25; done
fi
open "$URL"
