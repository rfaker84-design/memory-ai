# 审计日志数据库设计

## Decision

使用 audit_logs 表记录系统关键行为和风险事件。

## 字段

- id
- user_id
- memory_id
- action
- level
- message
- metadata
- created_at

## 规则

- 审计日志只追加，不更新
- 审计日志默认不删除
- memory_id 可为空
- metadata 用于保存上下文
- critical 级别后续需要接入风险告警
