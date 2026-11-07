#!/bin/bash
# Keeps AION running in the background from login, so replies are checked and notifications arrive even when
# the browser tab is closed. ./always-on.sh        turns it on
#                                ./always-on.sh off    turns it off (AION then runs only when you open it)
DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.aion.server.plist"
LABEL="com.aion.server"
if [ "$1" = "off" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
  rm -f "$PLIST"
  echo "AION will no longer start at login. Open it from AION.app when you need it."
  exit 0
fi
NODE="$(PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" command -v node)"
[ -z "$NODE" ] && { echo "Node.js was not found."; exit 1; }
# the real binary (not a symlink), so macOS asks about, and remembers, node itself
NODE="$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$NODE" 2>/dev/null || echo "$NODE")"
LOG="$HOME/Library/Logs/AION"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>20</integer>
  <key>StandardOutPath</key><string>$LOG/server.log</string>
  <key>StandardErrorPath</key><string>$LOG/server.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
# stop a copy started by hand, so the background one owns the port
lsof -ti tcp:8765 -sTCP:LISTEN | xargs kill 2>/dev/null
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST"
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 1 http://localhost:8765/api/deals && { echo "AION is running in the background and will start at every login: http://localhost:8765"; exit 0; }; sleep 0.5; done
# it did not start: put the by-hand copy back so AION keeps working, then explain
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$PLIST"
(cd "$DIR" && nohup "$NODE" server.mjs >> "$DIR/workspace/server.log" 2>&1 &)
if tail -40 "$LOG/server.log" 2>/dev/null | grep -q "EINTR\|EPERM\|Operation not permitted"; then
  echo "macOS is blocking background access to the Desktop folder, where AION lives."
  echo "Fix: System Settings → Privacy & Security → Files and Folders → node → turn on Desktop Folder"
  echo "    (node is $NODE; if it is not listed, add it under Full Disk Access with the + button)"
  echo "(or answer the \"node would like to access files in your Desktop folder\" prompt with Allow), then run ./always-on.sh again. AION is still running by hand meanwhile."
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders" 2>/dev/null
  exit 1
fi
echo "AION did not start. See $LOG/server.log"; exit 1
