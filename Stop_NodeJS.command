#!/bin/zsh

set -euo pipefail

kill_port_if_used() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping port $port process: $pids"
    kill $pids >/dev/null 2>&1 || true
  else
    echo "No process running on port $port"
  fi
}

echo "Stopping VMS Node.js services..."
kill_port_if_used 3000
kill_port_if_used 5001
echo "Done."
read -k 1 -s -r "?Press any key to close..."
echo
