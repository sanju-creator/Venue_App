#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/vms-nodejs"
WEB_PORT=3000
API_PORT=5001

if [ ! -d "$APP_DIR" ] || [ ! -f "$APP_DIR/package.json" ]; then
  echo "Project folder not found: $APP_DIR"
  echo "Expected: vms-nodejs/package.json"
  read -k 1 -s -r "?Press any key to close..."
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Please install Node.js first."
  read -k 1 -s -r "?Press any key to close..."
  echo
  exit 1
fi

kill_port_if_used() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Stopping process on port $port: $pids"
    kill $pids >/dev/null 2>&1 || true
    sleep 1
  fi
}

echo "=============================================="
echo " Starting VMS Node.js (Frontend + API)"
echo "=============================================="
echo

cd "$APP_DIR"

if [ ! -d "node_modules" ]; then
  echo "[Setup] Installing dependencies (first time only)..."
  npm install
  echo
fi

kill_port_if_used "$WEB_PORT"
kill_port_if_used "$API_PORT"

echo "[1/2] Starting API server on port $API_PORT..."
nohup env PORT="$API_PORT" npm run api > api.log 2> api.err.log < /dev/null &
API_PID=$!

echo "[2/2] Starting Next.js server on port $WEB_PORT..."
nohup npm run dev > dev.log 2>&1 < /dev/null &
WEB_PID=$!

sleep 2

if lsof -iTCP:"$API_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "API server started (PID: $API_PID)"
else
  echo "API server did not start. Check: $APP_DIR/api.err.log"
fi

if lsof -iTCP:"$WEB_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Frontend started (PID: $WEB_PID)"
  echo "Open: http://localhost:$WEB_PORT"
else
  echo "Frontend did not start. Check: $APP_DIR/dev.log"
fi

echo
echo "Done. You can close this window."
read -k 1 -s -r "?Press any key to close..."
echo
