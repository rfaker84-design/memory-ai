#!/usr/bin/env bash
set -e

pwd
git pull
npm install
npm run build
pm2 restart yijian
pm2 status
