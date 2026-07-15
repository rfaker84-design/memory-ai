#!/bin/bash
# MemoryAI Production Deployment Script
# Run on Ubuntu 22.04+ server

set -e

APP_DIR="/opt/memoryai"
REPO_URL="git@github.com:your-org/memoryai.git"
BRANCH="main"

echo "=== MemoryAI Deployment ==="
echo "Target: $APP_DIR"
echo "Branch: $BRANCH"
echo ""

# 1. Clone or pull
if [ -d "$APP_DIR/.git" ]; then
  echo "[1/6] Pulling latest code..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
else
  echo "[1/6] Cloning repository..."
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
npm ci --production=false

# 3. Check .env.local
if [ ! -f ".env.local" ]; then
  echo "[3/6] .env.local not found! Creating from .env.example..."
  cp .env.example .env.local
  echo "  -> Edit .env.local with real values and re-run deploy.sh"
  exit 1
fi
echo "[3/6] .env.local exists"

# 4. Build
echo "[4/6] Building Next.js..."
npm run build

# 5. Setup PM2
echo "[5/6] Setting up PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi

mkdir -p logs

NGINX_CONFIG=$(sudo nginx -T 2>&1) || {
  echo "  -> Nginx configuration inspection FAILED"
  exit 1
}
if ! echo "$NGINX_CONFIG" | grep -Eq 'proxy_set_header[[:space:]]+X-Real-IP[[:space:]]+\$remote_addr;'; then
  echo "  -> Nginx must replace X-Real-IP with \$remote_addr"
  exit 1
fi

if pm2 list | grep -q memoryai; then
  echo "  -> Reloading existing process..."
  pm2 reload ecosystem.config.js --update-env
else
  echo "  -> Starting new process..."
  pm2 start ecosystem.config.js
fi

pm2 save

# 6. Verify
echo "[6/6] Verifying deployment..."
sleep 3
LISTENERS=$(ss -H -ltn 'sport = :3000')
if [ -z "$LISTENERS" ] || echo "$LISTENERS" | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]):3000$' >/dev/null; then
  echo "  -> Port 3000 is not loopback-only"
  exit 1
fi
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "  -> Health check PASSED"
else
  echo "  -> Health check FAILED - check logs/pm2-error.log"
fi

echo ""
echo "=== Deployment complete ==="
