
# General Setup
50 5 * * * /home/nikpi/auto/nik-dashboard/update.sh >> /home/nikpi/auto/nik-dashboard/logs/update-logs.txt 2>&1

# Check email for MacroFactor Updates
*/5 * * * * cd /home/nikpi/auto/nik-dashboard && node ./bin/sync-macrofactor.js >> ./logs/dashboard-sync.log 2>&1