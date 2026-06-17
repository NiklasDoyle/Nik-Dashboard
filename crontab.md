
# General Setup
50 5 * * * /home/nikpi/auto/Nik-Dashboard/update.sh >> /home/nikpi/auto/Nik-Dashboard/logs/update-logs.txt 2>&1

# Check email for MacroFactor Updates
*/5 * * * * cd /home/nikpi/auto/Nik-Dashboard && node ./bin/sync-macrofactor.js >> ./logs/dashboard-sync.log 2>&1