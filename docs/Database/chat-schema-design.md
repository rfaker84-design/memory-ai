# Chat Schema Design

## Decision

Chat Domain 使用两张表：
- chat_sessions
- chat_messages

## chat_sessions

字段：
- id
- memory_id
- user_id
- title
- summary
- last_message_at
- created_at
- updated_at

说明：
一个 Memory 可以有多个 chat_sessions。
一个 chat_session 只绑定一个 Memory。

## chat_messages

字段：
- id
- session_id
- memory_id
- user_id
- role
- content
- tokens
- metadata
- created_at

role：
- user
- assistant
- system

## Relationship

memory 1:N chat_sessions
chat_session 1:N chat_messages

## Rules

1. Chat Domain 不直接调用 LLM。
2. AI 回复由 Memory Engine 负责。
3. 所有消息必须属于一个 session。
4. 所有 session 必须属于一个 memory。
5. 不允许使用 memory_id 直接替代 session。

## Next Step

下一步由 CTO 审批后，再创建数据库 migration 或 SQL。

## Migration Plan

| File | Purpose |
| --- | --- |
| `supabase/sql/001_create_chat_tables.sql` | 目标建表脚本。创建 `chat_sessions` 和 `chat_messages`（V2 完整设计）。如果表已存在则为 no-op。 |
| `supabase/sql/002_alter_chat_messages_for_sessions.sql` | 安全 ALTER 迁移补丁。为现有 `chat_messages` 表补充 `session_id`（允许 NULL）、`tokens`、`metadata`、`updated_at` 字段，并添加必要索引。`chat_sessions` 如果不存在会先创建。 |

迁移执行顺序：
1. 先执行 `001_create_chat_tables.sql`
2. 再执行 `002_alter_chat_messages_for_sessions.sql`
