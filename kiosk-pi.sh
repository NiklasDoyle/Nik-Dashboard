#!/usr/bin/env bash
# Launch the dashboard fullscreen in Chromium kiosk mode on a Raspberry Pi.
# PM2 runs this (see ecosystem.config.cjs); it assumes the server is started
# separately as the `dashboard-server` PM2 app. We just wait for the server to
# answer, then exec Chromium so PM2 tracks the real browser process.
set -euo pipefail

PORT="${PORT:-3001}"
URL="http://localhost:${PORT}"

# Wait until the server answers before opening the browser (it may still be
# starting up under PM2 when this launches).
echo "Waiting for ${URL}…"
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "${URL}"; then break; fi
  sleep 0.5
done

# Pick whichever Chromium binary is installed (name differs across Pi OS).
CHROMIUM=""
for bin in chromium-browser chromium; do
  if command -v "${bin}" >/dev/null 2>&1; then CHROMIUM="${bin}"; break; fi
done
if [ -z "${CHROMIUM}" ]; then
  echo "No chromium-browser/chromium found. Install with: sudo apt install -y chromium-browser" >&2
  exit 1
fi

# Wayland (Bookworm default) vs X11 (older). Add the Ozone flag only on Wayland.
OZONE=()
if [ -n "${WAYLAND_DISPLAY:-}" ] || [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  OZONE=(--ozone-platform=wayland)
fi

echo "Opening ${CHROMIUM} in kiosk mode at ${URL}…"
exec "${CHROMIUM}" \
  "${OZONE[@]}" \
  --kiosk \
  --app="${URL}" \
  --user-data-dir="${HOME}/.dashboard-kiosk-profile" \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-translate \
  --disable-features=Translate \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000
