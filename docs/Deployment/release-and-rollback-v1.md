# 忆见发布与回滚架构 V1

## 1. 发布前检查

- git status 清晰
- npm run build 成功
- 环境变量完整
- 数据库迁移已确认
- 健康检查 API 本地可构建

## 2. 发布流程

- git pull
- npm install
- npm run build
- pm2 restart yijian
- 执行生产检查脚本
- 验证首页和核心 API

## 3. 发布后检查

- https://yijianmemory.cn 可访问
- /api/health 正常
- /api/health/database 正常
- /api/health/ai 正常
- pm2 status online
- nginx -t 通过

## 4. 回滚原则

- 如果 build 失败，不重启 PM2
- 如果 PM2 启动失败，回退上一 commit
- 如果健康检查失败，立即回滚
- 回滚后重新执行生产检查

## 5. 回滚步骤

- git log --oneline
- git checkout 上一个稳定 commit
- npm install
- npm run build
- pm2 restart yijian
- 执行 check-production.sh
