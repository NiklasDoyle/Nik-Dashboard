# Vertical Monitor Dashboard

A local fullscreen dashboard for a vertical monitor. Shows a calendar that
**merges your Notion workout database with your Google Calendar** (the way the
Notion Calendar app overlays both), plus a clock, Phoenix weather, today's
agenda, and a placeholder for a future fitness graph.

## How it works

- **Backend** (`server/`) — a small Express server fetches events from the
  Notion API and your Google Calendar "secret iCal" URL, merges them, and serves
  them at `/api/events`. This avoids browser CORS limits and keeps your secrets
  off the client.
- **Frontend** (`src/`) — React + Vite, with [FullCalendar](https://fullcalendar.io)
  rendering both event sources color-coded (Notion = pink, Google = blue).
  Weather comes straight from the free [Open-Meteo](https://open-meteo.com) API.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create your `.env`** (copy the template and fill it in)
   ```bash
   cp .env.example .env
   ```

   - **Notion**
     1. Create an internal integration at <https://www.notion.so/my-integrations>
        and copy its secret → `NOTION_TOKEN`.
     2. Open your workout database → `...` → **Connections** → add the integration.
     3. Copy the 32-char database ID from the database URL → `NOTION_DATABASE_ID`.
     4. Set `NOTION_DATE_PROPERTY` to the exact name of the date column.
   - **Google Calendar**
     - Google Calendar → Settings → *Settings for my calendars* → pick the
       calendar → **Secret address in iCal format** → `GOOGLE_ICAL_URL`.

## Run

**Development** (hot reload; Vite on 5173, API on 3001):
```bash
npm run dev
```
Open <http://localhost:5173>.

**Fullscreen / production** (single port):
```bash
npm run build
npm start
```
Open <http://localhost:3001> on the vertical monitor and press **F11** for
fullscreen (or launch the browser in kiosk mode).

## Raspberry Pi kiosk setup

How to run the dashboard unattended on a Pi: the Express server runs under
[PM2](https://pm2.keymetrics.io) (auto-restart + boot persistence), and a
fullscreen Chromium is launched from the desktop autostart so it lives inside
the graphical session. This repo ships [`ecosystem.config.cjs`](ecosystem.config.cjs)
(the server process) and [`kiosk-pi.sh`](kiosk-pi.sh) (the Linux kiosk launcher;
`kiosk.sh` is the macOS-only equivalent).

**Prerequisites**

- Raspberry Pi OS **with desktop**, set to **Desktop Autologin**
  (`sudo raspi-config` → System → Boot/Auto Login → Desktop Autologin). Without
  this there's no session for the browser to draw into.
- Node, Chromium, and PM2 installed:
  ```bash
  sudo apt install -y nodejs npm chromium-browser
  sudo npm install -g pm2
  ```

1. **Clone, install, and configure** (paths are case-sensitive on Linux):
   ```bash
   git clone <your-repo-url> ~/auto/Nik-Dashboard
   cd ~/auto/Nik-Dashboard
   npm ci
   cp .env.example .env   # then fill it in (see Setup above)
   npm run build          # produce dist/ — the server serves this
   ```

2. **Run the server under PM2** (adds to any existing apps, e.g. n8n):
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save                 # persist the process list for boot
   pm2 startup              # run the command it prints, once, to enable boot
   ```
   Verify: `pm2 list` shows `dashboard-server` online and
   `curl -s -o /dev/null -w '%{http_code}\n' localhost:3001` returns `200`.

3. **Launch the kiosk browser at login** via the labwc autostart (Raspberry Pi
   OS Bookworm default). `kiosk-pi.sh` waits for the server to return `200`,
   then opens Chromium fullscreen and auto-detects Wayland vs X11:
   ```bash
   echo "$HOME/auto/Nik-Dashboard/kiosk-pi.sh &" >> ~/.config/labwc/autostart
   ```
   *(Older X11/LXDE images: append `@/home/<user>/auto/Nik-Dashboard/kiosk-pi.sh`
   to `~/.config/lxsession/LXDE-pi/autostart` instead.)*

4. **Reboot to test:**
   ```bash
   sudo reboot
   ```
   The dashboard should open fullscreen automatically.

**Keeping it updated** — [`update.sh`](update.sh) hard-resets to `origin/main`,
pulls, reinstalls, and rebuilds; [`crontab.md`](crontab.md) has the cron lines
to run it (and the Gmail sync below) on a schedule. Add them with `crontab -e`.

**Troubleshooting**

- **White/blank screen at boot** — Chromium opened before the server was
  serving. `kiosk-pi.sh` already polls for a `200` for up to ~60s; if your Pi is
  slow to boot, raise the loop count in the script.
- **Browser never appears** — check `pm2 logs dashboard-kiosk` is *not* present
  (the kiosk must run from autostart, not PM2) and that Desktop Autologin is on.
- **`Script not found` from PM2** — the `cwd` is wrong. `ecosystem.config.cjs`
  uses `__dirname`, so just start it from inside the repo directory.
- **Dashboard shrinks / un-fullscreens after the monitor is powered off and on**
  — turning the monitor off makes the Pi see an HDMI *disconnect*, so labwc drops
  the output and reshuffles the window. Force the connector to stay enabled at a
  fixed mode so the Pi never registers the monitor as gone:
  1. Find the connector name and current mode: `wlr-randr`
     (`sudo apt install -y wlr-randr` if missing) — e.g. `HDMI-A-1`, `1920x1080@60`.
  2. Edit `/boot/firmware/cmdline.txt` (keep it a **single line**,
     space-separated) and append, adjusting to match step 1 — the trailing `D`
     force-enables the digital output:
     ```
     video=HDMI-A-1:1920x1080@60D
     ```
  3. `sudo reboot`, then power the monitor off/on to confirm it stays fullscreen.

  Trade-off: the resolution is now hardcoded — it won't auto-adjust if you attach
  a different monitor (which may show "mode not supported"). It only affects that
  one connector; nothing else is impacted. **To undo:** remove the `video=…D`
  token from `/boot/firmware/cmdline.txt` and reboot. (If a wrong mode ever
  leaves you with no display, edit `cmdline.txt` on the boot partition from
  another computer.)

## Auto-sync MacroFactor exports from Gmail

Instead of dropping exports into `data/` by hand, a small script can pull them
from your inbox automatically. It connects to Gmail **read-only** over IMAP,
finds recent emails with a `MacroFactor-*.xlsx` attachment, and saves any new
ones into `data/` (skipping files it already has — it never modifies your mail).

1. **Create an app password:** Google Account → Security → turn on **2-Step
   Verification** → **App passwords** → generate one for "Mail".
2. **Configure `.env`:** set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (see
   `.env.example` for optional tuning).
3. **Test it:**
   ```bash
   npm run sync:gmail
   ```
   It prints what it saved (run it again — it should report "no new exports").
4. **Schedule it every 5 minutes** with `crontab -e` (use the absolute path to
   `node` from `which node`):
   ```
   */5 * * * * cd /Users/niklasdoyle/dev/dashboard && /ABSOLUTE/PATH/node bin/sync-macrofactor.js >> data/sync.log 2>&1
   ```
   Check `data/sync.log` for run output. On macOS, if cron can't write to the
   folder, grant **Full Disk Access** to `/usr/sbin/cron` in System Settings →
   Privacy & Security.
