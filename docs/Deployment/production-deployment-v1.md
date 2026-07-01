# 忆见生产部署架构 V1

## 1. 生产环境

服务器：腾讯云 Ubuntu
域名：yijianmemory.cn
Web：Nginx
进程：PM2
应用：Next.js
项目目录：/home/ubuntu/memory-ai

## 2. 标准部署流程

```bash
git pull
npm install
npm run build
pm2 restart yijian
pm2 status
curl -I https://yijianmemory.cn
```

## 3. 禁止事项

- 不在服务器随意改业务代码
- 不直接改 node_modules
- 不跳过 build
- 不跳过 PM2 状态检查
- 不绕过 Git

## 4. 环境变量

`.env.local` / `.env.production` 由服务器保存，不提交仓库。

## 5. 回滚原则

先保留上一版本代码和构建结果。
部署失败立即回退上一 commit。

## 6. 上线前检查

- build 成功
- pm2 online
- nginx config ok
- https 可访问
- 首页可打开
- API 可访问
## 7. 健康检查

部署后检查以下健康检查接口：

- `/api/health`
- `/api/health/database`
- `/api/health/ai`

## 8. 发布失败处理

发布失败时执行 ollback-production.sh。

