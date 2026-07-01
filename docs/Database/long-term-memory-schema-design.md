# 长期记忆数据库设计

## Decision

使用 long_term_memories 表保存从聊天、素材、摘要中沉淀的长期记忆。

## 字段

- id
- user_id
- memory_id
- content
- source_type
- source_id
- importance
- tags
- embedding
- metadata
- created_at
- updated_at

## 规则

- 每条长期记忆必须属于一个 memory
- 每条长期记忆必须属于一个 user
- source_type 可为 chat / media / summary / manual
- importance 范围 0-100
- embedding 暂时允许为空，后续接入向量模型
- recall 优先按 memory_id 过滤
