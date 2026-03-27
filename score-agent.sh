#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Score Store agent helper"
echo "Repository root: $ROOT_DIR"

if [ -f "package.json" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "Dependencies detected. Installing if needed..."
    npm install
  fi
fi

if [ -f "vercel.json" ]; then
  echo "Vercel config detected."
fi

echo "Done."