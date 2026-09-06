# 忆见日志与备份：当前入口

更新：2026-09-06。旧文中的 PM2 `yijian`、Supabase 正式库与“未来 COS”是早期规划，已被正式 PostgreSQL/COS 路径替代；不能直接复制旧命令操作服务器。

## 现有实现

- 正式 PostgreSQL 备份入口：`scripts/backup/postgresql-to-cos.sh`。
- 安装与调度：`scripts/backup/install-postgresql-cos-backup-cron.sh`、`scripts/backup/memoryai-postgresql-cos-backup.cron`。
- 备份程序包含 dump 校验、上传后下载/SHA 校验及保留策略；安装器要求告警接入。生产媒体使用私有 COS；不得将应用日志、凭据或素材公开。
- 发布与回滚：`docs/Deployment/immutable-artifact-release-runbook.md` 和 `docs/Deployment/staging-web-immutable-runner.md`。必须使用当前版本化执行器。
- Staging 应用名称按既有合同为 `memoryai-staging`，Web 仅 loopback 3100；生产名称为 `memoryai`，两者不得混用。PID、current、rollback、容量和配置均需现场只读确认。

## 每次运行验收需要的证据

记录采集时间、环境、当前源码 SHA、Web/Worker 版本、数据库 schema、回滚 SHA、能力开关布尔状态，以及最后成功备份时间、校验结果、告警实际送达与最近隔离恢复时间。未知项写 UNKNOWN，不能用历史 PASS 填补。

复用已有发布 manifest、promotion journal、备份回执及 Operations 聚合；不再建立平行审批体系。仅摘录必要的状态和计数，不输出 PM2 环境、token、数据库连接串、验证码、照片、音频或聊天正文。

## 本轮边界

本轮只修正文档与可验证代码；未连接服务器、未安装/重启任务、未执行备份或恢复，不能由此声明今天的备份健康。Production 和不可逆操作仍沿用原授权要求。
