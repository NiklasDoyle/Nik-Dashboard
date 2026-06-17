#!/usr/bin/env bash
# Launch the dashboard fullscreen in Chrome kiosk mode (no tabs/address bar).
# Builds the app, starts the server, opens Chrome pinned to it, and tears the
# server down when you quit Chrome (or press Ctrl-C).
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3001}"
URL="http://localhost:${PORT}"

echo "Building…"
npm run build

# Free the port in case a stale dev/prod server is still holding it — otherwise
# the old process (which may not serve the built app) answers and you get
# "Cannot GET /".
if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  echo "Port ${PORT} in use — stopping the existing process…"
  lsof -ti tcp:"${PORT}" | xargs kill 2>/dev/null || true
  sleep 1
fi

echo "Starting server on ${URL}…"
NODE_ENV=production PORT="${PORT}" node server/index.js &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" 2>/dev/null || true' EXIT

# Wait until the server answers before opening the browser.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "${URL}"; then break; fi
  sleep 0.3
done

# Pick whichever Chromium-family browser is installed.
for app in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if [ -d "/Applications/${app}.app" ]; then
    echo "Opening ${app} in kiosk mode…"
    # --kiosk = borderless fullscreen; --app = no tabs/omnibox.
    # Separate --user-data-dir keeps this an isolated, dedicated window.
    open -na "${app}" --args \
      --kiosk \
      --app="${URL}" \
      --user-data-dir="${HOME}/.dashboard-kiosk-profile" \
      --no-first-run \
      --disable-translate
    break
  fi
done

echo "Dashboard running. Press Ctrl-C here (or quit the browser) to stop."
wait "${SERVER_PID}"
