#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/vms-nodejs"

echo "=============================================="
echo " Installing Node.js Requirements (vms-nodejs)"
echo "=============================================="
echo

if [ ! -d "$APP_DIR" ] || [ ! -f "$APP_DIR/package.json" ]; then
  echo "[ERROR] vms-nodejs folder or package.json not found."
  read -k 1 -s -r "?Press any key to close..."
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm not found. Install Node.js first: https://nodejs.org"
  read -k 1 -s -r "?Press any key to close..."
  echo
  exit 1
fi

cd "$APP_DIR"
echo "Installing dependencies..."
npm install

echo
echo "[SUCCESS] Requirements installed successfully."
read -k 1 -s -r "?Press any key to close..."
echo
