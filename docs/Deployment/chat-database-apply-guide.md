# Chat Database Apply Guide

## Step 1

打开 Supabase Project SQL Editor。

## Step 2

先执行：

`supabase/sql/001_create_chat_tables.sql`

## Step 3

再执行：

`supabase/sql/002_alter_chat_messages_for_sessions.sql`

## Step 4

确认存在：

- `chat_sessions`
- `chat_messages.session_id`
- `chat_messages.tokens`
- `chat_messages.metadata`
- `chat_messages.updated_at`

## Warning

执行前必须确认当前 Supabase 项目是 MemoryAI 正式项目。

不要在错误项目执行 SQL。

## Rollback

本阶段不提供自动 rollback。

执行前建议导出数据库备份。
