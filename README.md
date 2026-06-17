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
