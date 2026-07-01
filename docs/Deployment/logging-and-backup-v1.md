# 忆见日志与备份架构 V1

## 1. 日志目录规划

服务器目录：

```text
/home/ubuntu/logs/yijian/
```

- app.log
- error.log
- access.log
- deploy.log

## 2. PM2 日志

使用：

```bash
pm2 logs yijian
pm2 show yijian
```

## 3. Nginx 日志

标准路径：

```text
/var/log/nginx/access.log
/var/log/nginx/error.log
```

## 4. 应用日志原则

- API 错误必须可追踪
- 风险事件写入 risk_events
- 审计事件写入 audit_logs
- 生产环境不输出敏感密钥

## 5. 备份策略

需要备份：

- Supabase 数据库
- media_assets 记录
- 未来 COS 文件
- .env 配置由服务器安全保存，不进 Git

## 6. 备份频率

- 数据库：每日
- 媒体文件：每日增量
- 部署前：手动备份

## 7. 恢复原则

- 先恢复数据库
- 再恢复媒体文件
- 再回滚代码版本
