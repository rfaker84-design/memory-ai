# 风险事件数据库设计

## Decision

使用 risk_events 表记录系统风险事件。

## 字段

- id
- user_id
- memory_id
- risk_type
- level
- message
- metadata
- created_at

## 规则

- 风险事件只追加，不更新
- risk_type 固定为 sensitive_content / high_frequency / unauthorized_access / ai_response_risk / missing_consent / payment_risk / system_abuse
- level 固定为 low / medium / high / critical
- critical 级别需要接入实时告警
- memory_id 可为空
