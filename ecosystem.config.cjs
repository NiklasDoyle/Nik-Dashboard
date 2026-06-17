// PM2 process definitions for the Raspberry Pi kiosk.
//   pm2 start ecosystem.config.cjs   # add these alongside the existing n8n app
//   pm2 save                         # persist for boot
// Note: this does NOT build the app — `dist/` must already exist
// (`npm run build`, also done by update.sh). The kiosk app needs a live
// graphical session; see the env block and the plan's caveats if Chromium
// fails to open a display.
module.exports = {
  apps: [
    {
      name: 'dashboard-server',
      cwd: __dirname,
      script: 'server/index.js',
      env: { NODE_ENV: 'production', PORT: '3001' },
      autorestart: true,
    },
    {
      name: 'dashboard-kiosk',
      cwd: __dirname,
      script: './kiosk-pi.sh',
      interpreter: 'bash',
      autorestart: true,
      restart_delay: 3000, // don't hot-loop if the display isn't ready yet
      env: {
        PORT: '3001',
        DISPLAY: ':0',
        XAUTHORITY: '/home/nikpi/.Xauthority',
        XDG_RUNTIME_DIR: '/run/user/1000',
        WAYLAND_DISPLAY: 'wayland-0', // harmless on X11; used if Wayland detected
      },
    },
  ],
}
