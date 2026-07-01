# Media Database Apply Guide

## Step 1

打开 Supabase Project SQL Editor。

## Step 2

执行：

`supabase/sql/003_create_media_assets.sql`

## Step 3

确认 `media_assets` 表存在。

## Step 4

确认索引存在：

- `idx_media_assets_memory` 对 `memory_id`
- `idx_media_assets_user` 对 `user_id`
- `idx_media_assets_type` 对 `media_type`
- `idx_media_assets_created` 对 `created_at DESC`

确认外键：`memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE`。

## Warning

执行前必须确认当前 Supabase 项目是 MemoryAI 正式项目。

不要在错误项目执行 SQL。

## Rollback

本阶段不提供自动 rollback。

执行前建议导出数据库备份。
