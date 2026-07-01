#!/usr/bin/env bash
set -e

echo "Current commit:"
git rev-parse --short HEAD

if [ -z "$1" ]; then
  echo "Please provide target commit: bash scripts/rollback-production.sh <commit>"
  exit 1
fi

echo "Rolling back to commit: $1"
git checkout "$1"
npm install
npm run build
pm2 restart yijian
pm2 status
bash scripts/check-production.sh
