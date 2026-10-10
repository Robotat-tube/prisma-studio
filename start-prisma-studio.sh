#!/bin/sh
# Starts PRISMA Scoping Review Studio on this Linux PC and opens it in Chrome, Chromium or Edge.
# Run it from a terminal (./start-prisma-studio.sh) or double-click it; press Ctrl+C or close the terminal to stop it.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed: install it (https://nodejs.org or your package manager) and start this file again."
  exit 1
fi

if [ ! -d "node_modules/pdfjs-dist" ]; then
  echo "First start: installing the app's parts..."
  npm install --no-audit --no-fund || exit 1
fi

URL="http://localhost:8770/web/"
# open the browser a moment after the server starts; folders can only be opened in Chrome, Chromium or Edge
(
  sleep 2
  for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge; do
    if command -v "$b" >/dev/null 2>&1; then exec "$b" --new-window "$URL" >/dev/null 2>&1; fi
  done
  xdg-open "$URL" >/dev/null 2>&1
) &

echo "PRISMA Scoping Review Studio runs at $URL  (Ctrl+C to stop it)"
exec node scripts/serve.js 8770
