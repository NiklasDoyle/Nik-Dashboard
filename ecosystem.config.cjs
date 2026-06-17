// PM2 process definition for the Raspberry Pi (server only).
//   pm2 start ecosystem.config.cjs   # add alongside any existing apps (e.g. n8n)
//   pm2 save                         # persist for boot
//
// The fullscreen Chromium kiosk is NOT managed by PM2 — it's launched from the
// desktop autostart (~/.config/labwc/autostart) via kiosk-pi.sh, so it runs
// inside the live graphical session. See README "Raspberry Pi kiosk setup".
//
// Note: this does NOT build the app — `dist/` must already exist
// (`npm run build`, also done by update.sh).
module.exports = {
  apps: [
    {
      name: 'dashboard-server',
      cwd: __dirname,
      script: 'server/index.js',
      env: { NODE_ENV: 'production', PORT: '3001' },
      autorestart: true,
    },
  ],
}
