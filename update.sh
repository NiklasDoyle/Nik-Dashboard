#!/bin/bash
set -euo pipefail

echo "
[$(date '+%Y-%m-%d %H:%M:%S')] Updating from github..."

cd /home/nikpi/auto/nik-dashboard

git reset --hard HEAD
git pull origin main
npm ci
npm run build
