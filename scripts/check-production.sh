#!/usr/bin/env bash
set -e

curl -I https://yijianmemory.cn
curl -I https://yijianmemory.cn/api/health
curl -I https://yijianmemory.cn/api/health/database
curl -I https://yijianmemory.cn/api/health/ai
pm2 status
nginx -t
