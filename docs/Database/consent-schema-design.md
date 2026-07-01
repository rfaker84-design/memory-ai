# 授权合规数据库设计

## Decision

使用 consent_records 表管理亲人授权、素材授权、声音授权、数字人授权等合规记录。

## 字段

- id
- user_id
- memory_id
- consent_type
- status
- owner_name
- relationship_to_owner
- proof_url
- notes
- metadata
- created_at
- updated_at

## 规则

- 每条授权必须属于一个 memory
- 每条授权必须属于一个 user
- consent_type 可为 memory_profile / media_asset / voice_clone / avatar_generation / digital_human / commercial_use
- status 默认 pending，可为 approved / rejected / revoked
- 授权记录可以更新状态，不删除
- 后续需要接入审计日志记录授权变更
