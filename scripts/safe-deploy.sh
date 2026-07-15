#!/bin/bash
# ================================================================
#  忆见 MemoryAI — 安全部署脚本
#  用法: bash scripts/safe-deploy.sh
#  目录: /opt/memoryai
# ================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PROD_DIR="/opt/memoryai"
BACKUP_DIR="/opt/memoryai-backups"
PM2_NAME="memoryai"

# ────────────────────────────────────────
# 1. 目录校验
# ────────────────────────────────────────
CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$PROD_DIR" ]; then
  echo -e "${RED}[FAIL] 当前目录不是 $PROD_DIR${NC}"
  echo "  当前: $CURRENT_DIR"
  echo "  请先执行: cd $PROD_DIR"
  exit 1
fi
echo -e "${GREEN}[OK] 目录确认: $PROD_DIR${NC}"

# ────────────────────────────────────────
# 2. 自动备份
# ────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
BACKUP_NAME="$BACKUP_DIR/backup-$TIMESTAMP"
echo -e "${YELLOW}[...] 正在备份到 $BACKUP_NAME${NC}"
# 只备份源码，不备份 node_modules
rsync -a --exclude 'node_modules' --exclude '.next' --exclude '.git' \
  "$PROD_DIR/" "$BACKUP_NAME/" 2>/dev/null || \
  cp -r "$PROD_DIR" "$BACKUP_NAME" 2>/dev/null

# 保留最近 5 个备份
BACKUP_COUNT=$(ls -1d "$BACKUP_DIR"/backup-* 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 5 ]; then
  ls -1dt "$BACKUP_DIR"/backup-* | tail -n +6 | xargs rm -rf
fi
echo -e "${GREEN}[OK] 备份完成 (保留最近5个)${NC}"

# ────────────────────────────────────────
# 3. 构建
# ────────────────────────────────────────
echo -e "${YELLOW}[...] npm run build ...${NC}"
if npm run build; then
  echo -e "${GREEN}[OK] build 成功${NC}"
else
  echo -e "${RED}[FAIL] build 失败 — 不重启 PM2${NC}"
  echo "  备份位置: $BACKUP_NAME"
  echo "  请修复错误后重新执行本脚本"
  exit 1
fi

# ────────────────────────────────────────
# 4. 重启 PM2
# ────────────────────────────────────────
NGINX_CONFIG=$(sudo nginx -T 2>&1) || {
  echo -e "${RED}[FAIL] 无法检查 Nginx 配置${NC}"
  exit 1
}
if ! echo "$NGINX_CONFIG" | grep -Eq 'proxy_set_header[[:space:]]+X-Real-IP[[:space:]]+\$remote_addr;'; then
  echo -e "${RED}[FAIL] Nginx 必须用 \$remote_addr 覆盖 X-Real-IP${NC}"
  exit 1
fi

echo -e "${YELLOW}[...] pm2 restart $PM2_NAME --update-env ...${NC}"
pm2 restart "$PM2_NAME" --update-env
sleep 3
pm2 status | grep "$PM2_NAME"
echo -e "${GREEN}[OK] PM2 已重启${NC}"

LISTENERS=$(ss -H -ltn 'sport = :3000')
if [ -z "$LISTENERS" ] || echo "$LISTENERS" | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]):3000$' >/dev/null; then
  echo -e "${RED}[FAIL] :3000 未仅绑定到回环地址${NC}"
  echo "$LISTENERS"
  exit 1
fi
echo -e "${GREEN}[OK] :3000 仅绑定回环地址${NC}"

# ────────────────────────────────────────
# 5. 验证
# ────────────────────────────────────────
echo -e "${YELLOW}[...] 验证服务 ...${NC}"

# 本地 3000
LOCAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3000 2>/dev/null || echo "000")
if [ "$LOCAL_CODE" = "200" ] || [ "$LOCAL_CODE" = "304" ]; then
  echo -e "${GREEN}[OK] 本地 :3000 → HTTP $LOCAL_CODE${NC}"
else
  echo -e "${RED}[FAIL] 本地 :3000 → HTTP $LOCAL_CODE${NC}"
fi

# 域名
DOMAIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://yijianmemory.cn 2>/dev/null || echo "000")
if [ "$DOMAIN_CODE" = "200" ] || [ "$DOMAIN_CODE" = "304" ]; then
  echo -e "${GREEN}[OK] yijianmemory.cn → HTTP $DOMAIN_CODE${NC}"
else
  echo -e "${RED}[FAIL] yijianmemory.cn → HTTP $DOMAIN_CODE${NC}"
fi

# 综合判定
if [ "$DOMAIN_CODE" = "200" ] || [ "$DOMAIN_CODE" = "304" ]; then
  echo ""
  echo "============================================"
  echo -e "  ${GREEN}✓ 部署成功${NC}"
  echo "  备份: $BACKUP_NAME"
  echo "  https://yijianmemory.cn"
  echo "============================================"
  exit 0
else
  echo ""
  echo "============================================"
  echo -e "  ${RED}✗ 部署异常 — 域名不可达${NC}"
  echo "  本地状态: HTTP $LOCAL_CODE"
  echo "  域名状态: HTTP $DOMAIN_CODE"
  echo "  备份位置: $BACKUP_NAME"
  echo ""
  echo "  排查步骤:"
  echo "    1. pm2 logs memoryai --lines 30"
  echo "    2. sudo nginx -t && sudo systemctl reload nginx"
  echo "    3. curl -I http://127.0.0.1:3000"
  echo ""
  echo "  修复前不要再执行本脚本"
  echo "============================================"
  exit 1
fi
